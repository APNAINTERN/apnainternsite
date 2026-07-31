import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllSupabaseRows, fetchAllSupabaseRpcRows } from "@/lib/fetchAllSupabaseRows";
import { sanitizeStudentSearchTerm } from "@/lib/studentDirectorySearch";
import { matchesInternshipModeFilter } from "@/lib/internshipMode";
import { isStudentVisibleInSupportDirectory } from "@/lib/studentPaymentAccess";
import {
  filterNonTechDirectoryStudents,
  resolveEngineeringUniversityNames,
} from "@/lib/studentTrack";

export type AdminStudentDirectoryFilters = {
  searchTerm?: string;
  domainFilter?: string;
  uniFilter?: string;
  collegeFilter?: string;
  modeFilter?: string;
  startDate?: string;
  endDate?: string;
  dateFilter?: string;
};

function directoryDateRange(filters: AdminStudentDirectoryFilters): {
  p_start: string | null;
  p_end: string | null;
} {
  const { startDate, endDate, dateFilter } = filters;
  if (startDate) {
    return {
      p_start: `${startDate}T00:00:00`,
      p_end: endDate ? `${endDate}T23:59:59` : null,
    };
  }
  if (dateFilter) {
    return {
      p_start: `${dateFilter}T00:00:00`,
      p_end: `${dateFilter}T23:59:59`,
    };
  }
  return { p_start: null, p_end: null };
}

function rpcFilterArgs(filters: AdminStudentDirectoryFilters) {
  const { p_start, p_end } = directoryDateRange(filters);
  const domain = filters.domainFilter && filters.domainFilter !== "all" ? filters.domainFilter : null;
  const university = filters.uniFilter && filters.uniFilter !== "all" ? filters.uniFilter : null;
  const college = filters.collegeFilter && filters.collegeFilter !== "all" ? filters.collegeFilter : null;
  const mode = filters.modeFilter && filters.modeFilter !== "all" ? filters.modeFilter : null;
  const search = sanitizeStudentSearchTerm(filters.searchTerm || "") || null;

  return {
    p_search: search,
    p_domain: domain,
    p_university: university,
    p_college: college,
    p_mode: mode,
    p_start,
    p_end,
  };
}

function isMissingRpc(err: { code?: string; message?: string; status?: number } | null): boolean {
  if (!err) return false;
  const msg = String(err.message || "").toLowerCase();
  return (
    err.code === "PGRST202" ||
    err.status === 404 ||
    msg.includes("could not find") ||
    msg.includes("does not exist") ||
    msg.includes("schema cache")
  );
}

function legacyRpcFilterArgs(filters: AdminStudentDirectoryFilters) {
  const { p_mode: _mode, ...legacy } = rpcFilterArgs(filters);
  return legacy;
}

/** Drop heavy metadata blobs from paginated directory rows (fetch full row on View). */
export function slimDirectoryRows(
  rows: Record<string, unknown>[]
): Record<string, unknown>[] {
  return rows.map((row) => {
    const rawMeta = row.metadata;
    let slimMeta: Record<string, unknown> | null = null;
    if (rawMeta != null) {
      const parsed =
        typeof rawMeta === "object" && !Array.isArray(rawMeta)
          ? (rawMeta as Record<string, unknown>)
          : (() => {
              try {
                const p = JSON.parse(String(rawMeta));
                return p && typeof p === "object" && !Array.isArray(p)
                  ? (p as Record<string, unknown>)
                  : null;
              } catch {
                return null;
              }
            })();
      if (parsed) {
        slimMeta = {
          source: parsed.source,
          payment_required: parsed.payment_required,
          bulk_upload_paid: parsed.bulk_upload_paid,
          razorpay_payment_id: parsed.razorpay_payment_id,
        };
      }
    }
    const { metadata: _meta, ...rest } = row;
    return slimMeta ? { ...rest, metadata: slimMeta } : rest;
  });
}

