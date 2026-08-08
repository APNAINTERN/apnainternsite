/**
 * CORS allowlist for Express API (Lambda / local aws:api).
 */

const DEFAULT_ORIGINS = [
  "https://apnaintern.in",
  "https://www.apnaintern.in",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
];

function extraOrigins(): string[] {
  return String(process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

export function isAllowedCorsOrigin(origin: string): boolean {
  if (!origin) return false;
  const allowed = new Set([...DEFAULT_ORIGINS, ...extraOrigins()]);
  if (allowed.has(origin)) return true;
  if (origin.endsWith(".vercel.app") && process.env.ALLOW_VERCEL_PREVIEW_CORS === "true") {
    return true;
  }
  return false;
}

export function applyCorsToResponse(
  origin: string,
  setHeader: (name: string, value: string) => void
): void {
  if (origin && isAllowedCorsOrigin(origin)) {
    setHeader("Access-Control-Allow-Origin", origin);
    setHeader("Access-Control-Allow-Credentials", "true");
    setHeader("Vary", "Origin");
  } else if (!origin) {
    setHeader("Access-Control-Allow-Origin", "*");
  }
}

export function applySecurityHeaders(setHeader: (name: string, value: string) => void): void {
  setHeader("X-Content-Type-Options", "nosniff");
  setHeader("X-Frame-Options", "DENY");
  setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}
