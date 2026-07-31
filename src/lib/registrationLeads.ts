import type { SupabaseClient } from "@supabase/supabase-js";

export type RegistrationLeadUpsert = {
  email: string;
  phone?: string | null;
  step: number;
  payload: Record<string, unknown>;
  cybercafe_shop_name?: string | null;
  cybercafe_email?: string | null;
};

function isMissingRpc(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const msg = String(err.message || "").toLowerCase();
  return err.code === "PGRST202" || msg.includes("could not find") || msg.includes("does not exist");
}

/** Save draft registration (public anon or logged-in cyber café partner). */
export async function upsertRegistrationLead(
  client: SupabaseClient,
  row: RegistrationLeadUpsert
): Promise<{ ok: boolean; error?: string }> {
  const email = row.email.trim().toLowerCase();
  if (!email.includes("@")) {
    return { ok: false, error: "Invalid email" };
  }

  const { error: rpcErr } = await client.rpc("upsert_registration_lead", {
    p_email: email,
    p_phone: row.phone ?? null,
    p_step: row.step,
    p_payload: row.payload,
    p_cybercafe_shop_name: row.cybercafe_shop_name ?? null,
    p_cybercafe_email: row.cybercafe_email ?? null,
  });

  if (!rpcErr) return { ok: true };

  if (!isMissingRpc(rpcErr)) {
    return { ok: false, error: rpcErr.message };
  }

  const { error } = await client.from("registration_leads").upsert(
    {
      email,
      phone: row.phone,
      step: row.step,
      payload: row.payload,
      cybercafe_shop_name: row.cybercafe_shop_name,
      cybercafe_email: row.cybercafe_email,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "email" }
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteRegistrationLead(
  client: SupabaseClient,
  email: string
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;

  const { error: rpcErr } = await client.rpc("delete_registration_lead", {
    p_email: normalized,
  });
  if (!rpcErr || !isMissingRpc(rpcErr)) return;

  await client.from("registration_leads").delete().eq("email", normalized);
}
