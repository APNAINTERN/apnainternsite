import type { AuthError, Session, SupabaseClient } from "@supabase/supabase-js";
import { persistStudentAuthSession } from "@/lib/studentAuthSession";

export type StudentSignInResult =
  | { ok: true; session: Session }
  | { ok: false; error: AuthError | Error };

export function isInvalidLoginCredentials(err: AuthError | Error | null | undefined): boolean {
  const msg = String(
    err && "message" in err ? err.message : err instanceof Error ? err.message : ""
  ).toLowerCase();
  return (
    msg.includes("invalid login credentials") ||
    msg.includes("invalid credentials") ||
    ("code" in (err || {}) && (err as AuthError)?.code === "invalid_credentials")
  );
}

export type StudentPasswordLoginAttempt =
  | { status: "ok" }
  | { status: "otp" }
  | { status: "error"; error: AuthError | Error };

/** Sync Auth password from students.metadata when registration hash drifted. */
async function tryRepairStudentAuthLogin(
  client: SupabaseClient,
  email: string,
  password: string
): Promise<boolean> {
  const { data, error } = await client.rpc("repair_student_auth_login", {
    p_email: email,
    p_plain: password,
  });
  if (error) {
    const msg = String(error.message || "").toLowerCase();
    if (error.code === "PGRST202" || msg.includes("could not find")) {
      return false;
    }
    console.warn("[auth] repair_student_auth_login:", error.message);
    return false;
  }
  return data === true;
}

/**
 * signInWithPassword with trim + one repair retry for student accounts.
 */
export async function signInStudentWithPassword(
  client: SupabaseClient,
  rawEmail: string,
  rawPassword: string,
  opts?: { tryRepair?: boolean }
): Promise<StudentSignInResult> {
  const email = rawEmail.trim().toLowerCase();
  const password = rawPassword.trim();

  if (!email || !password) {
    return { ok: false, error: new Error("Please enter email and password.") };
  }

  const attempt = async () => {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { data: null as null, error };
    if (!data.session) {
      return {
        data: null as null,
        error: { message: "Authentication failed", name: "AuthError" } as AuthError,
      };
    }
    return { data, error: null };
  };

  let { data, error } = await attempt();

  if (error && isInvalidLoginCredentials(error) && opts?.tryRepair !== false) {
    const repaired = await tryRepairStudentAuthLogin(client, email, password);
    if (repaired) {
      ({ data, error } = await attempt());
    }
  }

  if (error) return { ok: false, error };
  if (!data?.session) {
    return { ok: false, error: new Error("Authentication failed") };
  }
  await persistStudentAuthSession(client);
  return { ok: true, session: data.session };
}

/**
 * Password login for students: repair/sync auth when directory password matches,
 * only suggest OTP (no email sent) when password is truly wrong for auth.
 */
export async function attemptStudentPasswordLoginBeforeOtp(
  client: SupabaseClient,
  rawEmail: string,
  rawPassword: string
): Promise<StudentPasswordLoginAttempt> {
  // One repair attempt max (signInStudentWithPassword already repairs on invalid credentials).
  const first = await signInStudentWithPassword(client, rawEmail, rawPassword, { tryRepair: true });
  if (first.ok) return { status: "ok" };

  const err = first.error;
  if (!isInvalidLoginCredentials(err)) {
    return { status: "error", error: err };
  }

  return { status: "otp" };
}
