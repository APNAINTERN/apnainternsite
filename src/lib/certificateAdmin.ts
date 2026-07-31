import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ClassTargetFilters,
  filtersToTargetArrays,
  studentMatchesClassTargets,
} from "@/lib/classLinkTargeting";
import { CERTIFICATE_INTERNSHIP_PERIOD } from "@/lib/certificateFormat";
import { fetchAllSupabaseRows } from "@/lib/fetchAllSupabaseRows";
import { studentInternshipMode } from "@/lib/internshipMode";

export type CertEligibleStudent = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  registration_id?: string | null;
  roll_number?: string | null;
  university_name?: string | null;
  college_name?: string | null;
  department?: string | null;
  subject?: string | null;
  internship_domain?: string | null;
  course?: string | null;
  internship_mode?: string | null;
  metadata?: Record<string, unknown> | null;
  total_days?: number;
  percentage?: number;
  isEligible?: boolean;
  status?: string | null;
};

export type CertificateAudienceFilters = ClassTargetFilters & {
  /** Empty = all departments */
  departments: string[];
  /** Empty = all subjects */
  subjects: string[];
};

export const emptyCertificateAudienceFilters = (): CertificateAudienceFilters => ({
  universities: [],
  colleges: [],
  domain: "all",
  mode: "all",
  departments: [],
  subjects: [],
});

function studentDepartment(student: {
  department?: string | null;
  metadata?: Record<string, unknown> | null;
}): string {
  const meta = student.metadata || {};
  return String(student.department || meta.department || "").trim();
}

function studentSubject(student: {
  subject?: string | null;
  metadata?: Record<string, unknown> | null;
}): string {
  const meta = student.metadata || {};
  return String(student.subject || meta.subject || "").trim();
}

export function filterStudentsForCertTargets(
  students: CertEligibleStudent[],
  filters: CertificateAudienceFilters,
  opts?: {
    colleges?: { id: string; name: string; university_id: string }[];
    unis?: { id: string; name: string }[];
  }
): CertEligibleStudent[] {
  const target = filtersToTargetArrays(filters);
  const pseudoClass = {
    target_universities: target.target_universities,
    target_colleges: target.target_colleges,
    target_domains: target.target_domains,
    target_modes: target.target_modes,
    domain_id: null,
    internship_domains: null,
  };
  return students.filter((s) => {
    if (s.status === "Blocked") return false;
    if (!studentMatchesClassTargets(s, pseudoClass, opts)) return false;
    if (filters.departments.length > 0) {
      const dept = studentDepartment(s);
      if (!filters.departments.includes(dept)) return false;
    }
    if (filters.subjects.length > 0) {
      const subject = studentSubject(s);
      if (!subject || !filters.subjects.includes(subject)) return false;
    }
    return true;
  });
}

export async function fetchTopAssignmentScoreByStudent(
  client: SupabaseClient,
  studentIds: string[]
): Promise<Record<string, number>> {
  const scores: Record<string, number> = {};
  if (!studentIds.length) return scores;

  const chunkSize = 100;
  for (let i = 0; i < studentIds.length; i += chunkSize) {
    const chunk = studentIds.slice(i, i + chunkSize);
    const { data, error } = await client
      .from("assignment_submissions")
      .select("student_id, score, grading_status, assignments(total_marks)")
      .in("student_id", chunk)
      .eq("grading_status", "graded");
    if (error) throw error;
    for (const row of data || []) {
      const id = String(row.student_id);
      const score = Number(row.score) || 0;
      const totalMarks = Math.max(
        1,
        Number((row.assignments as { total_marks?: number } | null)?.total_marks) || 1
      );
      const pct = (score / totalMarks) * 100;
      scores[id] = Math.max(scores[id] || 0, pct);
    }
  }
  return scores;
}

