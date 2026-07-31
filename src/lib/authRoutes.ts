import { AUTH_CONFIRM_PATH } from "@/lib/authPaths";
import { getPublicSiteOrigin } from "@/lib/publicSiteOrigin";

export { AUTH_CONFIRM_PATH, AUTH_CALLBACK_PATH } from "@/lib/authPaths";
export { getPublicSiteOrigin } from "@/lib/publicSiteOrigin";

/** Public student login (interns). */
export const STUDENT_LOGIN_PATH = "/login";

/** Query on {@link STUDENT_LOGIN_PATH}: sign out first so a shared browser does not keep admin/staff in session. */
export const STUDENT_CREDENTIAL_LOGIN_QUERY_KEY = "portal";
export const STUDENT_CREDENTIAL_LOGIN_QUERY_VALUE = "student";

import { resolveSafeSiteOrigin } from "@/lib/authRedirectGuard";

/** Build sign-in URL for credential / registration emails (always student portal, clears conflicting sessions). */
export function buildStudentCredentialLoginLink(siteOrigin?: string): string {
  const base = resolveSafeSiteOrigin(siteOrigin);
  const q = `${STUDENT_CREDENTIAL_LOGIN_QUERY_KEY}=${encodeURIComponent(STUDENT_CREDENTIAL_LOGIN_QUERY_VALUE)}`;
  return `${base}${STUDENT_LOGIN_PATH}?${q}`;
}

/** Staff, admin, super admin, and cyber café partner sign-in. */
export const ADMIN_LOGIN_PATH = "/admin/login";

/** College administrators (scoped roster); sign-in uses email + College Admin ID. */
export const COLLEGE_LOGIN_PATH = "/college/login";

/** Read-only college roster dashboard. */
export const COLLEGE_DASHBOARD_PATH = "/college/dashboard";

/** Referral promoters: sign in with email + Promoter Login ID. */
export const REFERRAL_LOGIN_PATH = "/referral/login";

export const REFERRAL_DASHBOARD_PATH = "/referral/dashboard";

/** Dedicated cyber café partner sign-in (not student {@link STUDENT_LOGIN_PATH}). */
export const CYBER_CAFE_LOGIN_PATH = "/cybercafe/login";

/** Legacy URL (hyphenated); kept for redirects from old bookmarks. */
export const CYBER_CAFE_LEGACY_LOGIN_PATH = "/cyber-cafe/login";

const CYBER_CAFE_AREA_PREFIXES = ["/cybercafe/dashboard"] as const;

/** Paths that should send unauthenticated users to {@link ADMIN_LOGIN_PATH}. */
const ADMIN_AREA_PREFIXES = [
  "/admin",
  "/super-admin",
  "/staff-dashboard",
] as const;

const COLLEGE_AREA_PREFIXES = [COLLEGE_DASHBOARD_PATH] as const;

const REFERRAL_AREA_PREFIXES = [REFERRAL_DASHBOARD_PATH] as const;

export function isReferralAreaPath(pathname: string): boolean {
  return REFERRAL_AREA_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isCollegeAreaPath(pathname: string): boolean {
  return COLLEGE_AREA_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isAdminAreaPath(pathname: string): boolean {
  return ADMIN_AREA_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isCyberCafeAreaPath(pathname: string): boolean {
  return CYBER_CAFE_AREA_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Partner marketing + login pages — nav "Login" should not go to student sign-in. */
export function isCyberCafePartnerPublicPath(pathname: string): boolean {
  return (
    pathname === CYBER_CAFE_LOGIN_PATH ||
    pathname === CYBER_CAFE_LEGACY_LOGIN_PATH ||
    pathname === "/cybercafe" ||
    pathname.startsWith("/cybercafe/")
  );
}

/** Redirect target for Supabase signup / email-change confirmation emails. */
export function getAuthEmailRedirectUrl(): string {
  return `${getPublicSiteOrigin()}${AUTH_CONFIRM_PATH}`;
}

/** Options passed to `auth.signUp` so confirmation links land on this app, not Lovable. */
export function buildAuthSignUpOptions(userMetadata: Record<string, unknown>) {
  const redirect = getAuthEmailRedirectUrl();
  return {
    data: userMetadata,
    emailRedirectTo: redirect,
    // GoTrue also accepts camelCase redirectTo on some versions
    redirectTo: redirect,
  };
}

/** Allowed redirect URL paths for Supabase Dashboard → Authentication → Redirect URLs. */
export const SUPABASE_AUTH_REDIRECT_PATHS = [
  "/auth/confirm",
  "/auth/callback",
  "/reset-password",
  "/login",
] as const;

export function buildCollegeLoginLink(): string {
  return `${getPublicSiteOrigin()}${COLLEGE_LOGIN_PATH}`;
}

export function buildReferralLoginLink(): string {
  return `${getPublicSiteOrigin()}${REFERRAL_LOGIN_PATH}`;
}

export function loginPathForProtectedRoute(pathname: string): string {
  if (isReferralAreaPath(pathname)) return REFERRAL_LOGIN_PATH;
  if (isCollegeAreaPath(pathname)) return COLLEGE_LOGIN_PATH;
  if (isCyberCafeAreaPath(pathname)) return CYBER_CAFE_LOGIN_PATH;
  return isAdminAreaPath(pathname) ? ADMIN_LOGIN_PATH : STUDENT_LOGIN_PATH;
}

export function isPublicLoginPath(pathname: string): boolean {
  return (
    pathname === STUDENT_LOGIN_PATH ||
    pathname === ADMIN_LOGIN_PATH ||
    pathname === COLLEGE_LOGIN_PATH ||
    pathname === REFERRAL_LOGIN_PATH ||
    pathname === CYBER_CAFE_LOGIN_PATH ||
    pathname === CYBER_CAFE_LEGACY_LOGIN_PATH
  );
}