/** Keep unpaid Student Data Upload rows out of support Directory / module lists. */
export function filterDirectoryEligibleStudents<T extends { metadata?: unknown }>(
  rows: T[]
): T[] {
  return rows.filter((row) => isStudentVisibleInSupportDirectory(row));
}

let superAdminIdsCache: string[] | null = null;

export async function fetchSuperAdminUserIds(client: SupabaseClient): Promise<string[]> {
  if (superAdminIdsCache) return superAdminIdsCache;
  const { data } = await client.from("user_roles").select("user_id").eq("role", "super_admin");
  superAdminIdsCache = (data || []).map((r) => String(r.user_id));
  return superAdminIdsCache;
}

async function tryDirectoryRpc(
  client: SupabaseClient,
  page: number,
  pageSize: number,
  filterArgs: Record<string, unknown>
): Promise<{ rows: Record<string, unknown>[]; total: number } | null> {
  const p_limit = pageSize;
  const p_offset = page * pageSize;

  const [listRes, countRes] = await Promise.all([
    client.rpc("admin_list_students_directory", {
      p_limit,
      p_offset,
      ...filterArgs,
    }),
    client.rpc("admin_count_students_directory", filterArgs),
  ]);

  if (!listRes.error && !countRes.error) {
    const raw = (listRes.data as Record<string, unknown>[]) || [];
    const eligible = filterDirectoryEligibleStudents(raw);
    const rows = slimDirectoryRows(eligible);
    // Prefer server total; if unpaid rows were stripped client-side, shrink by removed count.
    const removed = raw.length - eligible.length;
    const serverTotal = Number(countRes.data) || 0;
    return {
      rows,
      total: Math.max(0, serverTotal - removed),
    };
  }

  if (isMissingRpc(listRes.error) || isMissingRpc(countRes.error)) {
    return null;
  }

  throw listRes.error || countRes.error;
}

export async function fetchAdminStudentDirectoryPage(
  client: SupabaseClient,
  page: number,
  pageSize: number,
  filters: AdminStudentDirectoryFilters
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  const engNames = await resolveEngineeringUniversityNames(client);
  const engNameSet = new Set(engNames);

  const fullArgs = rpcFilterArgs(filters);
  const legacyArgs = legacyRpcFilterArgs(filters);
  const modeActive = Boolean(fullArgs.p_mode);

  // Prefer full RPC (includes p_mode) when deployed; fall back to legacy 6-arg signature.
  let result = await tryDirectoryRpc(client, page, pageSize, fullArgs);
  if (!result) {
    result = await tryDirectoryRpc(client, page, pageSize, legacyArgs);
    if (result && modeActive) {
      const filtered = result.rows.filter((row) =>
        matchesInternshipModeFilter(row, String(fullArgs.p_mode))
      );
      result = { rows: filtered, total: filtered.length };
    }
  }

  if (result) {
    const before = result.rows.length;
    const rows = filterNonTechDirectoryStudents(result.rows, engNameSet);
    const removed = before - rows.length;
    return {
      rows,
      total: Math.max(0, result.total - removed),
    };
  }

  const fallback = await fetchAdminStudentDirectoryPageFallback(
    client,
    page,
    pageSize,
    filters,
    engNames
  );
  return { rows: slimDirectoryRows(fallback.rows), total: fallback.total };
}

