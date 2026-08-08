import { AWS_STAGING_API_ORIGIN } from "../../shared/aws";

/** Vercel rewrite → Lambda staging (see vercel.json). */
export const AWS_API_PROXY_PATH = "/aws-api";

export function isApnainternProductionHost(hostname: string): boolean {
  const h = String(hostname || "").toLowerCase();
  return h === "apnaintern.in" || h === "www.apnaintern.in";
}

export function isDirectLambdaApiUrl(url: string): boolean {
  return /execute-api\.[a-z0-9-]+\.amazonaws\.com/i.test(url);
}

/**
 * Browser API origin. On apnaintern.in, route through same-origin /aws-api so
 * Lambda throttling does not surface as false CORS preflight failures.
 */
export function resolveBrowserApiOrigin(envUrl?: string | null): string {
  const raw = String(envUrl || "").trim().replace(/\/$/, "");
  const fallback = raw || AWS_STAGING_API_ORIGIN;

  if (typeof window === "undefined") return fallback;

  if (isApnainternProductionHost(window.location.hostname)) {
    if (!raw || isDirectLambdaApiUrl(raw)) {
      return `${window.location.origin}${AWS_API_PROXY_PATH}`;
    }
  }

  return fallback;
}

export function usesAwsApiProxy(url: string): boolean {
  return /\/aws-api(?:\/|$)/i.test(url);
}
