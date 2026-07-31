import type { SupabaseClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import {
  LNMU_BULK_ATTENDANCE_END,
  LNMU_BULK_ATTENDANCE_START,
  markedAtToLocalDateKey,
  normalizeStudentId,
} from "@/lib/attendanceStats";
import {
  fetchAllSupabaseRows,
  type FetchAllSupabaseRowsOptions,
} from "@/lib/fetchAllSupabaseRows";
import {
  attendancePresentDaySet,
  countProgrammePresentDays,
} from "@/lib/studentPortalDocuments";

/**
 * Count a student's present days the SAME way the UI does:
 * distinct programme-window days when the university is known, otherwise
 * distinct calendar days. Keeps counts stable across the table, "+1 Day"
 * and the History dialog (no more 34 -> 22 jumps).
 */
function countPresentDays(
  rows: Array<{ marked_at?: string | null }>,
  uniName?: string | null
): number {
  if (uniName && uniName.trim()) {
    return countProgrammePresentDays(rows, uniName);
  }
  return attendancePresentDaySet(rows).size;
}

/** Keyset pagination for counting days per student (minimal columns). */
export const ATTENDANCE_COUNT_FETCH_OPTIONS: FetchAllSupabaseRowsOptions = {
  select: "id, student_id",
  orderBy: "id",
  ascending: true,
  tieBreaker: "id",
};

/** Full rows when history timestamps are needed. */
export const ATTENDANCE_ADMIN_FETCH_OPTIONS: FetchAllSupabaseRowsOptions = {
  select: "id, student_id, marked_at",
  orderBy: "marked_at",
  ascending: false,
  tieBreaker: "id",
};

export type AttendanceRow = {
  id: string;
  student_id: string;
  marked_at?: string;
};

export type AttendanceCountRow = {
  student_id: string;
  day_count: number;
};

const SCAN_PAGE_SIZE = 1000;
const HISTORY_COUNT_CONCURRENCY = 10;

function isMissingAttendanceCountsRpc(error: {
  code?: string;
  message?: string;
}): boolean {
  const msg = error.message ?? "";
  return (
    error.code === "42883" ||
    error.code === "PGRST202" ||
    /Could not find the function/i.test(msg) ||
    /admin_get_attendance_counts/i.test(msg)
  );
}

function countMapFromRows(rows: AttendanceCountRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const id = normalizeStudentId(row.student_id);
    if (!id) continue;
    counts[id] = row.day_count;
  }
  return counts;
}

function mergeCountMaps(
  target: Record<string, number>,
  source: Record<string, number>
): void {
  for (const [id, count] of Object.entries(source)) {
    target[id] = (target[id] || 0) + count;
  }
}

function mapRpcCountRows(data: unknown[]): AttendanceCountRow[] {
  return data.map((row) => ({
    student_id: String((row as { student_id: string }).student_id),
    day_count: Number((row as { day_count?: number }).day_count ?? 0),
  }));
}

/**
 * Paginate through all attendance rows and tally DISTINCT calendar days per
 * student (no 1000-row cap). Same-day duplicates are collapsed so the count
 * matches what the History dialog and "+1 Day" show.
 */
async function scanAttendanceCountMap(
  supabase: SupabaseClient,
  onPage?: (pageCounts: Record<string, number>) => void
): Promise<Record<string, number>> {
  const daysByStudent: Record<string, Set<string>> = {};
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("attendance")
      .select("student_id, marked_at")
      .order("id", { ascending: true })
      .range(offset, offset + SCAN_PAGE_SIZE - 1);

    if (error) throw error;

    const batch = data ?? [];
    if (!batch.length) break;

    const touched = new Set<string>();
    for (const row of batch as Array<{ student_id?: string | null; marked_at?: string | null }>) {
      const id = normalizeStudentId(row.student_id);
      if (!id || !row.marked_at) continue;
      (daysByStudent[id] ??= new Set<string>()).add(
        markedAtToLocalDateKey(row.marked_at)
      );
      touched.add(id);
    }

    if (touched.size > 0) {
      const pageCounts: Record<string, number> = {};
      for (const id of touched) pageCounts[id] = daysByStudent[id].size;
      onPage?.(pageCounts);
    }

    if (batch.length < SCAN_PAGE_SIZE) break;
    offset += SCAN_PAGE_SIZE;
  }

  const totals: Record<string, number> = {};
  for (const [id, days] of Object.entries(daysByStudent)) {
    totals[id] = days.size;
  }
  return totals;
}

