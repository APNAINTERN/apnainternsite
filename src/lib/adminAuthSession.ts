import type { SupabaseClient } from "@supabase/supabase-js";

/** Admin / super-admin portal: keep session alive on this device (6–10h target). */
export const ADMIN_SESSION_KEEP_HOURS = 8;
export const ADMIN_SESSION_KEEP_MS = ADMIN_SESSION_KEEP_HOURS * 60 * 60 * 1000;

/** Refresh before the default ~1h Supabase access token expires (admin only). */
export const ADMIN_SESSION_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

const ADMIN_SESSION_UNTIL_KEY = "ezyintern_admin_session_until";
const ADMIN_LOGOUT_INTENT_KEY = "ezyintern_admin_logout_intent";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function isAdminPortalSessionActive(): boolean {
  if (typeof window === "undefined") return false;
  const until = Number(window.localStorage.getItem(ADMIN_SESSION_UNTIL_KEY) || "0");
  if (until <= 0) return false;
  if (until <= Date.now()) {
    window.localStorage.removeItem(ADMIN_SESSION_UNTIL_KEY);
    return false;
  }
  return true;
}

export function touchAdminSessionExpiry(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ADMIN_SESSION_UNTIL_KEY, String(Date.now() + ADMIN_SESSION_KEEP_MS));
}

export function clearAdminSessionExpiry(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ADMIN_SESSION_UNTIL_KEY);
}

/** Extend the admin window (safe to call often — does not refresh tokens). */
export function persistAdminAuthSession(): void {
  touchAdminSessionExpiry();
}

/** Once after admin OTP login: refresh tokens + start the admin window. */
export async function establishAdminAuthSession(client: SupabaseClient): Promise<void> {
  touchAdminSessionExpiry();
  await ensureAdminAuthSession(client, { extendWindow: true });
}

/**
 * Keep admin signed in while the device window is active.
 * Retries refresh when access token rotation races with tab focus / hard refresh.
 */
export async function ensureAdminAuthSession(
  client: SupabaseClient,
  opts?: { extendWindow?: boolean; attempts?: number }
): Promise<boolean> {
  if (typeof window === "undefined" || !isAdminPortalSessionActive()) return false;

  const attempts = opts?.attempts ?? 3;

  for (let i = 0; i < attempts; i++) {
    const {
      data: { session },
    } = await client.auth.getSession();
    if (session) {
      if (opts?.extendWindow !== false) touchAdminSessionExpiry();
      return true;
    }

    try {
      const { data, error } = await client.auth.refreshSession();
      if (!error && data.session) {
        touchAdminSessionExpiry();
        return true;
      }
    } catch (err) {
      console.warn("[auth] admin ensureAdminAuthSession refresh:", err);
    }

    if (i < attempts - 1) await sleep(250 * (i + 1));
  }

  return false;
}

/** Proactive refresh while the admin session window is active (students use a separate path). */
export async function refreshAdminSessionIfPresent(client: SupabaseClient): Promise<boolean> {
  if (typeof window === "undefined" || !isAdminPortalSessionActive()) return false;
  return ensureAdminAuthSession(client, { extendWindow: true, attempts: 2 });
}

/** Recover session after a transient SIGNED_OUT during token refresh. */
export async function recoverAdminSessionAfterSignOut(
  client: SupabaseClient
): Promise<boolean> {
  if (!isAdminPortalSessionActive()) return false;
  return ensureAdminAuthSession(client, { extendWindow: true, attempts: 4 });
}

export function isAdminIntentionalLogout(): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(ADMIN_LOGOUT_INTENT_KEY) === "1";
}

/** Intentional logout — clear the admin window then sign out of Supabase. */
export async function adminIntentionalSignOut(client: SupabaseClient): Promise<void> {
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(ADMIN_LOGOUT_INTENT_KEY, "1");
  }
  clearAdminSessionExpiry();
  try {
    await client.auth.signOut();
  } finally {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(ADMIN_LOGOUT_INTENT_KEY);
    }
  }
}
