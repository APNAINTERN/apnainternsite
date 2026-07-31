import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadHuntRow, LeadSourceType } from "@/lib/leadHunt";
import { fetchAllSupabaseRows } from "@/lib/fetchAllSupabaseRows";

export type LeadCrmStatus =
  | "unassigned"
  | "pending"
  | "contacted"
  | "interested"
  | "not_interested"
  | "follow_up"
  | "converted"
  | "closed"
  | "wrong_number"
  | "not_reachable";

export type LeadCrmPriority = "low" | "medium" | "high";

export const LEAD_CRM_STATUSES: LeadCrmStatus[] = [
  "unassigned",
  "pending",
  "contacted",
  "interested",
  "not_interested",
  "follow_up",
  "converted",
  "closed",
  "wrong_number",
  "not_reachable",
];

export const STAFF_ACTION_STATUSES: LeadCrmStatus[] = [
  "contacted",
  "interested",
  "not_interested",
  "follow_up",
  "converted",
  "closed",
  "wrong_number",
  "not_reachable",
];

export const LEAD_CRM_STATUS_LABELS: Record<LeadCrmStatus, string> = {
  unassigned: "Unassigned",
  pending: "Pending",
  contacted: "Contacted",
  interested: "Interested",
  not_interested: "Not Interested",
  follow_up: "Follow-up",
  converted: "Converted",
  closed: "Closed",
  wrong_number: "Wrong Number",
  not_reachable: "Not Reachable",
};

