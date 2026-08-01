/**
 * Shared Express app for local dev, Docker, and AWS Lambda (via serverless-http).
 */
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import adminRegister from "../../api/admin-register";
import adminTasks from "../../api/admin-tasks";
import forgotPassword from "../../api/auth/forgot-password";
import debugEnv from "../../api/debug-env";
import geminiGenerate from "../../api/gemini-generate";
import createOrder from "../../api/payment/create-order";
import paymentStatus from "../../api/payment/status";
import paymentVerify from "../../api/payment/verify";
import paymentWebhook from "../../api/payment/webhook";
import razorpayRecovery from "../../api/razorpay-recovery";
import sendBulkMail from "../../api/send-bulk-mail";
import sendMail from "../../api/send-mail";
import rpcByName from "../../api/rpc-call";
import dataSelect from "../../api/data-select";
import dataBatchSelect from "../../api/data-batch-select";
import { loadRootEnv } from "./load-env";
import {
  authLogout,
  authSettings,
  authSignup,
  authToken,
  authUser,
} from "./local-auth";
import {
  restDelete,
  restGet,
  restPatch,
  restPost,
  restRpc,
} from "./local-rest";
import { handleStorageRequest, storageRawBody } from "./s3-storage";

loadRootEnv();

type ApiHandler = (req: VercelRequest, res: VercelResponse) => Promise<unknown> | unknown;

function asVercelHandler(handler: ApiHandler) {
  return async (req: Request, res: Response) => {
    await handler(req as unknown as VercelRequest, res as unknown as VercelResponse);
  };
}

let appPromise: Promise<Express> | null = null;

/** Build app once (cached for Lambda warm starts). */
export function createApp(): Promise<Express> {
  if (!appPromise) {
    appPromise = buildApp();
  }
  return appPromise;
}

async function buildApp(): Promise<Express> {
  const app = express();

  // Storage uploads may be raw binary or multipart — before JSON parser
  app.use(storageRawBody);

  app.use(express.json({ limit: "2mb" }));

  const stagePrefix = process.env.AWS_STAGE ? `/${process.env.AWS_STAGE}` : "";
  if (stagePrefix) {
    app.use((req, _res, next) => {
      if (req.url === stagePrefix) {
        req.url = "/";
      } else if (req.url.startsWith(`${stagePrefix}/`)) {
        req.url = req.url.slice(stagePrefix.length) || "/";
      }
      next();
    });
  }

  // CORS — reflect Origin. Do not use "*" with credentials (browser rejects).
  // Prefer Express-only CORS (disable API Gateway CorsConfiguration) so Origin is preserved.
  app.use((req, res, next) => {
    const origin = String(req.headers.origin || "").trim();
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    } else {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,OPTIONS,POST,PUT,PATCH,DELETE,HEAD"
    );
    const requested = String(req.headers["access-control-request-headers"] || "").trim();
    res.setHeader(
      "Access-Control-Allow-Headers",
      requested ||
        "Authorization, Content-Type, apikey, Prefer, X-Client-Info, X-Supabase-Api-Version, X-Requested-With, Accept, X-CSRF-Token, x-razorpay-signature"
    );
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Range, Prefer, X-Total-Count"
    );
    res.setHeader("Access-Control-Max-Age", "86400");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  const localSupabase =
    Boolean(process.env.DATABASE_URL) &&
    String(process.env.LOCAL_SUPABASE || "true").toLowerCase() !== "false";

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "ezyintern-aws-api",
      runtime: process.env.AWS_LAMBDA_FUNCTION_NAME ? "lambda" : "node",
      databaseMode: process.env.DATABASE_URL ? "rds" : "none",
      localSupabase,
      s3: Boolean(process.env.S3_BUCKET_CONSENT_FORMS || process.env.AWS_ACCESS_KEY_ID),
      smtp: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS),
      supabase: false,
    });
  });

  // ── Local Supabase-compatible surface (Auth + PostgREST → RDS) ────────────
  // Point VITE_SUPABASE_URL=http://localhost:3000 so the browser never hits
  // *.supabase.co during local AWS testing.
  if (localSupabase) {
    app.get("/auth/v1/settings", authSettings);
    app.get("/auth/v1/health", (_req, res) => res.json({ version: "local", name: "GoTrue" }));
    app.post("/auth/v1/token", authToken);
    app.get("/auth/v1/user", authUser);
    app.post("/auth/v1/logout", authLogout);
    app.post("/auth/v1/signup", authSignup);

    app.get("/rest/v1/:table", restGet);
    app.head("/rest/v1/:table", restGet);
    app.post("/rest/v1/:table", restPost);
    app.patch("/rest/v1/:table", restPatch);
    app.delete("/rest/v1/:table", restDelete);
    app.post("/rest/v1/rpc/:name", restRpc);

    app.all("/storage/v1/*", handleStorageRequest);
    app.get("/realtime/v1/*", (_req, res) => res.status(501).end());
  }

  const routes: Array<{ method: "all" | "get" | "post"; path: string; handler: ApiHandler }> = [
    { method: "post", path: "/api/send-mail", handler: sendMail },
    { method: "post", path: "/api/send-bulk-mail", handler: sendBulkMail },
    { method: "post", path: "/api/gemini-generate", handler: geminiGenerate },
    { method: "post", path: "/api/gemini/generate", handler: geminiGenerate },
    { method: "post", path: "/api/auth/forgot-password", handler: forgotPassword },
    { method: "post", path: "/api/admin-register", handler: adminRegister },
    { method: "all", path: "/api/admin-tasks", handler: adminTasks },
    { method: "post", path: "/api/razorpay-recovery", handler: razorpayRecovery },
    { method: "post", path: "/api/payment/create-order", handler: createOrder },
    { method: "post", path: "/api/payment/verify", handler: paymentVerify },
    { method: "post", path: "/api/payment/webhook", handler: paymentWebhook },
    { method: "get", path: "/api/payment/status", handler: paymentStatus },
  ];

  if (process.env.NODE_ENV !== "production") {
    routes.push({ method: "get", path: "/api/debug-env", handler: debugEnv });
  }

  for (const route of routes) {
    const wrapped = asVercelHandler(route.handler);
    if (route.method === "all") app.all(route.path, wrapped);
    else if (route.method === "get") app.get(route.path, wrapped);
    else app.post(route.path, wrapped);
  }

  // Legacy Supabase Edge Function name → same handler as /api/send-mail
  app.post("/functions/v1/resend-email", asVercelHandler(sendMail));

  // RPC → RDS bridge (also supports Express :name param)
  const rpcHandler = asVercelHandler(rpcByName);
  app.post("/api/rpc/:name", (req, res) => {
    (req as { query: Record<string, unknown> }).query = {
      ...(req.query || {}),
      name: req.params.name,
    };
    return rpcHandler(req, res);
  });
  app.post("/api/rpc", rpcHandler);

  // Whitelisted table reads against RDS (local testing / Phase 2)
  app.post("/api/data/select", asVercelHandler(dataSelect));
  app.post("/api/data/batch-select", asVercelHandler(dataBatchSelect));

  // Keep CORS on late errors / unhandled failures (browsers otherwise report a false CORS block).
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    const origin = String(req.headers.origin || "").trim();
    if (origin && !res.getHeader("Access-Control-Allow-Origin")) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
    }
    if (res.headersSent) {
      next(err);
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("[express]", message);
    res.status(500).json({ message, code: "XX000" });
  });

  return app;
}
