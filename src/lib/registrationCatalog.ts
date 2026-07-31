import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllSupabaseRows } from "@/lib/fetchAllSupabaseRows";

export type RegistrationUniversity = {
  id: string;
  name: string;
  pisa_fee?: number | null;
};

export type RegistrationCollege = {
  id: string;
  name: string;
  university_id: string;
  pisa_fee?: number | null;
  fee_base_paise?: number | null;
  fee_processing_paise?: number | null;
  show_fee_breakdown?: boolean;
  fees_managed?: boolean;
  registration_start_date?: string | null;
  registration_end_date?: string | null;
};

export type PublicUniversity = { id: string; name: string };
export type PublicCollege = { id: string; name: string; university_id: string };

const COLLEGE_FEE_COLUMNS =
  "id, name, university_id, pisa_fee, fee_base_paise, fee_processing_paise, show_fee_breakdown, fees_managed, registration_start_date, registration_end_date";

function rpcArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  return [];
}

function isMissingRpc(err: { code?: string; message?: string } | null): boolean {
  const msg = String(err?.message || "").toLowerCase();
  return (
    err?.code === "PGRST202" ||
    msg.includes("could not find") ||
    msg.includes("does not exist") ||
    msg.includes("schema cache")
  );
}

function mergeById<T extends { id: string }>(a: T[], b: T[]): T[] {
  const map = new Map<string, T>();
  for (const row of [...a, ...b]) {
    if (!row?.id) continue;
    const id = String(row.id);
    const prev = map.get(id);
    map.set(id, prev ? ({ ...prev, ...row } as T) : row);
  }
  return [...map.values()];
}

function normalizeRegistrationCollege(row: RegistrationCollege): RegistrationCollege {
  const toNum = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const toBool = (v: unknown): boolean | undefined => {
    if (v == null) return undefined;
    if (v === true || v === false) return v;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (s === "true" || s === "t" || s === "1" || s === "yes") return true;
      if (s === "false" || s === "f" || s === "0" || s === "no") return false;
    }
    if (v === 1) return true;
    if (v === 0) return false;
    return Boolean(v);
  };

  return {
    ...row,
    id: String(row.id),
    name: String(row.name || ""),
    university_id: String(row.university_id || ""),
    pisa_fee: toNum(row.pisa_fee),
    fee_base_paise: toNum(row.fee_base_paise),
    fee_processing_paise: toNum(row.fee_processing_paise),
    show_fee_breakdown: toBool(row.show_fee_breakdown),
    fees_managed: toBool(row.fees_managed),
  };
}

async function fallbackRegistrationUniversities(
  client: SupabaseClient
): Promise<RegistrationUniversity[]> {
  return fetchAllSupabaseRows<RegistrationUniversity>(client, "universities", {
    select: "id, name, pisa_fee",
    orderBy: "name",
    ascending: true,
    pageSize: 1000,
  });
}

async function fallbackRegistrationColleges(
  client: SupabaseClient,
  universityId: string
): Promise<RegistrationCollege[]> {
  return fetchAllSupabaseRows<RegistrationCollege>(client, "colleges", {
    select: COLLEGE_FEE_COLUMNS,
    orderBy: "name",
    ascending: true,
    pageSize: 1000,
    modify: (q) => q.eq("university_id", universityId),
  });
}

async function fallbackPublicUniversities(client: SupabaseClient): Promise<PublicUniversity[]> {
  return fetchAllSupabaseRows<PublicUniversity>(client, "universities", {
    select: "id, name",
    orderBy: "name",
    ascending: true,
    pageSize: 1000,
  });
}

async function fallbackPublicColleges(
  client: SupabaseClient,
  universityId?: string | null
): Promise<PublicCollege[]> {
  return fetchAllSupabaseRows<PublicCollege>(client, "colleges", {
    select: "id, name, university_id",
    orderBy: "name",
    ascending: true,
    pageSize: 1000,
    modify: universityId ? (q) => q.eq("university_id", universityId) : undefined,
  });
}

export async function fetchRegistrationUniversities(
  client: SupabaseClient
): Promise<RegistrationUniversity[]> {
  let fromRpc: RegistrationUniversity[] = [];
  const { data, error } = await client.rpc("get_registration_universities");
  if (!error) {
    fromRpc = rpcArray<RegistrationUniversity>(data);
  } else if (!isMissingRpc(error)) {
    throw error;
  }

  let fromTable: RegistrationUniversity[] = [];
  try {
    fromTable = await fallbackRegistrationUniversities(client);
  } catch (tableErr) {
    if (!fromRpc.length) throw tableErr;
  }

  return mergeById(fromRpc, fromTable).sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""))
  );
}

export async function fetchRegistrationColleges(
  client: SupabaseClient,
  universityId: string
): Promise<RegistrationCollege[]> {
  let fromRpc: RegistrationCollege[] = [];
  const { data, error } = await client.rpc("get_registration_colleges", {
    p_university_id: universityId,
  });
  if (!error) {
    fromRpc = rpcArray<RegistrationCollege>(data);
  } else if (!isMissingRpc(error)) {
    throw error;
  }

  let fromTable: RegistrationCollege[] = [];
  try {
    fromTable = await fallbackRegistrationColleges(client, universityId);
  } catch (tableErr) {
    if (!fromRpc.length) throw tableErr;
  }

  // Prefer table rows (later) and normalize fee flags so registration respects Fees Management.
  return mergeById(fromRpc, fromTable)
    .map(normalizeRegistrationCollege)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

export async function fetchPublicUniversities(client: SupabaseClient): Promise<PublicUniversity[]> {
  let fromRpc: PublicUniversity[] = [];
  const { data, error } = await client.rpc("list_public_universities");
  if (!error) {
    fromRpc = rpcArray<PublicUniversity>(data);
  } else if (!isMissingRpc(error)) {
    throw error;
  }

  let fromTable: PublicUniversity[] = [];
  try {
    fromTable = await fallbackPublicUniversities(client);
  } catch (tableErr) {
    if (!fromRpc.length) throw tableErr;
  }

  return mergeById(fromRpc, fromTable).sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""))
  );
}

export async function fetchPublicColleges(
  client: SupabaseClient,
  universityId?: string | null
): Promise<PublicCollege[]> {
  let fromRpc: PublicCollege[] = [];
  const { data, error } = await client.rpc("list_public_colleges", {
    p_university_id: universityId || null,
  });
  if (!error) {
    fromRpc = rpcArray<PublicCollege>(data);
  } else if (!isMissingRpc(error)) {
    throw error;
  }

  let fromTable: PublicCollege[] = [];
  try {
    fromTable = await fallbackPublicColleges(client, universityId);
  } catch (tableErr) {
    if (!fromRpc.length) throw tableErr;
  }

  return mergeById(fromRpc, fromTable).sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""))
  );
}
