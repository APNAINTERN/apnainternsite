/**
 * Shared API security helpers (auth, CORS, rate limits, escaping).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "../../aws/server/db";
import { verifyToken } from "../../aws/server/local-jwt";

export type ApiAuthUser = {
  id: string;
  email: string;
  roles: string[];
};

const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const STAFF_ROLES = new Set(["admin", "super_admin", "staff"]);

const DEFAULT_CORS_ORIGINS = [
  "https://apnaintern.in",
  "https://www.apnaintern.in",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
];

function extraCorsOrigins(): string[] {
  const raw = process.env.CORS_ALLOWED_ORIGINS || "";
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

export function isAllowedCorsOrigin(origin: string): boolean {
  if (!origin) return false;
  const allowed = new Set([...DEFAULT_CORS_ORIGINS, ...extraCorsOrigins()]);
  if (allowed.has(origin)) return true;
  if (origin.endsWith(".vercel.app") && process.env.ALLOW_VERCEL_PREVIEW_CORS === "true") {
    return true;
  }
  return false;
}

export function applyCorsHeaders(req: VercelRequest, res: VercelResponse): void {
  const origin = String(req.headers.origin || "").trim();
  if (origin && isAllowedCorsOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
}

export function applySecurityHeaders(res: VercelResponse): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("X-XSS-Protection", "0");
}

export function getBearerToken(req: VercelRequest): string | null {
  const h = req.headers.authorization || req.headers.Authorization;
  const auth = Array.isArray(h) ? h[0] : h;
  const m = auth ? String(auth).match(/^Bearer\s+(.+)$/i) : null;
  return m?.[1]?.trim() || null;
}

async function loadRolesForUser(userId: string): Promise<string[]> {
  const { rows } = await query<{ role: string }>(
    `SELECT role FROM public.user_roles WHERE user_id = $1`,
    [userId]
  );
  return rows.map((r) => String(r.role));
}

export async function authenticateRequest(
  req: VercelRequest
): Promise<ApiAuthUser | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload?.sub) return null;

  const userId = String(payload.sub);
  const metaRoles = payload.app_metadata?.roles;
  let roles: string[] = Array.isArray(metaRoles)
    ? metaRoles.map((r) => String(r))
    : [];

  if (!roles.length) {
    try {
      roles = await loadRolesForUser(userId);
    } catch {
      roles = [];
    }
  }

  return {
    id: userId,
    email: String(payload.email || ""),
    roles,
  };
}

export function hasAdminRole(roles: string[]): boolean {
  return roles.some((r) => ADMIN_ROLES.has(r));
}

export function hasStaffRole(roles: string[]): boolean {
  return roles.some((r) => STAFF_ROLES.has(r));
}

export async function requireAdmin(
  req: VercelRequest,
  res: VercelResponse
): Promise<ApiAuthUser | null> {
  applyCorsHeaders(req, res);
  applySecurityHeaders(res);

  const user = await authenticateRequest(req);
  if (!user) {
    res.status(401).json({ success: false, error: "Authorization required" });
    return null;
  }
  if (!hasAdminRole(user.roles)) {
    res.status(403).json({ success: false, error: "Admin access required" });
    return null;
  }
  return user;
}

export async function requireStaffOrAdmin(
  req: VercelRequest,
  res: VercelResponse
): Promise<ApiAuthUser | null> {
  applyCorsHeaders(req, res);
  applySecurityHeaders(res);

  const user = await authenticateRequest(req);
  if (!user) {
    res.status(401).json({ success: false, error: "Authorization required" });
    return null;
  }
  if (!hasStaffRole(user.roles)) {
    res.status(403).json({ success: false, error: "Staff access required" });
    return null;
  }
  return user;
}

export async function requireAuth(
  req: VercelRequest,
  res: VercelResponse
): Promise<ApiAuthUser | null> {
  applyCorsHeaders(req, res);
  applySecurityHeaders(res);

  const user = await authenticateRequest(req);
  if (!user) {
    res.status(401).json({ success: false, error: "Authorization required" });
    return null;
  }
  return user;
}

/** Tables that must never be read via unauthenticated batch/select shortcuts. */
export const BLOCKED_SENSITIVE_TABLES = new Set([
  "payment_config",
  "payment_orders",
  "staff_auth_sessions",
  "password_resets",
]);

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();

export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (bucket.count >= max) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { ok: true };
}

export function clientIp(req: VercelRequest): string {
  const xf = req.headers["x-forwarded-for"];
  const raw = Array.isArray(xf) ? xf[0] : xf;
  return String(raw || req.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isProductionRuntime(): boolean {
  return Boolean(
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AWS_EXECUTION_ENV ||
      process.env.NODE_ENV === "production"
  );
}
