/** Canonical production site origin for emails and Supabase auth redirects. */
import { BRAND_WEBSITE_URL } from "@/lib/brand";

export function getPublicSiteOrigin(): string {
  const fromEnv =
    (import.meta.env.VITE_PUBLIC_SITE_ORIGIN as string | undefined) ||
    (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined);
  if (fromEnv?.trim()) return fromEnv.trim().replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const h = window.location.hostname;
    if (h === "localhost" || h === "127.0.0.1") return BRAND_WEBSITE_URL;
    return window.location.origin.replace(/\/$/, "");
  }
  return BRAND_WEBSITE_URL;
}