/** Same query as History: select rows for one student, count distinct programme days. */
async function countAttendanceLikeHistory(
  supabase: SupabaseClient,
  studentId: string,
  uniName?: string | null
): Promise<number> {
  const { data, error } = await supabase
    .from("attendance")
    .select("marked_at")
    .eq("student_id", studentId);
  if (error) throw error;
  return countPresentDays(data ?? [], uniName);
}

async function fetchCountsViaHistoryQueries(
  supabase: SupabaseClient,
  studentIds: string[],
  onPage?: (pageCounts: Record<string, number>) => void,
  uniById?: Record<string, string>
): Promise<Record<string, number>> {
  const ids = [...new Set(studentIds.map((id) => String(id).trim()).filter(Boolean))];
  const totals: Record<string, number> = {};
  if (!ids.length) return totals;

  for (let i = 0; i < ids.length; i += HISTORY_COUNT_CONCURRENCY) {
    const chunk = ids.slice(i, i + HISTORY_COUNT_CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(async (student_id) => ({
        student_id,
        day_count: await countAttendanceLikeHistory(
          supabase,
          student_id,
          uniById?.[normalizeStudentId(student_id)]
        ),
      }))
    );
    const pageCounts: Record<string, number> = {};
    for (const row of chunkResults) {
      const id = normalizeStudentId(row.student_id);
      pageCounts[id] = row.day_count;
    }
    mergeCountMaps(totals, pageCounts);
    onPage?.(pageCounts);
  }

  return totals;
}

/**
 * Load all attendance day-counts for the admin attendance tab.
 * 1) SECURITY DEFINER RPC (fastest)
 * 2) Priority students (current page) via History-style queries
 * 3) Paginated attendance scan (only when explicitly allowed — 600k+ rows is slow)
 * 4) Per-student History queries for small id lists only (≤200)
 */
export async function fetchAllAttendanceCountsMap(
  supabase: SupabaseClient,
  studentIds: string[] = [],
  onPage?: (pageCounts: Record<string, number>) => void,
  priorityStudentIds: string[] = [],
  uniById: Record<string, string> = {},
  opts?: { allowFullScan?: boolean }
): Promise<Record<string, number>> {
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "admin_get_attendance_counts"
  );

  if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
    const map = countMapFromRows(mapRpcCountRows(rpcData));
    onPage?.(map);
    return map;
  }

  if (rpcError && !isMissingAttendanceCountsRpc(rpcError)) {
    console.warn("[attendance] RPC counts failed:", rpcError.message);
  }

  const totals: Record<string, number> = {};

  const priority = [...new Set(priorityStudentIds.map((id) => String(id).trim()).filter(Boolean))].slice(
    0,
    40
  );
  if (priority.length > 0) {
    const priorityMap = await fetchCountsViaHistoryQueries(
      supabase,
      priority,
      onPage,
      uniById
    );
    mergeCountMaps(totals, priorityMap);
  }

  if (opts?.allowFullScan) {
    try {
      const scanned = await scanAttendanceCountMap(supabase, onPage);
      if (Object.keys(scanned).length > 0) {
        return scanned;
      }
    } catch (scanErr) {
      console.warn("[attendance] Scan counts failed:", scanErr);
    }
  }

  // Never fire tens of thousands of per-student queries — that freezes the tab.
  const uniqueIds = [...new Set(studentIds.map((id) => String(id).trim()).filter(Boolean))];
  if (uniqueIds.length > 0 && uniqueIds.length <= 200) {
    const rest = uniqueIds.filter((id) => totals[normalizeStudentId(id)] == null);
    if (rest.length) {
      const restMap = await fetchCountsViaHistoryQueries(supabase, rest, onPage, uniById);
      mergeCountMaps(totals, restMap);
    }
  }

  return totals;
}

/** Fast path: counts for the visible page only (≈20 students). */
export async function fetchAttendanceCountsForStudentIds(
  supabase: SupabaseClient,
  studentIds: string[],
  uniById: Record<string, string> = {},
  onPage?: (pageCounts: Record<string, number>) => void
): Promise<Record<string, number>> {
  return fetchCountsViaHistoryQueries(supabase, studentIds, onPage, uniById);
}