export async function fetchExistingCertificateUserIds(
  client: SupabaseClient,
  userIds: string[]
): Promise<Set<string>> {
  const found = new Set<string>();
  if (!userIds.length) return found;
  const chunkSize = 100;
  for (let i = 0; i < userIds.length; i += chunkSize) {
    const chunk = userIds.slice(i, i + chunkSize);
    const { data, error } = await client
      .from("certificates")
      .select("user_id")
      .in("user_id", chunk);
    if (error) throw error;
    for (const row of data || []) {
      if (row.user_id) found.add(String(row.user_id));
    }
  }
  return found;
}

export type CertificateDirectoryFilters = {
  search?: string;
  universities?: string[];
  colleges?: string[];
  domain?: string;
  mode?: string;
  departments?: string[];
  subjects?: string[];
};

export type CertificateRecord = {
  id: string;
  user_id: string | null;
  student_name: string;
  certificate_id: string;
  internship_name: string;
  duration: string;
  status: string;
  issue_date?: string | null;
  created_at?: string | null;
  display_overrides?: Record<string, unknown> | null;
};

function hasCertDirectoryStudentFilters(filters: CertificateDirectoryFilters): boolean {
  return (
    (filters.universities?.length ?? 0) > 0 ||
    (filters.colleges?.length ?? 0) > 0 ||
    (filters.departments?.length ?? 0) > 0 ||
    (filters.subjects?.length ?? 0) > 0 ||
    (Boolean(filters.domain) && filters.domain !== "all") ||
    (Boolean(filters.mode) && filters.mode !== "all")
  );
}

function studentMatchesCertDirectoryFilters(
  student: Record<string, unknown>,
  filters: CertificateDirectoryFilters
): boolean {
  if (filters.universities?.length) {
    const uni = String(student.university_name || "").trim();
    if (!filters.universities.includes(uni)) return false;
  }
  if (filters.colleges?.length) {
    const college = String(student.college_name || "").trim();
    if (!filters.colleges.includes(college)) return false;
  }
  if (filters.departments?.length) {
    if (!filters.departments.includes(studentDepartment(student))) return false;
  }
  if (filters.subjects?.length) {
    if (!filters.subjects.includes(studentSubject(student))) return false;
  }
  if (filters.domain && filters.domain !== "all") {
    const domain = String(student.internship_domain || student.course || "").trim();
    if (domain !== filters.domain) return false;
  }
  if (filters.mode && filters.mode !== "all") {
    if (studentInternshipMode(student) !== filters.mode) return false;
  }
  return true;
}

function certMatchesDirectorySearch(
  cert: CertificateRecord,
  student: Record<string, unknown> | undefined,
  search: string
): boolean {
  const q = search.toLowerCase();
  const parts = [
    cert.student_name,
    cert.certificate_id,
    student?.full_name,
    student?.email,
    student?.registration_id,
    student?.roll_number,
  ];
  return parts.some((v) => String(v ?? "").toLowerCase().includes(q));
}

function certDirectoryFilterArgs(filters: CertificateDirectoryFilters) {
  return {
    p_search: filters.search?.trim() || null,
    p_universities: filters.universities?.length ? filters.universities : null,
    p_colleges: filters.colleges?.length ? filters.colleges : null,
    p_domain: filters.domain && filters.domain !== "all" ? filters.domain : null,
    p_mode: filters.mode && filters.mode !== "all" ? filters.mode : null,
    p_departments: filters.departments?.length ? filters.departments : null,
    p_subjects: filters.subjects?.length ? filters.subjects : null,
  };
}

/** Older Supabase RPC (before department/subject params). */
function certDirectoryFilterArgsLegacy(filters: CertificateDirectoryFilters) {
  return {
    p_search: filters.search?.trim() || null,
    p_universities: filters.universities?.length ? filters.universities : null,
    p_colleges: filters.colleges?.length ? filters.colleges : null,
    p_domain: filters.domain && filters.domain !== "all" ? filters.domain : null,
    p_mode: filters.mode && filters.mode !== "all" ? filters.mode : null,
  };
}

