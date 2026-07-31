import type { SupabaseClient } from "@supabase/supabase-js";

export type ReferralPartnerStats = {
  referral_code: string;
  total_clicks: number;
  total_students: number;
  approved_students: number;
};

export type ReferralStudentRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  contact_number: string | null;
  college_name: string | null;
  university_name: string | null;
  course: string | null;
  degree?: string | null;
  department?: string | null;
  gender?: string | null;
  class_semester?: string | null;
  academic_session?: string | null;
  roll_number?: string | null;
  parent_name?: string | null;
  registration_id: string | null;
  internship_domain?: string | null;
  emergency_name?: string | null;
  emergency_contact?: string | null;
  emergency_relation?: string | null;
  status: string | null;
  created_at: string | null;
  referral_code?: string | null;
};

export type PaginatedReferralStudents = {
  rows: ReferralStudentRow[];
  total: number;
  limit: number;
  offset: number;
  error?: string;
};

export type AdminReferralOverviewRow = {
  id: string;
  full_name: string;
  email: string;
  contact_number: string;
  referral_code: string;
  city: string | null;
  college_name: string | null;
  referral_type: string;
  active: boolean;
  created_at: string;
  auth_user_id: string | null;
  total_clicks: number;
  total_students: number;
  approved_students: number;
};

export async function fetchReferralPartnerStats(
  client: SupabaseClient
): Promise<ReferralPartnerStats | null> {
  const { data, error } = await client.rpc("referral_partner_stats");
  if (error) {
    console.warn("referral_partner_stats:", error.message);
    return null;
  }
  if (!data || data.error) return null;
  return data as ReferralPartnerStats;
}

export async function fetchReferralPartnerStudents(
  client: SupabaseClient,
  opts: { limit?: number; offset?: number; search?: string }
): Promise<PaginatedReferralStudents> {
  const { data, error } = await client.rpc("referral_partner_list_students", {
    p_limit: opts.limit ?? 20,
    p_offset: opts.offset ?? 0,
    p_search: opts.search?.trim() || null,
  });
  if (error) {
    console.warn("referral_partner_list_students:", error.message);
    return { rows: [], total: 0, limit: opts.limit ?? 20, offset: opts.offset ?? 0, error: error.message };
  }
  const parsed = (data || {}) as PaginatedReferralStudents;
  return {
    rows: parsed.rows || [],
    total: Number(parsed.total) || 0,
    limit: Number(parsed.limit) || opts.limit || 20,
    offset: Number(parsed.offset) || opts.offset || 0,
    error: parsed.error,
  };
}

function parseRpcJsonArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function fetchAdminReferralOverview(
  client: SupabaseClient
): Promise<AdminReferralOverviewRow[]> {
  const { data, error } = await client.rpc("admin_referral_overview");
  if (error) {
    console.warn("admin_referral_overview:", error.message);
    return [];
  }
  return parseRpcJsonArray<AdminReferralOverviewRow>(data);
}

export async function fetchAdminReferralPartnerStudents(
  client: SupabaseClient,
  partnerId: string,
  opts: { limit?: number; offset?: number; search?: string }
): Promise<PaginatedReferralStudents> {
  const { data, error } = await client.rpc("admin_referral_partner_students", {
    p_partner_id: partnerId,
    p_limit: opts.limit ?? 20,
    p_offset: opts.offset ?? 0,
    p_search: opts.search?.trim() || null,
  });
  if (error) {
    console.warn("admin_referral_partner_students:", error.message);
    return { rows: [], total: 0, limit: opts.limit ?? 20, offset: opts.offset ?? 0, error: error.message };
  }
  const parsed = (data || {}) as PaginatedReferralStudents;
  return {
    rows: parsed.rows || [],
    total: Number(parsed.total) || 0,
    limit: Number(parsed.limit) || opts.limit || 20,
    offset: Number(parsed.offset) || opts.offset || 0,
    error: parsed.error,
  };
}
