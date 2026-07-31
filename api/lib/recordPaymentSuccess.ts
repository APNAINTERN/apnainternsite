import type { ServerDbLike } from './rdsAdapter';

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

export async function ensurePaymentSuccessLog(
  supabase: ServerDbLike,
  row: PaymentSuccessLogInput
): Promise<void> {
  const paymentId = String(row.payment_id || '').trim();
  const email = String(row.email || '').trim().toLowerCase();
  if (!paymentId || !email) return;

  const payload = {
    user_id: row.user_id ?? null,
    payment_id: paymentId,
    amount_paise: Math.max(0, Math.round(Number(row.amount_paise) || 0)),
    email,
    full_name: String(row.full_name || 'Student').trim() || 'Student',
    college_name: row.college_name ?? null,
    cybercafe_shop_name: row.cybercafe_shop_name ?? null,
    cybercafe_email: row.cybercafe_email ?? null,
    status: row.status || 'success',
  };

  const { error: rpcErr } = await supabase.rpc('ensure_payment_success_log', {
    p_row: payload,
  });

  if (!rpcErr) return;

  const { error: insErr } = await supabase.from('payment_success').insert(payload);
  if (insErr && !String(insErr.message || '').includes('duplicate')) {
    console.warn('[payment_success] insert failed:', insErr.message);
  }
}
