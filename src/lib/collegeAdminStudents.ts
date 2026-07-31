import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllSupabaseRpcRows } from "@/lib/fetchAllSupabaseRows";
import { type AssignedCollege } from "@/lib/collegeAdminScope";
import { isStudentVisibleInSupportDirectory } from "@/lib/studentPaymentAccess";

export type CollegeAdminPageResult = {
  students: Record<string, unknown>[];
  total: number;
};

export type CollegeAdminBootstrap = {
  assignedColleges: AssignedCollege[];
  students: Record<string, unknown>[];
  directoryCollegeNames: string[];
  /** DB count for full scope (matches list after pagination). */
  scopedStudentCount: number;
};

async function loadAssignedColleges(
  supabase: SupabaseClient,
  userId: string
): Promise<AssignedCollege[]> {
  // Avoid PostgREST embeds — AWS REST shim does not expand colleges(...).
  const { data: assignments, error: assignErr } = await supabase
    .from("college_admin_assignments")
    .select("college_id")
    .eq("user_id", userId);

  if (assignErr) throw assignErr;

  const collegeIds = [
    ...new Set((assignments || []).map((a: { college_id?: string }) => String(a.college_id || "")).filter(Boolean)),
  ];
  if (!collegeIds.length) return [];

  const { data: collegeRows, error: collegeErr } = await supabase
    .from("colleges")
    .select("id, name, university_id")
    .in("id", collegeIds);
  if (collegeErr) throw collegeErr;

  const uniIds = [
    ...new Set(
      (collegeRows || [])
        .map((c: { university_id?: string }) => String(c.university_id || ""))
        .filter(Boolean)
    ),
  ];
  const uniNameById = new Map<string, string>();
  if (uniIds.length) {
    const { data: unis } = await supabase.from("universities").select("id, name").in("id", uniIds);
    for (const u of unis || []) {
      uniNameById.set(String(u.id), String(u.name || ""));
    }
  }

  return (collegeRows || [])
    .map((c: { id?: string; name?: string; university_id?: string }) => {
      if (!c?.id || !c?.name) return null;
      return {
        id: String(c.id),
        name: String(c.name),
        universityName: uniNameById.get(String(c.university_id || "")) || null,
      };
    })
    .filter(Boolean) as AssignedCollege[];
}

function isStatementTimeout(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  return (
    String(e.code) === "57014" || /timeout|canceling statement/i.test(String(e.message || ""))
  );
}

async function loadDirectoryCollegeNames(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.rpc("college_admin_directory_college_names");
  if (error) throw error;
  return (data || [])
    .map((row: { directory_name?: string }) => String(row.directory_name || "").trim())
    .filter(Boolean);
}

async function loadScopedStudentCount(supabase: SupabaseClient): Promise<number | null> {
  const { data, error } = await supabase.rpc("college_admin_count_students");
  if (error) {
    if (isStatementTimeout(error)) return null;
    console.warn("college_admin_count_students:", error);
    return null;
  }
  return Number(data) || 0;
}

/** Paginate past PostgREST default 1000-row cap on RPC responses. */
async function loadAllScopedStudents(supabase: SupabaseClient): Promise<Record<string, unknown>[]> {
  const rows = await fetchAllSupabaseRpcRows<Record<string, unknown>>(supabase, "college_admin_list_students", {
    select: "gender,course,degree,department,college_name,created_at,id,metadata",
    orderBy: "created_at",
    ascending: false,
    tieBreaker: "id",
    pageSize: 1000,
  });
  return rows.filter((row) => isStudentVisibleInSupportDirectory(row));
}

async function loadStudentsForDirectoryCollege(
  supabase: SupabaseClient,
  directoryName: string
): Promise<Record<string, unknown>[]> {
  const rows = await fetchAllSupabaseRpcRows<Record<string, unknown>>(
    supabase,
    "college_admin_list_students_for_college",
    {
      args: { p_directory_name: directoryName },
      select: "gender,course,degree,department,college_name,created_at,id,metadata",
      orderBy: "created_at",
      ascending: false,
      tieBreaker: "id",
      pageSize: 1000,
    }
  );
  return rows.filter((row) => isStudentVisibleInSupportDirectory(row));
}

async function loadStudentsByDirectoryChunks(
  supabase: SupabaseClient,
  names: string[]
): Promise<Record<string, unknown>[]> {
  if (!names.length) return [];

  const concurrency = 4;
  const byId = new Map<string, Record<string, unknown>>();

  for (let i = 0; i < names.length; i += concurrency) {
    const chunk = names.slice(i, i + concurrency);
    const results = await Promise.all(
      chunk.map((name) => loadStudentsForDirectoryCollege(supabase, name))
    );
    for (const rows of results) {
      for (const row of rows) {
        const id = String(row.id || "");
        if (id) byId.set(id, row);
      }
    }
  }

  return [...byId.values()].sort((a, b) => {
    const ta = new Date(String(a.created_at || 0)).getTime();
    const tb = new Date(String(b.created_at || 0)).getTime();
    return tb - ta;
  });
}

