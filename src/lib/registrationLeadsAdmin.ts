import type { SupabaseClient } from "@supabase/supabase-js";
import { parseJsonField } from "@/lib/parseJsonField";

export type RegistrationLeadDraftRow = {
  id: string;
  email?: string | null;
  phone?: string | null;
  step?: number | null;
  updated_at: string;
  cybercafe_shop_name?: string | null;
  cybercafe_email?: string | null;
  payload?: Record<string, unknown> | null;
  full_name?: string | null;
  university_name?: string | null;
  college_name?: string | null;
  course?: string | null;
  contact?: string | null;
};

function isMissingRpc(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const msg = String(err.message || "").toLowerCase();
  return (
    err.code === "PGRST202" ||
    msg.includes("could not find") ||
    msg.includes("does not exist") ||
    msg.includes("schema cache")
  );
}

/** Server-paginated registration leads (fast on AWS). Falls back to empty on hard failure. */
export async function fetchRegistrationLeadsPage(
  client: SupabaseClient,
  opts: {
    page: number;
    pageSize: number;
    search?: string;
    university?: string;
    college?: string;
  }
): Promise<{ rows: RegistrationLeadDraftRow[]; total: number }> {
  const p_limit = Math.max(1, Math.min(opts.pageSize, 200));
  const p_offset = Math.max(0, opts.page) * p_limit;
  const p_search = opts.search?.trim() || null;
  const p_university =
    opts.university && opts.university !== "all" ? opts.university : null;
  const p_college = opts.college && opts.college !== "all" ? opts.college : null;

  const [listRes, countRes] = await Promise.all([
    client.rpc("admin_list_registration_leads", {
      p_limit,
      p_offset,
      p_search,
      p_university,
      p_college,
    }),
    client.rpc("admin_count_registration_leads", {
      p_search,
      p_university,
      p_college,
    }),
  ]);

  if (!listRes.error && !countRes.error) {
    const rows = (Array.isArray(listRes.data) ? listRes.data : []).map((row: any) => ({
      ...row,
      id: String(row.id),
      payload: parseJsonField(row.payload),
    }));
    return { rows, total: Number(countRes.data) || 0 };
  }

  if (
    !isMissingRpc(listRes.error as { code?: string; message?: string }) &&
    listRes.error
  ) {
    throw listRes.error;
  }

  // Fallback: slim table select for one page (no full dump).
  let q = client
    .from("registration_leads")
    .select(
      "id,email,phone,step,updated_at,cybercafe_shop_name,cybercafe_email,payload",
      { count: "exact" }
    )
    .order("updated_at", { ascending: false })
    .range(p_offset, p_offset + p_limit - 1);

  if (p_search) {
    q = q.or(`email.ilike.%${p_search}%,phone.ilike.%${p_search}%`);
  }

  const { data, error, count } = await q;
  if (error) throw error;

  return {
    rows: (data || []).map((row: any) => ({
      ...row,
      payload: parseJsonField(row.payload),
    })),
    total: count ?? 0,
  };
}
