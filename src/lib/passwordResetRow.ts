/** Row shape for public.password_resets OTP inserts (browser or server). */
export function passwordResetInsertRow(email: string, otp: string) {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : undefined;

  return {
    ...(id ? { id } : {}),
    email: email.trim().toLowerCase(),
    otp: String(otp).trim(),
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };
}

export const PASSWORD_RESETS_SCHEMA_HINT =
  "On AWS RDS run aws/scripts/01-password-resets-defaults.sql (sets id DEFAULT gen_random_uuid). On hosted Supabase run supabase/custom_otp_reset.sql.";
