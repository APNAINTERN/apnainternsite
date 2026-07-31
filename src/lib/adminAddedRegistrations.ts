import type { SupabaseClient } from "@supabase/supabase-js";
import { applyStudentDirectorySearch } from "@/lib/studentDirectorySearch";

export type AdminAddedRegistrationRow = {
  id: string;
  email: string;
  full_name: string | null;
  contact_number: string | null;
  registration_id: string | null;
  status: string | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
};

const SELECT =
  "id, email, full_name, contact_number, registration_id, status, created_at, metadata";

function isMissingRpc(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const msg = String(err.message || "").toLowerCase();
  return err.code === "PGRST202" || msg.includes("could not find") || msg.includes("does not exist");
}

function isAuthError(err: { code?: string; message?: string; status?: number } | null): boolean {
  if (!err) return false;
  if (err.status === 401 || err.code === "PGRST301") return true;
  const msg = String(err.message || "").toLowerCase();
  return msg.includes("jwt") || msg.includes("not authenticated") || msg.includes("access denied");
}

async function fetchAddedRegistrationsDirect(
  client: SupabaseClient,
  page: number,
  pageSize: number,
  search?: string
): Promise<{ rows: AdminAddedRegistrationRow[]; total: number }> {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = client
    .from("students")
    .select(SELECT, { count: "exact" })
    .filter("metadata->>source", "eq", "admin_add_registration")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  query = applyStudentDirectorySearch(query, search || "");

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    rows: (data || []) as AdminAddedRegistrationRow[],
    total: count ?? 0,
  };
}

async function fetchAddedRegistrationsRpc(
  client: SupabaseClient,
  page: number,
  pageSize: number,
  search?: string
): Promise<{ rows: AdminAddedRegistrationRow[]; total: number }> {
  const p_search = search?.trim() || null;
  const p_limit = pageSize;
  const p_offset = page * pageSize;

  const [listRes, countRes] = await Promise.all([
    client.rpc("admin_list_added_registrations", { p_limit, p_offset, p_search }),
    client.rpc("admin_count_added_registrations", { p_search }),
  ]);

  if (listRes.error) throw listRes.error;
  if (countRes.error) throw countRes.error;

  return {
    rows: (listRes.data || []) as AdminAddedRegistrationRow[],
    total: Number(countRes.data) || 0,
  };
}

/** One page of admin-added registrations (RPC first — avoids RLS timeout). */
export async function fetchAdminAddedRegistrationsPage(
  client: SupabaseClient,
  page: number,
  pageSize: number,
  search?: string
): Promise<{ rows: AdminAddedRegistrationRow[]; total: number }> {
  try {
    return await fetchAddedRegistrationsRpc(client, page, pageSize, search);
  } catch (rpcErr) {
    if (!isMissingRpc(rpcErr as { code?: string; message?: string })) {
      if (isAuthError(rpcErr as { code?: string; message?: string; status?: number })) {
        throw new Error("Session expired — please sign out and log in again.");
      }
      throw rpcErr;
    }
  }

  try {
    return await fetchAddedRegistrationsDirect(client, page, pageSize, search);
  } catch (directErr) {
    const err = directErr as { code?: string; message?: string };
    if (err.code === "57014" || String(err.message || "").includes("timeout")) {
      throw new Error(
        "Query timed out. Run supabase/hotfix_admin_added_registrations.sql in Supabase SQL editor, then reload API schema."
      );
    }
    throw directErr;
  }
}
