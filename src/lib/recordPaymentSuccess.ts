import type { SupabaseClient } from "@supabase/supabase-js";

export type PaymentSuccessLogInput = {
  user_id?: string;
  payment_id: string;
  amount_paise: number;
  email: string;
  full_name: string;
  college_name?: string | null;
  cybercafe_shop_name?: string | null;
  cybercafe_email?: string | null;
  status?: string;
};

/** Idempotent row for admin revenue / transactions (RPC bypasses flaky client RLS inserts). */
export async function ensurePaymentSuccessLog(
  client: SupabaseClient,
  row: PaymentSuccessLogInput
): Promise<boolean> {
  const paymentId = String(row.payment_id || "").trim();
  const email = String(row.email || "").trim().toLowerCase();
  if (!paymentId || !email) return false;

  const amountPaise = Math.max(100, Math.round(Number(row.amount_paise) || 0));
  const payload = {
    user_id: row.user_id ?? null,
    payment_id: paymentId,
    amount_paise: amountPaise,
    email,
    full_name: String(row.full_name || "Student").trim() || "Student",
    college_name: row.college_name ?? null,
    cybercafe_shop_name: row.cybercafe_shop_name ?? null,
    cybercafe_email: row.cybercafe_email ?? null,
    status: row.status || "success",
  };

  const { error: rpcErr } = await client.rpc("ensure_payment_success_log", {
    p_row: payload,
  });

  if (!rpcErr) return true;

  const msg = String(rpcErr.message || "");
  if (rpcErr.code === "PGRST202" || msg.toLowerCase().includes("could not find")) {
    const { error: insErr } = await client.from("payment_success").insert(payload);
    if (!insErr) return true;
    if (String(insErr.message || "").includes("duplicate")) return true;
    console.error("[payment_success] direct insert failed:", insErr.message);
    return false;
  }

  console.error("[payment_success] ensure_payment_success_log:", rpcErr.message);
  return false;
}