export type LeadCrmRow = {
  id: string;
  source_type: LeadSourceType;
  source_id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  college_name: string | null;
  course: string | null;
  state: string | null;
  city: string | null;
  source: string | null;
  assigned_staff_id: string | null;
  status: LeadCrmStatus;
  priority: LeadCrmPriority;
  remarks: string | null;
  follow_up_at: string | null;
  assigned_at: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type StaffLeadTargets = {
  staff_id: string;
  daily_calls: number;
  weekly_calls: number;
  monthly_calls: number;
  updated_at?: string;
};

export type StaffLeadStats = {
  staff_id: string;
  full_name: string;
  email: string;
  employee_code: string;
  /** Total CRM rows currently assigned to this staff. */
  assigned: number;
  /** Not yet worked (pending / still unassigned status while assigned). */
  pending: number;
  contacted: number;
  interested: number;
  follow_up: number;
  converted: number;
  /** Terminal / dead-end outcomes (closed, not interested, wrong number, unreachable). */
  closed_out: number;
  completion_pct: number;
};

/** Bucket CRM rows for one staff into monitoring counters (buckets sum to assigned). */
export function summarizeAssignedCrmRows(
  mine: Array<{ status: LeadCrmStatus | string }>
): Omit<StaffLeadStats, "staff_id" | "full_name" | "email" | "employee_code"> {
  const assigned = mine.length;
  let pending = 0;
  let contacted = 0;
  let interested = 0;
  let follow_up = 0;
  let converted = 0;
  let closed_out = 0;

  for (const c of mine) {
    switch (c.status) {
      case "pending":
      case "unassigned":
        pending += 1;
        break;
      case "contacted":
        contacted += 1;
        break;
      case "interested":
        interested += 1;
        break;
      case "follow_up":
        follow_up += 1;
        break;
      case "converted":
        converted += 1;
        break;
      case "not_interested":
      case "closed":
      case "wrong_number":
      case "not_reachable":
        closed_out += 1;
        break;
      default:
        // Unknown status — keep totals consistent with assigned count.
        pending += 1;
        break;
    }
  }

  const completion_pct =
    assigned === 0 ? 0 : Math.round((converted / assigned) * 1000) / 10;

  return {
    assigned,
    pending,
    contacted,
    interested,
    follow_up,
    converted,
    closed_out,
    completion_pct,
  };
}

export type LeadAssignmentView = LeadHuntRow & {
  crm_id: string | null;
  crm_status: LeadCrmStatus;
  crm_priority: LeadCrmPriority;
  assigned_staff_id: string | null;
  assigned_staff_name: string | null;
  remarks: string | null;
  follow_up_at: string | null;
};

function crmKey(source_type: string, source_id: string) {
  return `${source_type}:${String(source_id)}`;
}

export function leadSelectionKey(
  row: Pick<LeadHuntRow, "source_type" | "source_id"> | Pick<LeadCrmRow, "source_type" | "source_id">
): string {
  return crmKey(row.source_type, String(row.source_id));
}

export function huntRowToCrmPayload(row: LeadHuntRow) {
  return {
    source_type: row.source_type,
    source_id: row.source_id,
    email: row.email || null,
    full_name: row.full_name || null,
    phone: row.contact_number || null,
    college_name: row.college_name || null,
    course: row.course || null,
    state: row.state || null,
    city: row.city || null,
    source: row.lead_source || null,
    priority: "medium",
  };
}

export async function fetchAllLeadCrm(client: SupabaseClient): Promise<LeadCrmRow[]> {
  const rows = await fetchAllSupabaseRows<LeadCrmRow>(client, "lead_crm", {
    select:
      "id,source_type,source_id,email,full_name,phone,college_name,course,state,city,source,assigned_staff_id,status,priority,remarks,follow_up_at,assigned_at,updated_by,created_at,updated_at",
    orderBy: "updated_at",
    ascending: false,
    tieBreaker: "id",
  });
  return rows || [];
}

/** Assigned CRM rows for one staff — used by the staff popup (not hunt-dependent). */
export async function fetchLeadCrmAssignedToStaff(
  client: SupabaseClient,
  staffId: string
): Promise<LeadCrmRow[]> {
  const rows = await fetchAllSupabaseRows<LeadCrmRow>(client, "lead_crm", {
    select:
      "id,source_type,source_id,email,full_name,phone,college_name,course,state,city,source,assigned_staff_id,status,priority,remarks,follow_up_at,assigned_at,updated_by,created_at,updated_at",
    orderBy: "updated_at",
    ascending: false,
    tieBreaker: "id",
    modify: (q) => q.eq("assigned_staff_id", staffId),
  });
  return rows || [];
}

export function crmRowToAssignmentView(
  crm: LeadCrmRow,
  staffNameById: Map<string, string>,
  hunt?: LeadHuntRow | null
): LeadAssignmentView {
  if (hunt) {
    return {
      ...hunt,
      crm_id: crm.id,
      crm_status: crm.status,
      crm_priority: crm.priority,
      assigned_staff_id: crm.assigned_staff_id,
      assigned_staff_name: crm.assigned_staff_id
        ? staffNameById.get(crm.assigned_staff_id) || "Staff"
        : null,
      remarks: crm.remarks,
      follow_up_at: crm.follow_up_at,
    };
  }
  return {
    id: crm.source_id,
    full_name: crm.full_name || "—",
    email: crm.email || "",
    contact_number: crm.phone || "",
    university_name: "",
    college_name: crm.college_name || "",
    course: crm.course || "",
    amount_paise: 0,
    failure_reason: "",
    payment_id: null,
    state: crm.state || "",
    city: crm.city || "",
    lead_source: crm.source || crm.source_type,
    created_at: crm.created_at,
    source_type: crm.source_type,
    source_id: String(crm.source_id),
    original: { ...crm },
    crm_id: crm.id,
    crm_status: crm.status,
    crm_priority: crm.priority,
    assigned_staff_id: crm.assigned_staff_id,
    assigned_staff_name: crm.assigned_staff_id
      ? staffNameById.get(crm.assigned_staff_id) || "Staff"
      : null,
    remarks: crm.remarks,
    follow_up_at: crm.follow_up_at,
  };
}

/** Ensure CRM rows exist for the given hunt rows and return their lead_crm ids (same order not guaranteed). */
export async function ensureLeadCrmRows(
  client: SupabaseClient,
  rows: LeadHuntRow[]
): Promise<string[]> {
  if (rows.length === 0) return [];
  const payload = rows.map(huntRowToCrmPayload);
  const ids: string[] = [];
  const chunkSize = 50;
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize);
    const { data, error } = await client.rpc("admin_ensure_lead_crm", { p_rows: chunk });
    if (error) throw error;
    if (Array.isArray(data)) {
      for (const id of data) {
        if (typeof id === "string" && id) ids.push(id);
      }
    }
  }

  // Prefer resolving by source keys (RPC may skip invalid rows)
  const keys = rows.map((r) => crmKey(r.source_type, r.source_id));
  const sourceIds = [...new Set(rows.map((r) => String(r.source_id)))];
  const matched: Array<{ id: string; source_type: string; source_id: string }> = [];
  const matchChunk = 100;
  for (let i = 0; i < sourceIds.length; i += matchChunk) {
    const chunk = sourceIds.slice(i, i + matchChunk);
    const { data, error: matchErr } = await client
      .from("lead_crm")
      .select("id,source_type,source_id")
      .in("source_id", chunk);
    if (matchErr) throw matchErr;
    for (const row of data || []) {
      matched.push({
        id: String(row.id),
        source_type: String(row.source_type),
        source_id: String(row.source_id),
      });
    }
  }
  const byKey = new Map(matched.map((r) => [crmKey(r.source_type, r.source_id), r.id]));
  const resolved = keys.map((k) => byKey.get(k)).filter((id): id is string => !!id);
  return resolved.length > 0 ? resolved : ids;
}