async function fetchMatchingStudentIdsForCertDirectory(
  client: SupabaseClient,
  filters: CertificateDirectoryFilters
): Promise<string[]> {
  // `subject` and `internship_mode` are not real columns on `students`
  // (they live in metadata), so selecting them 400s the whole request.
  const rows = await fetchAllSupabaseRows<Record<string, unknown>>(client, "students", {
    select:
      "id, university_name, college_name, department, internship_domain, course, metadata, created_at",
    modify: (query) => {
      let q = query;
      if (filters.universities?.length) {
        q = q.in("university_name", filters.universities);
      }
      if (filters.colleges?.length) {
        q = q.in("college_name", filters.colleges);
      }
      if (filters.departments?.length) {
        q = q.in("department", filters.departments);
      }
      return q;
    },
  });

  return rows
    .filter((row) => studentMatchesCertDirectoryFilters(row, filters))
    .map((row) => String(row.id || ""))
    .filter(Boolean);
}

async function fetchCertificatesForStudentIds(
  client: SupabaseClient,
  studentIds: string[]
): Promise<CertificateRecord[]> {
  const out: CertificateRecord[] = [];
  const chunkSize = 150;
  for (let i = 0; i < studentIds.length; i += chunkSize) {
    const chunk = studentIds.slice(i, i + chunkSize);
    const { data, error } = await client.from("certificates").select("*").in("user_id", chunk);
    if (error) throw error;
    out.push(...((data as CertificateRecord[]) || []));
  }
  out.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });
  return out;
}

async function fetchCertificatesDirectoryPageClientFiltered(
  client: SupabaseClient,
  page: number,
  pageSize: number,
  filters: CertificateDirectoryFilters
): Promise<{ rows: CertificateRecord[]; total: number }> {
  const search = filters.search?.trim() || "";
  const scopedByStudents = hasCertDirectoryStudentFilters(filters);
  const studentIds = scopedByStudents
    ? await fetchMatchingStudentIdsForCertDirectory(client, filters)
    : null;

  if (studentIds && studentIds.length === 0) {
    return { rows: [], total: 0 };
  }

  let certs: CertificateRecord[];
  if (studentIds) {
    certs = await fetchCertificatesForStudentIds(client, studentIds);
  } else {
    certs = await fetchAllSupabaseRows<CertificateRecord>(client, "certificates", {
      select: "*",
      orderBy: "created_at",
      ascending: false,
    });
  }

  if (search) {
    const userIds = certs
      .map((c) => String(c.user_id || ""))
      .filter(Boolean);
    const studentMap = await fetchStudentsByIdsForCerts(client, userIds);
    certs = certs.filter((cert) =>
      certMatchesDirectorySearch(
        cert,
        studentMap.get(String(cert.user_id || "")),
        search
      )
    );
  }

  const total = certs.length;
  const rows = certs.slice(page * pageSize, (page + 1) * pageSize);
  return { rows, total };
}

async function fetchCertificatesDirectoryViaRpc(
  client: SupabaseClient,
  page: number,
  pageSize: number,
  filterArgs: Record<string, unknown>
): Promise<{ rows: CertificateRecord[]; total: number } | null> {
  const p_limit = pageSize;
  const p_offset = page * pageSize;
  const [listRes, countRes] = await Promise.all([
    client.rpc("admin_list_certificates_directory", {
      p_limit,
      p_offset,
      ...filterArgs,
    }),
    client.rpc("admin_count_certificates_directory", filterArgs),
  ]);

  if (!listRes.error && !countRes.error) {
    return {
      rows: (listRes.data as CertificateRecord[]) || [],
      total: Number(countRes.data) || 0,
    };
  }
  return null;
}

async function fetchCertificatesDirectoryPageFallback(
  client: SupabaseClient,
  page: number,
  pageSize: number,
  filters: CertificateDirectoryFilters
): Promise<{ rows: CertificateRecord[]; total: number }> {
  const search = filters.search?.trim();
  let query = client
    .from("certificates")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (search) {
    query = query.or(`student_name.ilike.%${search}%,certificate_id.ilike.%${search}%`);
  }

  const from = page * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  return {
    rows: (data as CertificateRecord[]) || [],
    total: count ?? 0,
  };
}