async function fetchAdminStudentDirectoryPageFallback(
  client: SupabaseClient,
  page: number,
  pageSize: number,
  filters: AdminStudentDirectoryFilters,
  engineeringUniversityNames: string[] = []
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  let query = client
    .from("students")
    .select(
      "id, full_name, email, contact_number, gender, parent_name, university_name, college_name, degree, department, class_semester, academic_session, roll_number, course, internship_domain, internship_duration, joining_date, completion_date, emergency_name, emergency_contact, emergency_relation, referral_code, cybercafe_shop_name, cybercafe_email, status, registration_id, metadata, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  // Directory = Non-Technical only — exclude Engineering universities.
  if (engineeringUniversityNames.length > 0) {
    query = query.not(
      "university_name",
      "in",
      `(${engineeringUniversityNames.map((n) => `"${n.replace(/"/g, '\\"')}"`).join(",")})`
    );
  }

  const search = sanitizeStudentSearchTerm(filters.searchTerm || "");
  if (search) {
    const pattern = `%${search.replace(/"/g, '\\"')}%`;
    query = query.or(
      [
        `full_name.ilike."${pattern}"`,
        `email.ilike."${pattern}"`,
        `registration_id.ilike."${pattern}"`,
      ].join(",")
    );
  }
  if (filters.domainFilter && filters.domainFilter !== "all") {
    const domain = filters.domainFilter;
    query = query.or(
      [
        `internship_domain.eq.${domain}`,
        `course.eq.${domain}`,
        `metadata->>internship_domain.eq.${domain}`,
        `metadata->>course.eq.${domain}`,
      ].join(",")
    );
  }
  if (filters.uniFilter && filters.uniFilter !== "all") {
    query = query.eq("university_name", filters.uniFilter);
  }
  if (filters.collegeFilter && filters.collegeFilter !== "all") {
    query = query.eq("college_name", filters.collegeFilter);
  }
  if (filters.modeFilter && filters.modeFilter !== "all") {
    query = query.or(
      [
        `metadata->>internship_mode.eq.${filters.modeFilter}`,
        `metadata->>internshipMode.eq.${filters.modeFilter}`,
      ].join(",")
    );
  }

  const { p_start, p_end } = directoryDateRange(filters);
  if (p_start) query = query.gte("created_at", p_start);
  if (p_end) query = query.lte("created_at", p_end);

  const from = page * pageSize;
  const to = from + pageSize - 1;
  const { data, count, error } = await query.range(from, to);
  if (error) throw error;

  let rows = (data as Record<string, unknown>[]) || [];
  if (filters.modeFilter && filters.modeFilter !== "all") {
    rows = rows.filter((row) => matchesInternshipModeFilter(row, filters.modeFilter!));
  }
  rows = filterDirectoryEligibleStudents(rows);
  rows = filterNonTechDirectoryStudents(rows, engineeringUniversityNames);

  return { rows, total: count || rows.length };
}

const DIRECTORY_EXPORT_PAGE_SIZE = 500;
const DIRECTORY_EXPORT_MAX_ROWS = 200_000;

/** Fetch all directory rows for export using paginated admin RPC. */
export async function fetchAdminStudentDirectoryAll(
  client: SupabaseClient,
  filters: AdminStudentDirectoryFilters
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let page = 0;

  while (all.length < DIRECTORY_EXPORT_MAX_ROWS) {
    const { rows } = await fetchAdminStudentDirectoryPage(
      client,
      page,
      DIRECTORY_EXPORT_PAGE_SIZE,
      filters
    );
    if (!rows.length) break;
    all.push(...rows);
    if (rows.length < DIRECTORY_EXPORT_PAGE_SIZE) break;
    page += 1;
  }

  return all;
}

/** Light student list for attendance/certs/comms (paginates past PostgREST 1000-row cap). */
export const ADMIN_STUDENTS_LIGHT_SELECT =
  "id, full_name, email, college_name, university_name, created_at, status, internship_domain, registration_id, roll_number, degree, department, course, gender, contact_number, class_semester, academic_session, metadata";

/** In-memory cache so Admin/Staff tab switches don't re-download ~30k students. */
const STUDENTS_LIGHT_CACHE_TTL_MS = 10 * 60 * 1000;
let studentsLightCache: { at: number; rows: Record<string, unknown>[] } | null = null;
let studentsLightInFlight: Promise<Record<string, unknown>[]> | null = null;

export function invalidateAdminStudentsLightCache(): void {
  studentsLightCache = null;
  studentsLightInFlight = null;
}