export async function assignLeads(
  client: SupabaseClient,
  opts: { staffIds: string[]; leadCrmIds: string[]; mode: "custom" | "equal" }
) {
  const { data, error } = await client.rpc("admin_assign_leads", {
    p_staff_ids: opts.staffIds,
    p_lead_crm_ids: opts.leadCrmIds,
    p_mode: opts.mode,
  });
  if (error) throw error;
  return data as { assigned: number; mode: string };
}

export async function unassignLeads(client: SupabaseClient, leadCrmIds: string[]) {
  const { data, error } = await client.rpc("admin_unassign_leads", {
    p_lead_crm_ids: leadCrmIds,
  });
  if (error) throw error;
  return data as { removed: number };
}

export async function staffUpdateLeadCrm(
  client: SupabaseClient,
  opts: {
    leadCrmId: string;
    status?: LeadCrmStatus | null;
    remarks?: string | null;
    followUpAt?: string | null;
    priority?: LeadCrmPriority | null;
    clearFollowUp?: boolean;
  }
) {
  const { data, error } = await client.rpc("staff_update_lead_crm", {
    p_lead_crm_id: opts.leadCrmId,
    p_status: opts.status ?? null,
    p_remarks: opts.remarks ?? null,
    p_follow_up_at: opts.followUpAt ?? null,
    p_priority: opts.priority ?? null,
    p_clear_follow_up: opts.clearFollowUp ?? false,
  });
  if (error) throw error;
  return data as LeadCrmRow;
}

/** Mark all Lead Assignment CRM rows for an email as Converted (payment / registration). */
export async function markLeadCrmConvertedByEmail(
  client: SupabaseClient,
  email: string,
  detail?: string
): Promise<{ ok?: boolean; updated?: number; created?: number } | null> {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized.includes("@")) return null;
  try {
    const { data, error } = await client.rpc("mark_lead_crm_converted_by_email", {
      p_email: normalized,
      p_detail: detail ?? null,
    });
    if (error) {
      console.warn("[lead-crm] auto-convert:", error.message);
      return null;
    }
    return (data || null) as { ok?: boolean; updated?: number; created?: number } | null;
  } catch (e) {
    console.warn("[lead-crm] auto-convert failed:", e);
    return null;
  }
}

/** Backfill Converted for CRM emails that already have a student row or successful payment. */
export async function syncLeadCrmConvertedFromEnrollments(
  client: SupabaseClient
): Promise<number> {
  try {
    const { data, error } = await client.rpc("sync_lead_crm_converted_from_enrollments");
    if (error) {
      console.warn("[lead-crm] sync converted:", error.message);
      return 0;
    }
    const updated = Number((data as { updated?: number } | null)?.updated ?? 0);
    return Number.isFinite(updated) ? updated : 0;
  } catch (e) {
    console.warn("[lead-crm] sync converted failed:", e);
    return 0;
  }
}

export async function upsertStaffLeadTargets(
  client: SupabaseClient,
  opts: { staffId: string; daily: number; weekly: number; monthly: number }
) {
  const { data, error } = await client.rpc("admin_upsert_staff_lead_targets", {
    p_staff_id: opts.staffId,
    p_daily_calls: opts.daily,
    p_weekly_calls: opts.weekly,
    p_monthly_calls: opts.monthly,
  });
  if (error) throw error;
  return data as StaffLeadTargets;
}

