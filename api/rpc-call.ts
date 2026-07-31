/**
 * Generic RPC → RDS bridge.
 * POST /api/rpc/:name  body: { ...named args matching Postgres function params }
 *
 * Registry entries: known auth level + fixed arg order.
 * When RDS_RPC_OPEN=true (local default via .env.awsrds.local): any public.*
 * function on RDS can be called (arg order discovered from pg_catalog).
 * Auth/admin-named functions still require a Bearer token.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { callRpc, callRpcAuto, type JwtClaims } from "../aws/server/db";
import { getRpcDef, type RpcAuth } from "../aws/server/rpc-registry";
import { verifyToken } from "../aws/server/local-jwt";

function jwtFromRequest(req: VercelRequest): JwtClaims | null {
  const h = req.headers.authorization || req.headers.Authorization;
  const auth = Array.isArray(h) ? h[0] : h;
  const m = auth ? String(auth).match(/^Bearer\s+(.+)$/i) : null;
  if (!m) return null;
  const payload = verifyToken(m[1]);
  if (!payload?.sub) return null;
  return {
    sub: String(payload.sub),
    email: payload.email ? String(payload.email) : undefined,
    role: payload.role ? String(payload.role) : "authenticated",
  };
}

function getRpcName(req: VercelRequest): string {
  const q = req.query?.name;
  if (typeof q === "string" && q) return q;
  if (Array.isArray(q) && q[0]) return q[0];
  const p = (req as VercelRequest & { params?: { name?: string } }).params?.name;
  return p || "";
}

function requireAuth(
  req: VercelRequest
): { ok: true } | { ok: false; status: number; message: string } {
  const h = req.headers.authorization || req.headers.Authorization;
  const auth = Array.isArray(h) ? h[0] : h;
  if (!auth || !String(auth).startsWith("Bearer ")) {
    return { ok: false, status: 401, message: "Authorization Bearer token required" };
  }
  return { ok: true };
}

function inferAuth(name: string): RpcAuth {
  if (
    name.startsWith("admin_") ||
    name.startsWith("college_admin_") ||
    name === "remove_staff_access" ||
    name === "delete_college_admin"
  ) {
    return "admin";
  }
  if (
    name.startsWith("student_") ||
    name.startsWith("list_") ||
    name.startsWith("referral_partner_") ||
    name.startsWith("finalize_") ||
    name.startsWith("ensure_") ||
    name.startsWith("sync_") ||
    name.startsWith("submit_") ||
    name.startsWith("get_assignment") ||
    name === "complete_student_registration" ||
    name === "apply_student_registration_password" ||
    name === "claim_prefilled_student" ||
    name === "claim_college_roster_row"
  ) {
    // Most of these need a session; repair_student_auth_login is registry public
    return "auth";
  }
  return "public";
}

const OPEN = () => String(process.env.RDS_RPC_OPEN || "").toLowerCase() === "true";

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
    res.status(503).json({
      error: "DATABASE_URL not configured",
      hint: "Set DATABASE_URL in .env.awsrds.local / Lambda env (RDS connection string)",
    });
    return;
  }

  const name = getRpcName(req);
  if (!name) {
    res.status(400).json({ error: "Missing RPC name" });
    return;
  }

  const def = getRpcDef(name);
  if (!def && !OPEN()) {
    res.status(404).json({
      error: `RPC '${name}' is not exposed`,
      hint: "Add it to aws/server/rpc-registry.ts, or set RDS_RPC_OPEN=true for local testing",
    });
    return;
  }

  const authLevel: RpcAuth = def?.auth ?? inferAuth(name);
  if (authLevel === "auth" || authLevel === "admin") {
    const gate = requireAuth(req);
    if (!gate.ok) {
      res.status(gate.status).json({ error: gate.message });
      return;
    }
  }

  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<
    string,
    unknown
  >;

  try {
    const jwt = jwtFromRequest(req);
    const data = def
      ? await callRpc(name, def.args, body, jwt)
      : await callRpcAuto(name, body, jwt);
    res.status(200).json({ data, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[rpc/${name}]`, message);
    const status = /ECONNREFUSED|timeout|DATABASE_URL/i.test(message) ? 503 : 400;
    res.status(status).json({ data: null, error: { message } });
  }
}