async function fetchAdminStudentsLightUncached(
  client: SupabaseClient
): Promise<Record<string, unknown>[]> {
  const pageSize = 1000;
  const maxRows = 80_000;
  const all: Record<string, unknown>[] = [];
  let rpcError: unknown = null;

  // Prefer paginated RPC (avoids dumping 30k+ rows in one Lambda response).
  try {
    for (let offset = 0; offset < maxRows; offset += pageSize) {
      const { data, error } = await client.rpc("admin_list_students_light", {
        p_limit: pageSize,
        p_offset: offset,
      });
      if (error) throw error;
      const batch = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
      if (!batch.length) break;
      all.push(...batch);
      if (batch.length < pageSize) break;
    }
    if (all.length) {
      return filterDirectoryEligibleStudents(all);
    }
  } catch (err) {
    rpcError = err;
    // Fall through: zero-arg RPC, then table keyset pagination.
    try {
      const { data, error } = await client.rpc("admin_list_students_light");
      if (!error && Array.isArray(data) && data.length) {
        return filterDirectoryEligibleStudents(data as Record<string, unknown>[]);
      }
      if (error && !isMissingRpc(error as { code?: string; message?: string })) {
        console.warn("[admin] admin_list_students_light failed, using table fallback", error);
        rpcError = error;
      }
    } catch (e) {
      if (!isMissingRpc(e as { code?: string; message?: string })) {
        console.warn("[admin] admin_list_students_light failed, using table fallback", e);
        rpcError = e;
      }
    }
  }

  // Order by id — students.created_at is often blank text and breaks keyset paging.
  try {
    const rows = await fetchAllSupabaseRows<Record<string, unknown>>(client, "students", {
      select: ADMIN_STUDENTS_LIGHT_SELECT,
      orderBy: "id",
      ascending: false,
      tieBreaker: "id",
      pageSize: 1000,
      maxRows,
    });
    return filterDirectoryEligibleStudents(rows);
  } catch (tableErr) {
    console.error("[admin] students light list failed", rpcError || tableErr);
    throw rpcError || tableErr;
  }
}

export async function fetchAdminStudentsLight(
  client: SupabaseClient,
  opts?: { force?: boolean }
): Promise<Record<string, unknown>[]> {
  const now = Date.now();
  if (
    !opts?.force &&
    studentsLightCache &&
    now - studentsLightCache.at < STUDENTS_LIGHT_CACHE_TTL_MS
  ) {
    return studentsLightCache.rows;
  }
  if (!opts?.force && studentsLightInFlight) {
    return studentsLightInFlight;
  }

  const task = (async () => {
    const rows = await fetchAdminStudentsLightUncached(client);
    studentsLightCache = { at: Date.now(), rows };
    return rows;
  })();

  studentsLightInFlight = task;
  try {
    return await task;
  } finally {
    if (studentsLightInFlight === task) studentsLightInFlight = null;
  }
}

export async function fetchAdminSiteVisitStats(
  client: SupabaseClient
): Promise<{ totalVisits: number; uniqueVisitors: number }> {
  const { data, error } = await client.rpc("admin_site_visit_stats");
  if (!error && data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    return {
      totalVisits: Number(o.total_visits) || 0,
      uniqueVisitors: Number(o.unique_visitors) || 0,
    };
  }
  const errCode = error?.code;
  const errStatus = (error as { status?: number } | null)?.status;
  const errMsg = String(error?.message || "").toLowerCase();
  const isTimeout =
    errCode === "57014" ||
    errMsg.includes("timeout") ||
    errMsg.includes("canceling statement");
  const isBrokenRpc =
    errStatus === 500 ||
    errMsg.includes("set is not allowed") ||
    errMsg.includes("non-volatile function");
  if (isTimeout || isBrokenRpc) {
    console.warn("[admin] site_visits stats RPC failed — showing 0", error);
    return { totalVisits: 0, uniqueVisitors: 0 };
  }
  if (isMissingRpc(error)) {
    const { count } = await client.from("site_visits").select("*", { count: "exact", head: true });
    return { totalVisits: count || 0, uniqueVisitors: 0 };
  }
  throw error;
}
