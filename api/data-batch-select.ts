/**
 * POST /api/data/batch-select — multiple whitelisted SELECTs in one Lambda call.
 * Requires admin JWT (used by admin dashboard bootstrap).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runBatchSelect, type BatchQuerySpec } from "../aws/server/data-batch-select";
import {
  applyCorsHeaders,
  applySecurityHeaders,
  BLOCKED_SENSITIVE_TABLES,
  requireAdmin,
} from "./lib/apiSecurity";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCorsHeaders(req, res);
  applySecurityHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!process.env.DATABASE_URL) {
    res.status(503).json({ error: "DATABASE_URL not configured" });
    return;
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const body = (req.body && typeof req.body === "object" ? req.body : {}) as {
    queries?: BatchQuerySpec[];
  };

  const queries = Array.isArray(body.queries) ? body.queries : [];
  if (!queries.length || queries.length > 20) {
    res.status(400).json({ error: "Provide 1–20 queries" });
    return;
  }

  for (const q of queries) {
    const table = String(q.table || "").trim();
    if (BLOCKED_SENSITIVE_TABLES.has(table)) {
      res.status(403).json({ error: `Table '${table}' is not allowed via batch-select` });
      return;
    }
  }

  try {
    const results = await runBatchSelect(queries);
    res.status(200).json({ results, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[data/batch-select]", message);
    res.status(400).json({ results: null, error: { message } });
  }
}