/** Background full map via RPC only (no table scan). */
export async function fetchAttendanceCountsRpcOnly(
  supabase: SupabaseClient,
  onPage?: (pageCounts: Record<string, number>) => void
): Promise<Record<string, number>> {
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "admin_get_attendance_counts"
  );
  if (rpcError || !Array.isArray(rpcData) || rpcData.length === 0) {
    if (rpcError && !isMissingAttendanceCountsRpc(rpcError)) {
      console.warn("[attendance] RPC counts failed:", rpcError.message);
    }
    return {};
  }
  const map = countMapFromRows(mapRpcCountRows(rpcData));
  onPage?.(map);
  return map;
}

/** @deprecated Use fetchAllAttendanceCountsMap */
export async function fetchAttendanceCountsForAdmin(
  supabase: SupabaseClient,
  studentIds: string[] = [],
  onChunk?: (rows: AttendanceCountRow[]) => void
): Promise<AttendanceCountRow[]> {
  const map = await fetchAllAttendanceCountsMap(supabase, studentIds, (pageCounts) => {
    onChunk?.(
      Object.entries(pageCounts).map(([student_id, day_count]) => ({
        student_id,
        day_count,
      }))
    );
  });
  return Object.entries(map).map(([student_id, day_count]) => ({
    student_id,
    day_count,
  }));
}

export async function fetchAttendanceRowsForAdmin(
  supabase: SupabaseClient
): Promise<AttendanceRow[]> {
  return fetchAllSupabaseRows<AttendanceRow>(
    supabase,
    "attendance",
    ATTENDANCE_ADMIN_FETCH_OPTIONS
  );
}

export type AttendanceBulkMarkResult = {
  students_matched: number;
  records_inserted: number;
  start_date: string;
  end_date: string;
  university_name?: string | null;
  college_name?: string | null;
};

export type AttendanceBulkMarkFilters = {
  startDate?: string;
  endDate?: string;
  universityName?: string | null;
  collegeName?: string | null;
};

export type AttendanceResetFilters = {
  universityName?: string | null;
  collegeName?: string | null;
};

function isMissingRpcError(error: { code?: string; message?: string }): boolean {
  const msg = error.message ?? "";
  return (
    error.code === "42883" ||
    error.code === "PGRST202" ||
    /Could not find the function/i.test(msg) ||
    /does not exist/i.test(msg) ||
    /not exposed/i.test(msg) ||
    /admin_reset_all_attendance/i.test(msg) ||
    /admin_bulk_mark_attendance/i.test(msg) ||
    /admin_mark_student_attendance_day/i.test(msg)
  );
}

export async function adminResetAllAttendance(
  supabase: SupabaseClient,
  { universityName = null, collegeName = null }: AttendanceResetFilters = {}
): Promise<number> {
  const { data, error } = await supabase.rpc("admin_reset_all_attendance", {
    p_university_name: universityName || null,
    p_college_name: collegeName || null,
  });

  if (!error) return Number(data ?? 0);

  if (!isMissingRpcError(error)) throw error;

  let studentIds: string[] | null = null;
  if (universityName || collegeName) {
    let studentQuery = supabase.from("students").select("id");
    if (universityName) studentQuery = studentQuery.ilike("university_name", universityName);
    if (collegeName) studentQuery = studentQuery.ilike("college_name", collegeName);
    const { data: students, error: studentsErr } = await studentQuery;
    if (studentsErr) throw studentsErr;
    studentIds = (students || []).map((s) => s.id);
    if (studentIds.length === 0) return 0;
  }

  let countQuery = supabase.from("attendance").select("id", { count: "exact", head: true });
  if (studentIds) countQuery = countQuery.in("student_id", studentIds);
  const { count, error: countErr } = await countQuery;
  if (countErr) throw countErr;

  let deleteQuery = supabase.from("attendance").delete();
  if (studentIds) {
    deleteQuery = deleteQuery.in("student_id", studentIds);
  } else {
    deleteQuery = deleteQuery.not("id", "is", null);
  }

  const { error: delErr } = await deleteQuery;
  if (delErr) throw delErr;

  return count ?? 0;
}

