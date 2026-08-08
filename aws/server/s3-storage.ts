/**
 * Supabase Storage-compatible API → AWS S3 (local RDS mode).
 */
import type { Request, Response, NextFunction } from "express";
import Busboy from "busboy";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { verifyToken } from "./local-jwt";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-south-1";

const BUCKET_MAP: Record<string, string> = {
  "consent-forms": process.env.S3_BUCKET_CONSENT_FORMS || "ezyintern-staging-consent-forms",
  logos: process.env.S3_BUCKET_LOGOS || "ezyintern-staging-logos",
  "learning-materials":
    process.env.S3_BUCKET_LEARNING_MATERIALS || "ezyintern-staging-learning-materials",
  "assignment-uploads":
    process.env.S3_BUCKET_ASSIGNMENT_UPLOADS || "ezyintern-staging-learning-materials",
};

let s3: S3Client | null = null;

function getS3(): S3Client {
  if (!s3) s3 = new S3Client({ region: REGION });
  return s3;
}

function resolveS3Bucket(appBucket: string): string | null {
  return BUCKET_MAP[appBucket] || null;
}

export function publicObjectUrl(appBucket: string, objectKey: string): string {
  const s3Bucket = resolveS3Bucket(appBucket);
  if (!s3Bucket) return "";
  const key = objectKey.replace(/^\/+/, "");
  return `https://${s3Bucket}.s3.${REGION}.amazonaws.com/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function storageSubPath(req: Request): string {
  const full = req.originalUrl.split("?")[0];
  const idx = full.indexOf("/storage/v1/");
  return idx >= 0 ? full.slice(idx + "/storage/v1/".length) : "";
}

async function readUploadBody(req: Request): Promise<{ buffer: Buffer; contentType: string }> {
  const ct = String(req.headers["content-type"] || "application/octet-stream");

  if (ct.includes("multipart/form-data")) {
    return new Promise((resolve, reject) => {
      const busboy = Busboy({ headers: req.headers });
      let fileBuffer: Buffer | null = null;
      let fileType = "application/octet-stream";

      busboy.on("file", (_name, stream, info) => {
        fileType = info.mimeType || fileType;
        const chunks: Buffer[] = [];
        stream.on("data", (c: Buffer) => chunks.push(c));
        stream.on("end", () => {
          fileBuffer = Buffer.concat(chunks);
        });
      });
      busboy.on("finish", () => {
        if (!fileBuffer) reject(new Error("No file in upload"));
        else resolve({ buffer: fileBuffer, contentType: fileType });
      });
      busboy.on("error", reject);
      req.pipe(busboy);
    });
  }

  if (Buffer.isBuffer(req.body)) {
    return { buffer: req.body, contentType: ct };
  }

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => resolve());
    req.on("error", reject);
  });
  return { buffer: Buffer.concat(chunks), contentType: ct };
}

export function storageRawBody(req: Request, res: Response, next: NextFunction) {
  if (!req.originalUrl.startsWith("/storage/v1/object/")) return next();
  if (req.method !== "POST" && req.method !== "PUT") return next();
  if (String(req.headers["content-type"] || "").includes("multipart/form-data")) return next();

  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(Buffer.from(c)));
  req.on("end", () => {
    (req as Request & { body: Buffer }).body = Buffer.concat(chunks);
    next();
  });
  req.on("error", next);
}

function requireStorageAuth(req: Request, res: Response): string | null {
  const auth = String(req.headers.authorization || "");
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    res.status(401).json({ error: "Authorization required for storage mutations" });
    return null;
  }
  const payload = verifyToken(m[1]);
  if (!payload?.sub) {
    res.status(401).json({ error: "Invalid or expired token" });
    return null;
  }
  return String(payload.sub);
}

export async function handleStorageRequest(req: Request, res: Response) {
  const sub = storageSubPath(req);
  const parts = sub.split("/").filter(Boolean);

  try {
    // GET/HEAD public object → redirect to S3
    if (
      (req.method === "GET" || req.method === "HEAD") &&
      parts[0] === "object" &&
      parts[1] === "public"
    ) {
      const appBucket = parts[2];
      const objectKey = decodeURIComponent(parts.slice(3).join("/"));
      const url = publicObjectUrl(appBucket, objectKey);
      if (!url) {
        res.status(404).json({ error: "Bucket not found" });
        return;
      }
      res.redirect(302, url);
      return;
    }

    // LIST buckets
    if (req.method === "GET" && parts[0] === "bucket") {
      res.json(
        Object.keys(BUCKET_MAP).map((name) => ({ id: name, name, public: true }))
      );
      return;
    }

    // DELETE objects
    if (req.method === "DELETE" && parts[0] === "object" && parts.length >= 2) {
      if (!requireStorageAuth(req, res)) return;
      const appBucket = parts[1];
      const s3Bucket = resolveS3Bucket(appBucket);
      if (!s3Bucket) {
        res.status(404).json({ error: "Bucket not found" });
        return;
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const prefixes: string[] = Array.isArray(body.prefixes)
        ? body.prefixes.map(String)
        : [];
      if (!prefixes.length) {
        res.status(400).json({ error: "prefixes required" });
        return;
      }
      if (prefixes.length === 1) {
        await getS3().send(
          new DeleteObjectCommand({ Bucket: s3Bucket, Key: prefixes[0].replace(/^\/+/, "") })
        );
      } else {
        await getS3().send(
          new DeleteObjectsCommand({
            Bucket: s3Bucket,
            Delete: { Objects: prefixes.map((p) => ({ Key: p.replace(/^\/+/, "") })) },
          })
        );
      }
      res.status(200).json([]);
      return;
    }

    // POST/PUT upload: object/{bucket}/{key...}
    if (
      (req.method === "POST" || req.method === "PUT") &&
      parts[0] === "object" &&
      parts.length >= 3
    ) {
      if (!requireStorageAuth(req, res)) return;
      const appBucket = parts[1];
      const objectKey = parts.slice(2).join("/");
      const s3Bucket = resolveS3Bucket(appBucket);
      if (!s3Bucket) {
        res.status(404).json({ error: "Bucket not found", message: appBucket });
        return;
      }
      const { buffer, contentType } = await readUploadBody(req);
      if (buffer.length > MAX_UPLOAD_BYTES) {
        res.status(413).json({ error: "File too large", maxBytes: MAX_UPLOAD_BYTES });
        return;
      }
      await getS3().send(
        new PutObjectCommand({
          Bucket: s3Bucket,
          Key: objectKey,
          Body: buffer,
          ContentType: contentType,
        })
      );
      res.status(200).json({ Key: `${s3Bucket}/${objectKey}`, Id: objectKey });
      return;
    }

    res.status(404).json({ error: "not_found", message: `Storage route not implemented: ${sub}` });
  } catch (err) {
    console.error("[s3/storage]", err);
    res.status(500).json({
      statusCode: "500",
      error: "storage_error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
