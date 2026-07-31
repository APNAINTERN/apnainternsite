import type { SupabaseClient } from "@supabase/supabase-js";
import { assertSendMailOk, getSendMailApiUrl } from "@/lib/sendMailApi";
import { resolveLoginIdentifier } from "@/lib/resolveLoginIdentifier";
import {
  isInvalidLoginCredentials,
  signInStudentWithPassword,
  type StudentSignInResult,
} from "@/lib/studentAuthLogin";
import { PASSWORD_RESETS_SCHEMA_HINT, passwordResetInsertRow } from "@/lib/passwordResetRow";

export function normalizeStudentLoginEmail(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (!v.includes("@")) return null;
  return v;
}

/** @deprecated Use isInvalidLoginCredentials from studentAuthLogin */
export function isInvalidLoginCredentialsMessage(message: string): boolean {
  return isInvalidLoginCredentials(new Error(message));
}

const OTP_SEND_COOLDOWN_MS = 60_000;
const OTP_SEND_LAST_KEY = "ezyintern_student_otp_last_send";

function canSendStudentLoginOtpNow(email: string): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.sessionStorage.getItem(OTP_SEND_LAST_KEY);
  if (!raw) return true;
  try {
    const map = JSON.parse(raw) as Record<string, number>;
    const last = map[email] ?? 0;
    return Date.now() - last >= OTP_SEND_COOLDOWN_MS;
  } catch {
    return true;
  }
}

function markStudentLoginOtpSent(email: string): void {
  if (typeof window === "undefined") return;
  let map: Record<string, number> = {};
  try {
    map = JSON.parse(window.sessionStorage.getItem(OTP_SEND_LAST_KEY) || "{}") as Record<string, number>;
  } catch {
    map = {};
  }
  map[email] = Date.now();
  window.sessionStorage.setItem(OTP_SEND_LAST_KEY, JSON.stringify(map));
}

function mapOtpExchangeError(code: string | undefined, detail?: string): string {
  switch (code) {
    case "invalid_otp":
      return "Invalid or expired code. Tap Resend code and enter the newest 6-digit email.";
    case "no_account":
      return "No student account found for this email. Register first or contact support.";
    case "admin_portal":
      return "This email is for staff/admin access. Use the admin sign-in page.";
    case "no_password_on_file":
      return "No login password on file for this account. Use Forgot password or contact support.";
    case "invalid_input":
      return "Enter your email and the 6-digit code from your inbox.";
    case "sync_failed":
      return detail
        ? `Login code was valid but account sync failed: ${detail}`
        : "Login code was valid but account sync failed. Run supabase/hotfix_fix_student_otp_login.sql in Supabase SQL.";
    case "internal":
      return detail
        ? `Login verification error: ${detail}. Run supabase/hotfix_fix_student_otp_login.sql in Supabase SQL.`
        : "Login verification failed on the server. Run supabase/hotfix_fix_student_otp_login.sql in Supabase SQL.";
    default:
      return code
        ? `Could not verify the login code (${code}). Try Resend code or contact support.`
        : "Could not verify the login code. Try Resend code or contact support.";
  }
}

/** Store OTP + send login code to the account's email. Identifier may be email, phone, or registration ID. */
export async function requestStudentLoginOtp(
  client: SupabaseClient,
  rawIdentifier: string
): Promise<{ ok: true; email: string } | { ok: false; error: Error }> {
  const resolved = await resolveLoginIdentifier(client, rawIdentifier);
  if (!resolved.ok) {
    return { ok: false, error: new Error(resolved.message) };
  }
  const email = resolved.email;

  if (!canSendStudentLoginOtpNow(email)) {
    return {
      ok: false,
      error: new Error("A login code was sent recently. Wait a minute or use the code already in your inbox."),
    };
  }

  const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

  const { error: insertError } = await client
    .from("password_resets")
    .insert(passwordResetInsertRow(email, generatedOtp));

  if (insertError) {
    return {
      ok: false,
      error: new Error(
        [String(insertError.message || ""), PASSWORD_RESETS_SCHEMA_HINT].filter(Boolean).join(" ")
      ),
    };
  }

  try {
    const response = await fetch(getSendMailApiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "login_otp",
        otp: generatedOtp,
        to: email,
        email,
      }),
    });
    await assertSendMailOk(response);
  } catch (mailErr: unknown) {
    if (typeof window !== "undefined" && window.location.hostname === "localhost") {
      sessionStorage.setItem("student_login_otp", generatedOtp);
      sessionStorage.setItem("student_login_otp_email", email);
      markStudentLoginOtpSent(email);
      return { ok: true, email };
    }
    const detail = mailErr instanceof Error ? mailErr.message : "Failed to send login code";
    return { ok: false, error: new Error(detail) };
  }

  markStudentLoginOtpSent(email);
  return { ok: true, email };
}

/** Verify OTP via RPC, sync auth password, then sign in. */
export async function signInStudentWithOtp(
  client: SupabaseClient,
  rawIdentifier: string,
  rawOtp: string
): Promise<StudentSignInResult> {
  const otp = rawOtp.trim();
  if (!rawIdentifier.trim() || otp.length !== 6) {
    return {
      ok: false,
      error: new Error("Enter your email, phone, or registration ID and the 6-digit code from your inbox."),
    };
  }

  const { data, error } = await client.rpc("student_exchange_login_otp", {
    p_identifier: rawIdentifier.trim(),
    p_otp: otp,
  });

  if (error) {
    const msg = String(error.message || "").toLowerCase();
    if (error.code === "PGRST202" || msg.includes("could not find")) {
      return {
        ok: false,
        error: new Error(
          "Email login codes are not enabled on the database yet. Run supabase/hotfix_student_otp_login.sql in Supabase SQL."
        ),
      };
    }
    return { ok: false, error: error };
  }

  const row = data as {
    ok?: boolean;
    error?: string;
    detail?: string;
    email?: string;
    password?: string;
  } | null;
  if (!row?.ok || !row.email || !row.password) {
    return {
      ok: false,
      error: new Error(mapOtpExchangeError(row?.error, row?.detail)),
    };
  }

  return signInStudentWithPassword(client, row.email, row.password, { tryRepair: true });
}