export async function adminBulkMarkAttendance(
  supabase: SupabaseClient,
  {
    startDate = LNMU_BULK_ATTENDANCE_START,
    endDate = LNMU_BULK_ATTENDANCE_END,
    universityName = null,
    collegeName = null,
  }: AttendanceBulkMarkFilters = {}
): Promise<AttendanceBulkMarkResult> {
  const { data, error } = await supabase.rpc("admin_bulk_mark_attendance", {
    p_start_date: startDate,
    p_end_date: endDate,
    p_university_name: universityName || null,
    p_college_name: collegeName || null,
  });
  if (error) throw error;
  const row = (data || {}) as Record<string, unknown>;
  return {
    students_matched: Number(row.students_matched ?? 0),
    records_inserted: Number(row.records_inserted ?? 0),
    start_date: String(row.start_date ?? startDate),
    end_date: String(row.end_date ?? endDate),
    university_name: row.university_name != null ? String(row.university_name) : null,
    college_name: row.college_name != null ? String(row.college_name) : null,
  };
}

/** @deprecated Use adminBulkMarkAttendance with filters instead. */
export async function adminBulkMarkLnmuAttendance(
  supabase: SupabaseClient,
  startDate: string = LNMU_BULK_ATTENDANCE_START,
  endDate: string = LNMU_BULK_ATTENDANCE_END
): Promise<AttendanceBulkMarkResult> {
  const { data, error } = await supabase.rpc("admin_bulk_mark_lnmu_attendance", {
    p_start_date: startDate,
    p_end_date: endDate,
  });
  if (error) throw error;
  const row = (data || {}) as Record<string, unknown>;
  return {
    students_matched: Number(row.students_matched ?? 0),
    records_inserted: Number(row.records_inserted ?? 0),
    start_date: String(row.start_date ?? startDate),
    end_date: String(row.end_date ?? endDate),
  };
}

export function formatAttendanceBulkScopeLabel(
  universityName: string | null | undefined,
  collegeName: string | null | undefined,
  domainName?: string | null | undefined
): string {
  const parts: string[] = [];
  if (universityName) parts.push(`University: ${universityName}`);
  if (collegeName) parts.push(`College: ${collegeName}`);
  if (domainName) parts.push(`Domain: ${domainName}`);
  if (parts.length === 0) return "All students (all universities)";
  return parts.join(" · ");
}

export function isAttendanceResetScoped(
  universityName: string | null | undefined,
  collegeName: string | null | undefined,
  domainName?: string | null | undefined
): boolean {
  return Boolean(universityName || collegeName || domainName);
}

export function exportAttendanceReportXlsx(
  students: Array<{
    full_name?: string | null;
    email?: string | null;
    university_name?: string | null;
    college_name?: string | null;
    internship_domain?: string | null;
    total_days?: number;
    percentage?: number;
    isEligible?: boolean;
  }>,
  filename?: string
): void {
  const rows = students.map((s) => ({
    "Student Name": s.full_name || "",
    Email: s.email || "",
    University: s.university_name || "",
    College: s.college_name || "",
    Domain: s.internship_domain || "",
    "Total Days": s.total_days ?? 0,
    "Percentage %": Number(s.percentage ?? 0).toFixed(1),
    Eligible: s.isEligible ? "Yes" : "No",
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Attendance");
  XLSX.writeFile(
    wb,
    filename || `attendance_report_${new Date().toISOString().split("T")[0]}.xlsx`
  );
}

function attendanceErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const msg = String((err as { message?: unknown }).message || "").trim();
    if (msg) return msg;
  }
  return fallback;
}

/**
 * Admin/staff mark one programme day present for a student.
 * Prefer direct insert (no marked_by — that column is on employee_attendance only).
 * Fall back to SECURITY DEFINER RPC when table insert is blocked by RLS.
 */
export async function adminMarkStudentAttendanceDay(
  supabase: SupabaseClient,
  studentId: string,
  markedAtIso: string
): Promise<void> {
  const { error: insertErr } = await supabase.from("attendance").insert({
    student_id: studentId,
    marked_at: markedAtIso,
  });
  if (!insertErr) return;

  const insertMsg = attendanceErrorMessage(insertErr, "");
  const maybeRls =
    /permission|policy|row-level|rls|42501/i.test(insertMsg) ||
    String((insertErr as { code?: string }).code || "") === "42501";

  if (maybeRls) {
    const { error: rpcErr } = await supabase.rpc("admin_mark_student_attendance_day", {
      p_student_id: studentId,
      p_marked_at: markedAtIso,
    });
    if (!rpcErr) return;
    if (!isMissingRpcError(rpcErr)) {
      throw new Error(attendanceErrorMessage(rpcErr, "Could not mark attendance"));
    }
  }

  throw new Error(insertMsg || "Could not mark attendance");
}
