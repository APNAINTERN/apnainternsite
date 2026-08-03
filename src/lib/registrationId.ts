import type { SupabaseClient } from "@supabase/supabase-js";

/** True for empty, API/PENDING/{uuid}, or API/{year}/INT/PENDING placeholders. */
export function isPlaceholderRegistrationId(regId: string | null | undefined): boolean {
  const r = String(regId ?? "").trim();
  if (!r) return true;
  return /^API\/PENDING\//i.test(r) || /\/INT\/PENDING$/i.test(r);
}

/** Letter / dashboard display — never show PENDING placeholders. */
export function displayRegistrationId(
  regId: string | null | undefined,
  createdAt?: string | null
): string {
  const r = String(regId ?? "").trim();
  if (r && !isPlaceholderRegistrationId(r)) return r;
  const yr = createdAt ? new Date(createdAt).getFullYear() : new Date().getFullYear();
  return `API/${yr}/INT/—`;
}

/** Next API/{year}/INT/{seq} — prefers SECURITY DEFINER RPC (avoids RLS 500 on students list). */
export async function allocateNextRegistrationId(
  client: SupabaseClient,
  year?: number
): Promise<string> {
  const currentYear = year ?? new Date().getFullYear();

  const { data: fromRpc, error: rpcErr } = await client.rpc("allocate_next_registration_id", {
    p_year: currentYear,
  });
  if (!rpcErr && typeof fromRpc === "string" && fromRpc.trim()) {
    return fromRpc.trim();
  }
  if (rpcErr) {
    const msg = String(rpcErr.message || "").toLowerCase();
    if (rpcErr.code !== "PGRST202" && !msg.includes("could not find")) {
      console.warn("[registration_id] RPC:", rpcErr.message);
    }
  }

  let nextSeq = 10001;
  const { data, error } = await client
    .from("students")
    .select("registration_id")
    .order("created_at", { ascending: false })
    .limit(25);

  if (!error && data?.length) {
    const seqs = data
      .map((row) => {
        const reg = String(row.registration_id || "").trim();
        const parts = reg.split("/");
        return parts.length === 4 && parts[0] === "API" && parts[1] === String(currentYear)
          ? parseInt(parts[3], 10)
          : 0;
      })
      .filter((n) => !isNaN(n) && n > 0);
    if (seqs.length > 0) nextSeq = Math.max(...seqs) + 1;
  } else if (error) {
    console.warn("[registration_id] lookup:", error.message);
  }

  return `API/${currentYear}/INT/${nextSeq}`;
}
