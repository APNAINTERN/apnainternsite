import { AUTH_CONFIRM_PATH } from "@/lib/authPaths";
import { getPublicSiteOrigin } from "@/lib/publicSiteOrigin";

function getAuthEmailRedirectUrl(): string {
  return `${getPublicSiteOrigin()}${AUTH_CONFIRM_PATH}`;
}

/** Hostnames that must never be used for auth or email links (legacy Lovable / preview). */
const BLOCKED_AUTH_HOST_PATTERNS = [
  /^lovable\.app$/i,
  /^.*\.lovable\.app$/i,
  /^lovable\.dev$/i,
  /^.*\.lovable\.dev$/i,
  /^lovableproject\.com$/i,
  /^.*\.lovableproject\.com$/i,
  /^gptengineer\.app$/i,
  /^.*\.gptengineer\.app$/i,
  /^id-preview--/i,
];

export function isBlockedExternalAuthHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  if (!h) return false;
  return BLOCKED_AUTH_HOST_PATTERNS.some((re) => re.test(h));
}

/** Canonical HTTPS origin for links — never returns a Lovable/preview host. */
export function resolveSafeSiteOrigin(candidate?: string): string {
  const fallback = getPublicSiteOrigin();
  const raw = candidate?.trim();
  if (!raw) return fallback;

  try {
    const url = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    if (isBlockedExternalAuthHost(url.hostname)) return fallback;
    return url.origin.replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

export function getPasswordRecoveryRedirectUrl(): string {
  return `${resolveSafeSiteOrigin()}/reset-password`;
}

/** Supabase auth callback tokens in hash or PKCE `code` in query. */
export function hasAuthCallbackInUrl(
  search: string = typeof window !== "undefined" ? window.location.search : "",
  hash: string = typeof window !== "undefined" ? window.location.hash : ""
): boolean {
  if (search.includes("code=")) return true;

  const h = hash.replace(/^#/, "");
  if (!h) return false;
  const params = new URLSearchParams(h);
  if (params.get("access_token") || params.get("code")) return true;
  const type = params.get("type") || "";
  return ["signup", "email", "recovery", "magiclink", "invite"].some((t) =>
    type.toLowerCase().includes(t)
  );
}

/** If `redirect_to` in the URL points at Lovable, return the Apna Intern confirm URL instead. */
export function sanitizeRedirectToParam(redirectTo: string | null): string {
  if (!redirectTo?.trim()) return getAuthEmailRedirectUrl();
  try {
    const u = new URL(redirectTo);
    if (isBlockedExternalAuthHost(u.hostname)) return getAuthEmailRedirectUrl();
    return u.toString();
  } catch {
    return getAuthEmailRedirectUrl();
  }
}

/** When served on a blocked host, send the user to production with tokens preserved. */
export function escapeBlockedHostIfNeeded(): boolean {
  if (typeof window === "undefined") return false;
  if (!isBlockedExternalAuthHost(window.location.hostname)) return false;

  const target =
    getPublicSiteOrigin() +
    AUTH_CONFIRM_PATH +
    window.location.search +
    window.location.hash;
  window.location.replace(target);
  return true;
}

export function authConfirmPathWithTokens(search: string, hash: string): string {
  return `${AUTH_CONFIRM_PATH}${search || ""}${hash || ""}`;
}
