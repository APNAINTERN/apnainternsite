import type { SupabaseClient } from "@supabase/supabase-js";

export type PaymentConfigRow = {
  id?: number;
  razorpay_key_id?: string | null;
  razorpay_key_secret?: string | null;
  razorpay_webhook_secret?: string | null;
  amount_paise?: number | null;
  is_active?: boolean | null;
  currency?: string | null;
  updated_at?: string | null;
};

function isMissingRpc(err: { code?: string; message?: string } | null): boolean {
  const msg = String(err?.message || "").toLowerCase();
  return err?.code === "PGRST202" || msg.includes("could not find") || msg.includes("does not exist");
}

export async function fetchAdminPaymentConfig(
  client: SupabaseClient
): Promise<PaymentConfigRow | null> {
  const { data, error } = await client.rpc("admin_get_payment_config");
  if (error) {
    if (isMissingRpc(error)) {
      throw new Error(
        "Run supabase/migrations/20260601120000_security_rpc_registration_fees_payment.sql in Supabase SQL Editor."
      );
    }
    throw error;
  }
  if (!data || typeof data !== "object") return null;
  return data as PaymentConfigRow;
}

export async function saveAdminPaymentConfig(
  client: SupabaseClient,
  config: PaymentConfigRow
): Promise<void> {
  const { error } = await client.rpc("admin_save_payment_config", {
    p_config: {
      razorpay_key_id: config.razorpay_key_id ?? "",
      razorpay_key_secret: config.razorpay_key_secret ?? "",
      razorpay_webhook_secret: config.razorpay_webhook_secret ?? "",
      amount_paise: config.amount_paise ?? 9900,
      is_active: config.is_active !== false,
      currency: config.currency ?? "INR",
    },
  });
  if (error) {
    if (isMissingRpc(error)) {
      throw new Error(
        "Run supabase/migrations/20260601120000_security_rpc_registration_fees_payment.sql in Supabase SQL Editor."
      );
    }
    throw error;
  }
}
