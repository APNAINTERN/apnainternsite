import { AWS_STAGING_API_ORIGIN } from "../../shared/aws";

/**
 * API base URL for the frontend.
 *
 * | File / mode        | API target                          |
 * |--------------------|-------------------------------------|
 * | `.env.local`       | Local proxy → localhost:3000        |
 * | `.env.aws.local`   | AWS Lambda (deployed)               |
 * | Production Vercel  | Lambda when VITE_SITE_API_ORIGIN set |
 */
export function getSiteApiOrigin(): string {
  if (typeof window === "undefined") return "";
  const fromEnv = import.meta.env.VITE_SITE_API_ORIGIN as string | undefined;
  if (fromEnv?.trim()) return fromEnv.trim().replace(/\/$/, "");
  const appUrl = import.meta.env.VITE_PUBLIC_APP_URL as string | undefined;
  if (appUrl?.trim()) return appUrl.trim().replace(/\/$/, "");
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
  if (/execute-api\.amazonaws\.com/i.test(supabaseUrl)) {
    return supabaseUrl.replace(/\/$/, "");
  }
  if (!import.meta.env.VITE_SUPABASE_URL?.trim()) {
    return AWS_STAGING_API_ORIGIN;
  }
  return "";
}

/** Build full API path — relative on prod, absolute when `VITE_SITE_API_ORIGIN` is set. */
export function siteApiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const origin = getSiteApiOrigin();
  return origin ? `${origin}${p}` : p;
}

/** Alias used across the app for fetch() calls. */
export const apiUrl = siteApiUrl;

/** Local Express or AWS Lambda API — Supabase Realtime is unavailable; use polling. */
export function usePollingInsteadOfRealtime(): boolean {
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "");
  const siteOrigin = String(import.meta.env.VITE_SITE_API_ORIGIN || "");
  const browserHost =
    typeof window !== "undefined" ? String(window.location.hostname || "") : "";
  const haystack = `${supabaseUrl}\n${siteOrigin}\n${browserHost}`;
  return (
    /localhost|127\.0\.0\.1/i.test(haystack) ||
    /execute-api\.amazonaws\.com/i.test(haystack) ||
    /amazonaws\.com/i.test(supabaseUrl)
  );
}

/** @deprecated use usePollingInsteadOfRealtime */
export const isLocalApiMode = usePollingInsteadOfRealtime;