export async function fetchStaffLeadTargets(
  client: SupabaseClient,
  staffId?: string
): Promise<StaffLeadTargets[]> {
  let q = client.from("staff_lead_targets").select("*");
  if (staffId) q = q.eq("staff_id", staffId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as StaffLeadTargets[];
}

export async function fetchStaffForAssignment(client: SupabaseClient) {
  const { data, error } = await client
    .from("admin_staff")
    .select("id, email, full_name, employee_code, is_blocked")
    .eq("is_blocked", false)
    .order("full_name", { ascending: true });
  if (error) throw error;
  return data || [];
}

export function buildStaffLeadStats(
  staffRows: Array<{
    id: string;
    email: string | null;
    full_name: string | null;
    employee_code?: string | null;
  }>,
  crmRows: LeadCrmRow[]
): StaffLeadStats[] {
  return staffRows.map((s) => {
    const mine = crmRows.filter((c) => c.assigned_staff_id === s.id);
    const summary = summarizeAssignedCrmRows(mine);
    return {
      staff_id: s.id,
      full_name: s.full_name || s.email || "Staff",
      email: s.email || "",
      employee_code: s.employee_code || "—",
      ...summary,
    };
  });
}

export function mergeHuntWithCrm(
  huntRows: LeadHuntRow[],
  crmRows: LeadCrmRow[],
  staffNameById: Map<string, string>
): LeadAssignmentView[] {
  const byKey = new Map(crmRows.map((c) => [crmKey(c.source_type, c.source_id), c]));
  const seen = new Set<string>();
  const merged: LeadAssignmentView[] = huntRows.map((h) => {
    const key = crmKey(h.source_type, h.source_id);
    seen.add(key);
    const crm = byKey.get(key) || null;
    return {
      ...h,
      crm_id: crm?.id || null,
      crm_status: (crm?.status as LeadCrmStatus) || "unassigned",
      crm_priority: (crm?.priority as LeadCrmPriority) || "medium",
      assigned_staff_id: crm?.assigned_staff_id || null,
      assigned_staff_name: crm?.assigned_staff_id
        ? staffNameById.get(crm.assigned_staff_id) || "Staff"
        : null,
      remarks: crm?.remarks || null,
      follow_up_at: crm?.follow_up_at || null,
    };
  });

  // CRM-only rows (e.g. assigned leads whose hunt source left the hub) must still appear
  // so staff assigned counts match the popup / monitoring lists.
  for (const crm of crmRows) {
    const key = crmKey(crm.source_type, crm.source_id);
    if (seen.has(key)) continue;
    merged.push({
      id: crm.source_id,
      full_name: crm.full_name || "—",
      email: crm.email || "",
      contact_number: crm.phone || "",
      university_name: "",
      college_name: crm.college_name || "",
      course: crm.course || "",
      amount_paise: 0,
      failure_reason: "",
      payment_id: null,
      state: crm.state || "",
      city: crm.city || "",
      lead_source: crm.source || crm.source_type,
      created_at: crm.created_at,
      source_type: crm.source_type,
      source_id: crm.source_id,
      original: { ...crm },
      crm_id: crm.id,
      crm_status: crm.status,
      crm_priority: crm.priority,
      assigned_staff_id: crm.assigned_staff_id,
      assigned_staff_name: crm.assigned_staff_id
        ? staffNameById.get(crm.assigned_staff_id) || "Staff"
        : null,
      remarks: crm.remarks,
      follow_up_at: crm.follow_up_at,
    });
  }

  return merged;
}

export async function countStaffCallsInRange(
  client: SupabaseClient,
  staffId: string,
  fromIso: string,
  toIso: string
): Promise<number> {
  const { count, error } = await client
    .from("lead_crm_events")
    .select("id", { count: "exact", head: true })
    .eq("staff_id", staffId)
    .in("event_type", ["status_change", "remark", "follow_up", "update"])
    .gte("created_at", fromIso)
    .lt("created_at", toIso);
  if (error) throw error;
  return count || 0;
}

export function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function startOfWeek(d = new Date()): Date {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday start
  x.setDate(x.getDate() - diff);
  return x;
}

export function startOfMonth(d = new Date()): Date {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const esc = (v: string | number | null | undefined) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function filterLeadAssignmentViews(
  rows: LeadAssignmentView[],
  filters: {
    search?: string;
    college?: string;
    course?: string;
    state?: string;
    city?: string;
    source?: string;
    status?: string;
    priority?: string;
    dateFrom?: string;
    dateTo?: string;
  }
): LeadAssignmentView[] {
  const search = filters.search?.trim().toLowerCase() || "";
  return rows.filter((r) => {
    if (filters.college && filters.college !== "all" && r.college_name !== filters.college) return false;
    if (filters.course && filters.course !== "all" && r.course !== filters.course) return false;
    if (filters.state && filters.state !== "all" && (r.state || "") !== filters.state) return false;
    if (filters.city && filters.city !== "all" && (r.city || "") !== filters.city) return false;
    if (filters.source && filters.source !== "all" && (r.lead_source || "") !== filters.source) return false;
    if (filters.status && filters.status !== "all" && r.crm_status !== filters.status) return false;
    if (filters.priority && filters.priority !== "all" && r.crm_priority !== filters.priority) return false;
    if (filters.dateFrom) {
      if (new Date(r.created_at).getTime() < new Date(filters.dateFrom).getTime()) return false;
    }
    if (filters.dateTo) {
      const end = new Date(filters.dateTo);
      end.setHours(23, 59, 59, 999);
      if (new Date(r.created_at).getTime() > end.getTime()) return false;
    }
    if (!search) return true;
    return (
      r.full_name.toLowerCase().includes(search) ||
      r.email.toLowerCase().includes(search) ||
      String(r.contact_number || "").toLowerCase().includes(search) ||
      String(r.crm_id || "").toLowerCase().includes(search) ||
      r.id.toLowerCase().includes(search)
    );
  });
}
