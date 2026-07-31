import type { SupabaseClient, SupportedStorage } from "@supabase/supabase-js";
import {
  isAdminPortalSessionActive,
  touchAdminSessionExpiry,
} from "@/lib/adminAuthSession";

/** Supabase auth storage key — keep stable so sessions survive deploys. */
export const AUTH_STORAGE_KEY = "ezyintern-auth-v1";

/** Keep students signed in on this device (15 days). */
export const STUDENT_SESSION_KEEP_DAYS = 15;
export const STUDENT_SESSION_KEEP_MS = STUDENT_SESSION_KEEP_DAYS * 24 * 60 * 60 * 1000;

const SESSION_UNTIL_KEY = "ezyintern_student_session_until";
const REMEMBER_KEY = "ezyintern_student_remember_login";

/** True while the student chose "remember me" / 15-day device session is active. */
export function isStudentPortalSessionActive(): boolean {
  if (typeof window === "undefined") return false;
  const until = Number(window.localStorage.getItem(SESSION_UNTIL_KEY) || "0");
  if (until <= 0) return false;
  if (until <= Date.now()) {
    window.localStorage.removeItem(SESSION_UNTIL_KEY);
    window.localStorage.removeItem(REMEMBER_KEY);
    return false;
  }
  return true;
}

/** localStorage adapter for long-lived student sessions. */
export function createPersistingAuthStorage(): SupportedStorage {
  return {
    getItem: (key: string) => {
      if (typeof window === "undefined") return null;
      return window.localStorage.getItem(key);
    },
    setItem: (key: string, value: string) => {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(key, value);
      if (key.includes(AUTH_STORAGE_KEY)) {
        if (isAdminPortalSessionActive()) {
          touchAdminSessionExpiry();
        } else {
          touchStudentSessionExpiry();
        }
      }
    },
    removeItem: (key: string) => {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem(key);
      if (key.includes(AUTH_STORAGE_KEY)) {
        window.localStorage.removeItem(SESSION_UNTIL_KEY);
        window.localStorage.removeItem(REMEMBER_KEY);
        // Admin window is cleared only via adminIntentionalSignOut or natural expiry.
      }
    },
  };
}

export function touchStudentSessionExpiry(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_UNTIL_KEY, String(Date.now() + STUDENT_SESSION_KEEP_MS));
  window.localStorage.setItem(REMEMBER_KEY, "1");
}

/**
 * After student password/OTP login: refresh tokens and mark 15-day persistence on this device.
 */
export async function persistStudentAuthSession(client: SupabaseClient): Promise<void> {
  touchStudentSessionExpiry();
  try {
    const { data: { session } } = await client.auth.getSession();
    if (session) {
      await client.auth.refreshSession();
    }
  } catch (err) {
    console.warn("[auth] refreshSession after login:", err);
  }
}

/** Proactive refresh so access tokens stay valid while the 15-day window is active. */
export async function refreshStudentSessionIfPresent(client: SupabaseClient): Promise<void> {
  if (typeof window === "undefined") return;
  const until = Number(window.localStorage.getItem(SESSION_UNTIL_KEY) || "0");
  if (until > 0 && Date.now() > until) {
    return;
  }
  const { data: { session } } = await client.auth.getSession();
  if (!session) return;
  try {
    await client.auth.refreshSession();
    touchStudentSessionExpiry();
  } catch {
    /* ignore — autoRefreshToken will retry */
  }
}
