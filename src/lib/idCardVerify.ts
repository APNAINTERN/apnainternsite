import type { SupabaseClient } from "@supabase/supabase-js";

export type IdCardVerifyCard = {
  card_number: string;
  user_name: string;
  user_email: string;
  category: string;
  status: string;
  generated_at: string | null;
  phone: string;
  position: string;
};

export type IdCardVerifyResult = {
  found: boolean;
  card: IdCardVerifyCard | null;
};

type RpcRow = {
  found?: boolean;
  card?: Partial<IdCardVerifyCard> | null;
};

export async function verifyIdCardPublic(
  client: SupabaseClient,
  cardNumber: string
): Promise<IdCardVerifyResult> {
  const { data, error } = await client.rpc("verify_id_card_public", {
    p_card_number: cardNumber.trim(),
  });
  if (error) throw error;

  const row = (data ?? { found: false }) as RpcRow;
  if (!row.found || !row.card) {
    return { found: false, card: null };
  }

  return {
    found: true,
    card: {
      card_number: String(row.card.card_number || ""),
      user_name: String(row.card.user_name || ""),
      user_email: String(row.card.user_email || ""),
      category: String(row.card.category || ""),
      status: String(row.card.status || ""),
      generated_at: row.card.generated_at ? String(row.card.generated_at) : null,
      phone: String(row.card.phone || ""),
      position: String(row.card.position || ""),
    },
  };
}