export async function fetchCertificatesDirectoryPage(
  client: SupabaseClient,
  page: number,
  pageSize: number,
  filters: CertificateDirectoryFilters
): Promise<{ rows: CertificateRecord[]; total: number }> {
  const fullArgs = certDirectoryFilterArgs(filters);
  const legacyArgs = certDirectoryFilterArgsLegacy(filters);

  const fullRpc = await fetchCertificatesDirectoryViaRpc(client, page, pageSize, fullArgs);
  if (fullRpc) return fullRpc;

  const legacyRpc = await fetchCertificatesDirectoryViaRpc(client, page, pageSize, legacyArgs);
  if (legacyRpc) {
    const needsClientRefine =
      (filters.departments?.length ?? 0) > 0 || (filters.subjects?.length ?? 0) > 0;
    if (!needsClientRefine) return legacyRpc;
  }

  if (hasCertDirectoryStudentFilters(filters) || filters.search?.trim()) {
    return fetchCertificatesDirectoryPageClientFiltered(client, page, pageSize, filters);
  }

  return fetchCertificatesDirectoryPageFallback(client, page, pageSize, filters);
}

export async function fetchAllCertificatesDirectory(
  client: SupabaseClient,
  filters: CertificateDirectoryFilters,
  maxRows = 200_000
): Promise<CertificateRecord[]> {
  const pageSize = 500;
  const all: CertificateRecord[] = [];
  let page = 0;

  while (all.length < maxRows) {
    const { rows, total } = await fetchCertificatesDirectoryPage(client, page, pageSize, filters);
    all.push(...rows);
    if (rows.length < pageSize || all.length >= total) break;
    page += 1;
  }

  return all.slice(0, maxRows);
}

export async function fetchCertificatesByUserIds(
  client: SupabaseClient,
  userIds: string[]
): Promise<CertificateRecord[]> {
  if (!userIds.length) return [];
  const out: CertificateRecord[] = [];
  const chunkSize = 100;
  for (let i = 0; i < userIds.length; i += chunkSize) {
    const chunk = userIds.slice(i, i + chunkSize);
    const { data, error } = await client
      .from("certificates")
      .select("*")
      .in("user_id", chunk);
    if (error) throw error;
    out.push(...((data as CertificateRecord[]) || []));
  }
  return out;
}

export async function fetchCertificatesByIds(
  client: SupabaseClient,
  ids: string[]
): Promise<CertificateRecord[]> {
  if (!ids.length) return [];
  const out: CertificateRecord[] = [];
  const chunkSize = 100;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await client.from("certificates").select("*").in("id", chunk);
    if (error) throw error;
    out.push(...((data as CertificateRecord[]) || []));
  }
  return out;
}

export async function fetchStudentsByIdsForCerts(
  client: SupabaseClient,
  userIds: string[]
): Promise<Map<string, CertEligibleStudent>> {
  const map = new Map<string, CertEligibleStudent>();
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  const chunkSize = 100;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await client
      .from("students")
      .select(
        "id, full_name, email, registration_id, roll_number, university_name, college_name, department, internship_domain, course, metadata"
      )
      .in("id", chunk);
    if (error) throw error;
    for (const row of data || []) {
      map.set(String(row.id), row as CertEligibleStudent);
    }
  }
  return map;
}

export function buildCertificateInsertRows(
  students: CertEligibleStudent[],
  internshipName: string
) {
  const year = new Date().getFullYear();
  return students.map((s) => ({
    user_id: s.id,
    student_name: s.full_name || "Student",
    internship_name: internshipName || s.internship_domain || "Internship",
    duration: CERTIFICATE_INTERNSHIP_PERIOD,
    certificate_id:
      s.registration_id ||
      `EZY/${year}/INT/${s.id.slice(0, 8).toUpperCase()}`,
    status: "Active",
  }));
}