/** Same rule as Admin directory: `eq(college_name, directoryName)`. */
export async function fetchCollegeAdminDirectoryStudentCount(
  supabase: SupabaseClient,
  directoryName: string
): Promise<number> {
  const { data, error } = await supabase.rpc("college_admin_count_students_for_college", {
    p_directory_name: directoryName,
  });
  if (!error && data != null) return Number(data) || 0;

  const students = await loadStudentsForDirectoryCollege(supabase, directoryName);
  return students.length;
}

/** Load assigned colleges + students (scoped to those colleges under their university). */
export async function fetchCollegeAdminPortalData(
  supabase: SupabaseClient,
  userId: string
): Promise<CollegeAdminBootstrap> {
  const assignedColleges = await loadAssignedColleges(supabase, userId);

  if (!assignedColleges.length) {
    return { assignedColleges: [], students: [], directoryCollegeNames: [], scopedStudentCount: 0 };
  }

  let directoryCollegeNames: string[] = [];
  let scopedStudentCount = 0;

  try {
    const [names, dbCount] = await Promise.all([
      loadDirectoryCollegeNames(supabase),
      loadScopedStudentCount(supabase),
    ]);
    directoryCollegeNames = names;
    if (dbCount != null) scopedStudentCount = dbCount;
  } catch (namesErr) {
    if (!isStatementTimeout(namesErr)) throw namesErr;
    console.warn("college_admin_directory_college_names timed out:", namesErr);
  }

  return {
    assignedColleges,
    students: [],
    directoryCollegeNames,
    scopedStudentCount,
  };
}

/** Reload students when user picks one directory college (fast indexed path). */
export async function fetchCollegeAdminStudentsForFilter(
  supabase: SupabaseClient,
  directoryName: string,
  cachedAllStudents: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  if (!directoryName) return cachedAllStudents;

  try {
    return await loadStudentsForDirectoryCollege(supabase, directoryName);
  } catch (error) {
    if (isStatementTimeout(error)) {
      return cachedAllStudents.filter(
        (s) => String((s as { college_name?: string }).college_name || "").trim() === directoryName
      );
    }
    throw error;
  }
}

/**
 * Server-side paginated student fetch for the College Dashboard Students tab.
 * Only fetches `pageSize` rows from the DB — no full-table load needed.
 *
 * @param page      0-indexed page number
 * @param pageSize  rows per page (default 12)
 * @param search    optional search string (applied as ilike on full_name/email)
 * @param collegeFilter  exact college_name to filter, or "all"
 */
export async function fetchCollegeAdminStudentsPage(
  supabase: SupabaseClient,
  page: number,
  pageSize: number,
  search: string,
  collegeFilter: string
): Promise<CollegeAdminPageResult> {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  // Build base RPC call — uses the same scoped RPC as before
  const rpcName =
    collegeFilter !== "all"
      ? "college_admin_list_students_for_college"
      : "college_admin_list_students";

  const rpcArgs: Record<string, unknown> =
    collegeFilter !== "all" ? { p_directory_name: collegeFilter } : {};

  // Build search filter string (reused for both data & count queries)
  const searchOr = search.trim()
    ? (() => {
        const q = `%${search.trim()}%`;
        return `full_name.ilike.${q},email.ilike.${q},contact_number.ilike.${q},registration_id.ilike.${q},college_name.ilike.${q},course.ilike.${q}`;
      })()
    : "";

  // ── 1) Data query — paginated ──────────────────────────────────────────────
  let query = (supabase.rpc(rpcName, rpcArgs) as any)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (searchOr) {
    query = query.or(searchOr);
  }

  const { data, error } = await query.range(from, to).returns<Record<string, unknown>[]>();
  if (error) throw error;

  // ── 2) Count query — pass count option directly to rpc() ───────────────────
  let total: number | null = null;

  // Strategy A: Use rpc with { count: 'exact', head: true } option
  try {
    let countQuery = supabase.rpc(rpcName, rpcArgs, {
      count: "exact" as any,
      head: true,
    }) as any;
    if (searchOr) countQuery = countQuery.or(searchOr);
    const { count: rpcCount } = await countQuery;
    if (rpcCount != null) total = rpcCount;
  } catch {
    // ignore — try next strategy
  }

  // Strategy B: Use dedicated count RPCs (accurate, but no search support)
  if (total == null) {
    try {
      if (collegeFilter !== "all") {
        const { data: cd } = await supabase.rpc(
          "college_admin_count_students_for_college",
          { p_directory_name: collegeFilter }
        );
        if (cd != null) total = Number(cd) || 0;
      } else {
        const { data: cd } = await supabase.rpc("college_admin_count_students");
        if (cd != null) total = Number(cd) || 0;
      }
    } catch {
      // ignore — try next strategy
    }
  }

  // Strategy C: Last resort — use data length (only accurate for last page)
  if (total == null) total = (data || []).length;

  const students = ((data || []) as Record<string, unknown>[]).filter((row) =>
    isStudentVisibleInSupportDirectory(row)
  );
  return { students, total };
}
