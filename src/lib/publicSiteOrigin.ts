/** Canonical production site origin for emails and Supabase auth redirects. */
export function getPublicSiteOrigin(): string {
  const fromEnv =
    (import.meta.env.VITE_PUBLIC_SITE_ORIGIN as string | undefined) ||
    (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined);
  if (fromEnv?.trim()) return fromEnv.trim().replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const h = window.location.hostname;
    if (h === "localhost" || h === "127.0.0.1") return "https://www.ezyintern.in";
    return window.location.origin.replace(/\/$/, "");
  }
  return "https://www.ezyintern.in";
}
