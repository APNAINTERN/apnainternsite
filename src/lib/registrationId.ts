import type { SupabaseClient } from "@supabase/supabase-js";

/** Official enrollment format: API/INT/{year}/{5-digit seq} e.g. API/INT/2026/00001 */
export const REGISTRATION_ID_PENDING_SUFFIX = "PENDING";

export function formatRegistrationId(year: number, seq: number): string {
  return `API/INT/${year}/${String(seq).padStart(5, "0")}`;
}

export function pendingRegistrationPlaceholder(year?: number): string {
  const yr = year ?? new Date().getFullYear();
  return `API/INT/${yr}/${REGISTRATION_ID_PENDING_SUFFIX}`;
}

/** Parse sequence from new-format IDs only — legacy IDs are ignored for sequencing. */
export function parseNewFormatRegistrationSeq(
  regId: string | null | undefined,
  year?: number
): number | null {
  const r = String(regId ?? "").trim();
  const match = r.match(/^API\/INT\/(\d{4})\/(\d+)$/i);
  if (!match) return null;
  const y = parseInt(match[1], 10);
  if (year != null && y !== year) return null;
  const seq = parseInt(match[2], 10);
  return Number.isFinite(seq) && seq > 0 ? seq : null;
}

export function isNewFormatRegistrationId(regId: string | null | undefined): boolean {
  return parseNewFormatRegistrationSeq(regId) != null;
}

/** True for empty, API/PENDING/{uuid}, or API/INT/{year}/PENDING placeholders. */
export function isPlaceholderRegistrationId(regId: string | null | undefined): boolean {
  const r = String(regId ?? "").trim();
  if (!r) return true;
  if (/^API\/PENDING\//i.test(r)) return true;
  if (/\/PENDING$/i.test(r) && /^API\//i.test(r)) return true;
  return false;
}

export function isLegacyApnaInternRegistrationId(regId: string | null | undefined): boolean {
  const r = String(regId ?? "").trim();
  return /^API\/\d{4}\/INT\//i.test(r) || /^EZY\/\d{4}\/INT\//i.test(r);
}

export function maxNewFormatSeq(
  rows: Array<{ registration_id?: string | null }>,
  year: number
): number {
  let max = 0;
  for (const row of rows) {
    const seq = parseNewFormatRegistrationSeq(row.registration_id, year);
    if (seq != null && seq > max) max = seq;
  }
  return max;
}

export function nextRegistrationIdFromRows(
  rows: Array<{ registration_id?: string | null }>,
  year?: number
): string {
  const currentYear = year ?? new Date().getFullYear();
  const max = maxNewFormatSeq(rows, currentYear);
  return formatRegistrationId(currentYear, max + 1);
}

export function bumpRegistrationId(regId: string): string {
  const parts = String(regId).trim().split("/");
  if (parts.length === 4 && parts[0] === "API" && parts[1] === "INT") {
    const year = parseInt(parts[2], 10);
    const seq = parseInt(parts[3], 10);
    if (Number.isFinite(year) && Number.isFinite(seq)) {
      return formatRegistrationId(year, seq + 1);
    }
  }
  return formatRegistrationId(new Date().getFullYear(), 1);
}

/** Letter / dashboard display — never show PENDING placeholders. */
export function displayRegistrationId(
  regId: string | null | undefined,
  createdAt?: string | null
): string {
  const r = String(regId ?? "").trim();
  if (r && !isPlaceholderRegistrationId(r)) return r;
  const yr = createdAt ? new Date(createdAt).getFullYear() : new Date().getFullYear();
  return `API/INT/${yr}/—`;
}

/** Next API/INT/{year}/{seq} — prefers SECURITY DEFINER RPC (avoids RLS 500 on students list). */
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

  const { data, error } = await client
    .from("students")
    .select("registration_id")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.warn("[registration_id] lookup:", error.message);
  }

  return nextRegistrationIdFromRows(data ?? [], currentYear);
}
