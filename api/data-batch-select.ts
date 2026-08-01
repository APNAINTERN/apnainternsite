/**
 * POST /api/data/batch-select — multiple whitelisted SELECTs in one Lambda call.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runBatchSelect, type BatchQuerySpec } from "../aws/server/data-batch-select";

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

  const body = (req.body && typeof req.body === "object" ? req.body : {}) as {
    queries?: BatchQuerySpec[];
  };

  const queries = Array.isArray(body.queries) ? body.queries : [];
  if (!queries.length || queries.length > 20) {
    res.status(400).json({ error: "Provide 1–20 queries" });
    return;
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
