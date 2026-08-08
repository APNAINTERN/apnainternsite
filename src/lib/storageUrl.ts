/**
 * Rewrite legacy Supabase Storage URLs to the local Express shim (→ S3) or direct S3.
 */
import { resolveSupabaseUrl } from "@/lib/supabaseEnv";

const STORAGE_PUBLIC_RE = /\/storage\/v1\/object\/public\/([^/?#]+)\/([^?#]+)/;

/** App bucket name → S3 bucket (staging defaults; override via Vite env). */
const APP_BUCKET_TO_S3: Record<string, string> = {
  logos: import.meta.env.VITE_S3_BUCKET_LOGOS || "ezyintern-staging-logos",
  "consent-forms": import.meta.env.VITE_S3_BUCKET_CONSENT_FORMS || "ezyintern-staging-consent-forms",
  "learning-materials":
    import.meta.env.VITE_S3_BUCKET_LEARNING_MATERIALS || "ezyintern-staging-learning-materials",
  "assignment-uploads":
    import.meta.env.VITE_S3_BUCKET_ASSIGNMENT_UPLOADS || "ezyintern-staging-learning-materials",
};

const S3_REGION = import.meta.env.VITE_AWS_REGION || "ap-south-1";

function splitUrlParts(url: string): { base: string; suffix: string } {
  const qIndex = url.search(/[?#]/);
  if (qIndex < 0) return { base: url, suffix: "" };
  return { base: url.slice(0, qIndex), suffix: url.slice(qIndex) };
}

function toDirectS3Url(appBucket: string, objectPath: string): string | null {
  const s3Bucket = APP_BUCKET_TO_S3[appBucket];
  if (!s3Bucket) return null;
  const key = objectPath
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map((p) => {
      try {
        return encodeURIComponent(decodeURIComponent(p));
      } catch {
        return encodeURIComponent(p);
      }
    })
    .join("/");
  return `https://${s3Bucket}.s3.${S3_REGION}.amazonaws.com/${key}`;
}

export function resolveStorageUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  const { base, suffix } = splitUrlParts(trimmed);

  const m = base.match(STORAGE_PUBLIC_RE);
  if (m) {
    const [, bucket, objectPath] = m;
    let path = objectPath;
    try {
      path = decodeURIComponent(objectPath);
    } catch {
      /* keep raw */
    }

    // Prefer direct public S3 URL (reliable for <img>/PDF; avoids API Gateway quirks)
    const direct = toDirectS3Url(bucket, path);
    if (direct) return `${direct}${suffix}`;

    if (trimmed.includes("supabase.co")) {
      const apiBase = resolveSupabaseUrl();
      if (apiBase && !apiBase.includes("supabase.co")) {
        return `${apiBase}/storage/v1/object/public/${bucket}/${path}${suffix}`;
      }
      const s3Base = (import.meta.env.VITE_S3_PUBLIC_BASE_URL || "").replace(/\/$/, "");
      if (s3Base) return `${s3Base}/${path}${suffix}`;
    }
  }

  if (!trimmed.includes("supabase.co")) return trimmed;

  const m2 = base.match(STORAGE_PUBLIC_RE);
  if (!m2) return trimmed;

  const [, bucket, objectPath] = m2;
  let path = objectPath;
  try {
    path = decodeURIComponent(objectPath);
  } catch {
    /* keep raw */
  }

  const apiBase = resolveSupabaseUrl();
  if (apiBase && !apiBase.includes("supabase.co")) {
    return `${apiBase}/storage/v1/object/public/${bucket}/${path}${suffix}`;
  }

  const s3Base = (import.meta.env.VITE_S3_PUBLIC_BASE_URL || "").replace(/\/$/, "");
  if (s3Base) {
    return `${s3Base}/${path}${suffix}`;
  }

  return trimmed;
}

/** Build a public URL for a freshly uploaded object. */
export function publicStorageObjectUrl(appBucket: string, objectPath: string): string {
  const cleanPath = objectPath.replace(/^\/+/, "").split(/[?#]/)[0];
  const direct = toDirectS3Url(appBucket, cleanPath);
  if (direct) return direct;
  const apiBase = resolveSupabaseUrl();
  if (apiBase) {
    return `${apiBase}/storage/v1/object/public/${appBucket}/${cleanPath}`;
  }
  return cleanPath;
}

/**
 * Candidate public URLs for a storage object.
 * Legacy S3 sync often stored basename-only keys while DB keeps `uploaderId/file.pdf`.
 */
export function storageObjectUrlCandidates(
  appBucket: string,
  filePath?: string | null,
  fileUrl?: string | null
): string[] {
  const out: string[] = [];
  const add = (u?: string | null) => {
    const v = (u || "").trim();
    if (v && !out.includes(v)) out.push(v);
  };

  const path = (filePath || "").replace(/^\/+/, "").split(/[?#]/)[0];
  if (path) {
    const base = path.split("/").filter(Boolean).pop();
    // Prefer basename first: legacy S3 sync used flat keys while DB kept uploaderId/file.
    if (base && base !== path) add(publicStorageObjectUrl(appBucket, base));
    add(publicStorageObjectUrl(appBucket, path));
  }

  if (fileUrl?.trim()) {
    add(resolveStorageUrl(fileUrl));
    const m = fileUrl.trim().match(STORAGE_PUBLIC_RE);
    if (m) {
      let objectPath = m[2];
      try {
        objectPath = decodeURIComponent(objectPath);
      } catch {
        /* keep */
      }
      objectPath = objectPath.split(/[?#]/)[0];
      add(publicStorageObjectUrl(m[1] || appBucket, objectPath));
      const base = objectPath.split("/").filter(Boolean).pop();
      if (base && base !== objectPath) add(publicStorageObjectUrl(m[1] || appBucket, base));
    }
  }

  return out;
}

/** Return the first URL that responds OK (GET). Falls back to the first candidate. */
export async function pickWorkingStorageUrl(candidates: string[]): Promise<string | null> {
  const list = candidates.map((u) => u.trim()).filter(Boolean);
  if (list.length === 0) return null;
  for (const url of list) {
    try {
      const res = await fetch(url, { method: "GET", mode: "cors" });
      if (res.ok) return url;
    } catch {
      /* try next */
    }
  }
  return list[0];
}

/** Trigger a file download (works cross-origin when S3/CORS allows fetch). */
export async function downloadStorageFile(url: string, filename: string): Promise<void> {
  const cleanName = filename.trim() || "download";
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = cleanName;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/** Try multiple candidate URLs until one downloads successfully. */
export async function downloadStorageFileWithFallback(
  candidates: string[],
  filename: string
): Promise<void> {
  const list = candidates.map((u) => u.trim()).filter(Boolean);
  if (list.length === 0) throw new Error("No download URL available.");
  let lastErr: unknown = null;
  for (const url of list) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename.trim() || "download";
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  window.open(list[0], "_blank", "noopener,noreferrer");
  if (lastErr) throw lastErr;
}
