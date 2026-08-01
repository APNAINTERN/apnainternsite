import type { SupabaseClient } from "@supabase/supabase-js";
import { assertSendMailOk, getSendMailApiUrl } from "@/lib/sendMailApi";
import { isLocalDevEnvironment } from "@/lib/isLocalDev";
import { PASSWORD_RESETS_SCHEMA_HINT, passwordResetInsertRow } from "@/lib/passwordResetRow";

const OTP_SEND_COOLDOWN_MS = 60_000;
const OTP_SEND_LAST_KEY = "ezyintern_admin_login_otp_last_send";

function canSendAdminLoginOtpNow(email: string): boolean {
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

function markAdminLoginOtpSent(email: string): void {
  if (typeof window === "undefined") return;
  let map: Record<string, number> = {};
  try {
    map = JSON.parse(window.sessionStorage.getItem(OTP_SEND_LAST_KEY) || "{}") as Record<
      string,
      number
    >;
  } catch {
    map = {};
  }
  map[email] = Date.now();
  window.sessionStorage.setItem(OTP_SEND_LAST_KEY, JSON.stringify(map));
}

/** Store OTP in password_resets and email via /api/send-mail (SMTP from env). */
export async function requestAdminLoginOtp(
  client: SupabaseClient,
  rawEmail: string
): Promise<{ ok: true; email: string; devOtp?: string } | { ok: false; error: Error }> {
  const email = rawEmail.trim().toLowerCase();
  if (!email.includes("@")) {
    return { ok: false, error: new Error("Enter a valid email address.") };
  }

  if (!canSendAdminLoginOtpNow(email)) {
    return {
      ok: false,
      error: new Error("A verification code was sent recently. Check your inbox or wait a minute."),
    };
  }

  const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
  const localDev = isLocalDevEnvironment();

  if (localDev && typeof window !== "undefined") {
    window.sessionStorage.setItem("admin_login_otp", generatedOtp);
  }

  const { error: insertError } = await client
    .from("password_resets")
    .insert(passwordResetInsertRow(email, generatedOtp));

  if (insertError) {
    return {
      ok: false,
      error: new Error([insertError.message, PASSWORD_RESETS_SCHEMA_HINT].filter(Boolean).join(" ")),
    };
  }

  let mailPayload: { devOtp?: string; warning?: string; error?: string; message?: string } = {};

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
    const raw = await response.text();
    try {
      mailPayload = JSON.parse(raw) as typeof mailPayload;
    } catch {
      /* ignore */
    }
    if (!response.ok) {
      throw new Error(
        mailPayload.error ||
          mailPayload.message ||
          raw.slice(0, 280) ||
          `Email request failed (${response.status})`
      );
    }
  } catch (mailErr: unknown) {
    if (localDev) {
      markAdminLoginOtpSent(email);
      return { ok: true, email, devOtp: generatedOtp };
    }
    const detail = mailErr instanceof Error ? mailErr.message : "Failed to send verification code";
    return { ok: false, error: new Error(detail) };
  }

  markAdminLoginOtpSent(email);
  const apiDevOtp = mailPayload.devOtp?.trim();
  return {
    ok: true,
    email,
    devOtp: localDev ? generatedOtp : apiDevOtp || undefined,
  };
}

export async function verifyAdminLoginOtp(
  client: SupabaseClient,
  rawEmail: string,
  rawOtp: string
): Promise<boolean> {
  const otp = rawOtp.trim();
  if (!rawEmail.trim() || otp.length !== 6) return false;

  const { data: valid, error } = await client.rpc("verify_password_reset_otp", {
    p_identifier: rawEmail.trim(),
    p_otp: otp,
  });

  if (error) throw error;
  return valid === true;
}
