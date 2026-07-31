import type { SupabaseClient } from "@supabase/supabase-js";
import type { BeuFormData, BeuSectionType } from "@/lib/beuRegistration";
import { isBeuStudent } from "@/lib/feeRules";
import { matchesInternshipModeFilter } from "@/lib/internshipMode";
import { sanitizeStudentSearchTerm } from "@/lib/studentDirectorySearch";
import { parseStudentAccessScope } from "@/lib/studentPaymentAccess";
import { enrichStudentProfileForDisplay, studentMetadataOf } from "@/lib/studentProfileDisplay";
import { resolveEngineeringUniversityNames } from "@/lib/studentTrack";

export type BeuDetailsRow = BeuFormData & {
  id: string;
  student_id: string;
  created_at?: string | null;
  updated_at?: string | null;
};

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const msg = String(err.message || "").toLowerCase();
  return err.code === "42P01" || (msg.includes("beu_details") && msg.includes("does not exist"));
}

/** Course-only buyers must not appear in Engineering Directory. */
export function isCourseOnlyStudentRow(student: Record<string, unknown>): boolean {
  if (parseStudentAccessScope(student.metadata) === "course_only") return true;
  const meta = studentMetadataOf(student);
  const source = String(meta.source || meta.registration_source || "").toLowerCase();
  if (source.includes("course_enrollment") || source === "course_purchase") return true;
  if (String(student.degree || meta.degree || "").trim().toLowerCase() === "course") return true;
  return false;
}

function inferSectionType(duration: string, explicit?: string | null): BeuSectionType {
  const raw = String(explicit || "").trim();
  if (raw === "Hours" || raw === "Weeks") return raw;
  if (/week/i.test(duration)) return "Weeks";
  return "Hours";
}

export async function fetchBeuDetailsForStudent(
  client: SupabaseClient,
  studentId: string
): Promise<Record<string, unknown> | null> {
  const id = String(studentId || "").trim();
  if (!id) return null;
  const { data, error } = await client
    .from("beu_details")
    .select("*")
    .eq("student_id", id)
    .maybeSingle();
  if (error && !isMissingTable(error)) {
    console.warn("[beu_details] fetch:", error.message);
    return null;
  }
  return (data as Record<string, unknown> | null) || null;
}

/**
 * Merge students row + beu_details + metadata so Engineering Edit shows
 * subject, domain, duration, and Hours/Weeks.
 */
export async function hydrateStudentEditWithEngineeringDetails(
  client: SupabaseClient,
  student: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const enriched = enrichStudentProfileForDisplay(student) || { ...student };
  const meta = studentMetadataOf(enriched);
  const beu = await fetchBeuDetailsForStudent(client, String(enriched.id || ""));

  const sectionDuration = String(
    beu?.section_duration ||
      meta.section_duration ||
      enriched.beu_section_duration ||
      enriched.internship_duration ||
      meta.internship_duration ||
      ""
  ).trim();
  const sectionType = inferSectionType(
    sectionDuration,
    String(beu?.section_type || meta.section_type || enriched.beu_section_type || "")
  );
  const subject = String(
    beu?.branch_subject ||
      enriched.beu_branch ||
      enriched.subject ||
      meta.subject ||
      meta.beu_branch ||
      ""
  ).trim();
  const internshipDomain = String(
    beu?.internship_domain ||
      enriched.beu_domain ||
      enriched.internship_domain ||
      enriched.course ||
      meta.internship_domain ||
      meta.course ||
      ""
  ).trim();
  const department = String(
    beu?.course || enriched.beu_course || enriched.department || meta.department || meta.beu_course || ""
  ).trim();
  const specialization = String(
    beu?.specialization || enriched.beu_specialization || meta.specialization || ""
  ).trim();
  const mode = String(
    beu?.mode || enriched.beu_mode || enriched.internship_mode || meta.internship_mode || "Online"
  ).trim();

  const nextMeta: Record<string, unknown> = {
    ...meta,
    ...(subject ? { subject, beu_branch: subject } : {}),
    ...(sectionDuration
      ? { section_duration: sectionDuration, internship_duration: sectionDuration }
      : {}),
    section_type: sectionType,
    ...(internshipDomain ? { internship_domain: internshipDomain, course: internshipDomain } : {}),
    ...(department ? { department, beu_course: department } : {}),
    ...(specialization ? { specialization } : {}),
    ...(mode ? { internship_mode: mode } : {}),
  };

  return {
    ...enriched,
    subject,
    department: department || enriched.department,
    internship_domain: internshipDomain || enriched.internship_domain,
    course: internshipDomain || enriched.course,
    internship_duration: sectionDuration || enriched.internship_duration,
    internship_mode: mode || enriched.internship_mode,
    section_type: sectionType,
    section_duration: sectionDuration,
    specialization,
    beu_course: department || enriched.beu_course,
    beu_branch: subject || enriched.beu_branch,
    beu_section_type: sectionType,
    beu_section_duration: sectionDuration || enriched.beu_section_duration,
    beu_domain: internshipDomain || enriched.beu_domain,
    beu_mode: mode || enriched.beu_mode,
    beu_specialization: specialization || enriched.beu_specialization,
    metadata: nextMeta,
  };
}

export async function upsertBeuDetailsFromStudentEdit(
  client: SupabaseClient,
  editData: Record<string, unknown>
): Promise<void> {
  const studentId = String(editData.id || "").trim();
  if (!studentId) return;

  const meta = studentMetadataOf(editData);
  const looksEngineering =
    isBeuStudent(String(editData.university_name || meta.university_name || meta.university || "")) ||
    Boolean(editData.section_type || editData.beu_section_type || meta.section_type) ||
    Boolean(editData.beu_branch || meta.beu_branch) ||
    String(meta.registration_source || "").includes("engineering") ||
    String(meta.registration_source || "").includes("beu");

  const existing = await fetchBeuDetailsForStudent(client, studentId);
  if (!looksEngineering && !existing) return;

  const sectionDuration = String(
    editData.section_duration || editData.internship_duration || meta.section_duration || existing?.section_duration || ""
  ).trim();
  const sectionType = inferSectionType(
    sectionDuration,
    String(editData.section_type || meta.section_type || existing?.section_type || "")
  );
  const course = String(
    editData.beu_course ||
      editData.department ||
      meta.beu_course ||
      meta.department ||
      existing?.course ||
      "B.Tech"
  ).trim();
  const branch = String(
    editData.subject ||
      editData.beu_branch ||
      meta.subject ||
      meta.beu_branch ||
      existing?.branch_subject ||
      ""
  ).trim();
  const domain = String(
    editData.internship_domain ||
      editData.course ||
      meta.internship_domain ||
      existing?.internship_domain ||
      ""
  ).trim();

  const form: BeuFormData = {
    collegeId: String(editData.college_id || meta.college_id || ""),
    collegeName: String(
      editData.college_name || meta.college_name || meta.college || existing?.college || ""
    ),
    course: course || "B.Tech",
    branchSubject: branch || "Other",
    specialization: String(
      editData.specialization ||
        editData.beu_specialization ||
        meta.specialization ||
        existing?.specialization ||
        "Other"
    ).trim() || "Other",
    sectionType,
    sectionDuration: sectionDuration || (sectionType === "Weeks" ? "6 Weeks" : "120 Hours"),
    semester: String(
      editData.class_semester ||
        meta.semester ||
        meta.classSem ||
        existing?.semester ||
        "Semester 1"
    ),
    session: String(
      editData.academic_session ||
        meta.session ||
        meta.academic_session ||
        existing?.academic_session ||
        existing?.session ||
        "2024-2028"
    ),
    internshipDomain: domain || "Other",
    registrationNumber: String(
      editData.roll_number ||
        meta.rollNo ||
        meta.roll_number ||
        existing?.registration_number ||
        ""
    ),
    mode: String(editData.internship_mode || meta.internship_mode || existing?.mode || "Online") || "Online",
  };

  await upsertBeuDetails(client, studentId, form);
}

export async function upsertBeuDetails(
  client: SupabaseClient,
  studentId: string,
  data: BeuFormData
): Promise<void> {
  const row = {
    student_id: studentId,
    college: data.collegeName,
    course: data.course,
    branch_subject: data.branchSubject,
    specialization: data.specialization,
    section_type: data.sectionType,
    section_duration: data.sectionDuration,
    academic_session: data.session,
    registration_number: data.registrationNumber,
    internship_domain: data.internshipDomain,
    mode: data.mode,
    updated_at: new Date().toISOString(),
  };

  const { error } = await client.from("beu_details").upsert(row, { onConflict: "student_id" });
  if (error && !isMissingTable(error)) throw error;
}

export type EngineeringDirectoryFilters = {
  search?: string;
  domain?: string;
  university?: string;
  college?: string;
  mode?: string;
  startDate?: string;
  endDate?: string;
  course?: string;
  branch?: string;
};

function directoryDateRange(filters: EngineeringDirectoryFilters): {
  p_start: string | null;
  p_end: string | null;
} {
  if (filters.startDate) {
    return {
      p_start: `${filters.startDate}T00:00:00`,
      p_end: filters.endDate ? `${filters.endDate}T23:59:59` : null,
    };
  }
  return { p_start: null, p_end: null };
}

function enrichEngineeringRow(
  student: Record<string, unknown>,
  beuMap: Map<string, Record<string, unknown>>
) {
  const beu = beuMap.get(String(student.id || "")) || {};
  let meta: Record<string, unknown> = {};
  const rawMeta = student.metadata;
  if (rawMeta && typeof rawMeta === "object" && !Array.isArray(rawMeta)) {
    meta = rawMeta as Record<string, unknown>;
  } else if (typeof rawMeta === "string" && rawMeta.trim()) {
    try {
      const parsed = JSON.parse(rawMeta) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        meta = parsed as Record<string, unknown>;
      }
    } catch {
      meta = {};
    }
  }
  return {
    ...student,
    beu_course: beu.course || meta.department || student.department,
    beu_branch: beu.branch_subject || meta.subject,
    beu_specialization: beu.specialization || meta.specialization,
    beu_section_type: beu.section_type || meta.section_type,
    beu_section_duration: beu.section_duration || meta.section_duration,
    beu_mode: beu.mode || meta.internship_mode,
    beu_domain: beu.internship_domain || student.internship_domain || student.course,
  };
}

export async function fetchEngineeringDirectoryPage(
  client: SupabaseClient,
  page: number,
  pageSize: number,
  filters: EngineeringDirectoryFilters = {}
): Promise<{ rows: Array<Record<string, unknown>>; total: number }> {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = client
    .from("students")
    .select(
      "id, full_name, email, contact_number, university_name, college_name, registration_id, roll_number, course, internship_domain, department, degree, created_at, status, metadata",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  // Keep course enrollments out of Engineering (they belong in Course Management).
  query = query.neq("degree", "Course");

  const beuUniNames = await resolveEngineeringUniversityNames(client);
  if (filters.university && filters.university !== "all") {
    query = query.eq("university_name", filters.university);
  } else if (beuUniNames.length > 0) {
    query = query.in("university_name", beuUniNames);
  } else {
    query = query.ilike("university_name", "%engineering%");
  }

  const search = sanitizeStudentSearchTerm(filters.search || "");
  if (search) {
    const pattern = `%${search.replace(/"/g, '\\"')}%`;
    query = query.or(
      [
        `full_name.ilike."${pattern}"`,
        `email.ilike."${pattern}"`,
        `registration_id.ilike."${pattern}"`,
        `roll_number.ilike."${pattern}"`,
        `contact_number.ilike."${pattern}"`,
        `college_name.ilike."${pattern}"`,
      ].join(",")
    );
  }

  if (filters.domain && filters.domain !== "all") {
    const domain = filters.domain;
    query = query.or(
      [
        `internship_domain.eq.${domain}`,
        `course.eq.${domain}`,
        `metadata->>internship_domain.eq.${domain}`,
        `metadata->>course.eq.${domain}`,
      ].join(",")
    );
  }

  if (filters.college && filters.college !== "all") {
    query = query.eq("college_name", filters.college);
  }

  if (filters.course && filters.course !== "all") {
    query = query.or(
      [`department.eq.${filters.course}`, `metadata->>department.eq.${filters.course}`].join(",")
    );
  }

  if (filters.branch && filters.branch !== "all") {
    query = query.or(
      [`metadata->>subject.eq.${filters.branch}`, `metadata->>beu_branch.eq.${filters.branch}`].join(",")
    );
  }

  if (filters.mode && filters.mode !== "all") {
    query = query.or(
      [
        `metadata->>internship_mode.eq.${filters.mode}`,
        `metadata->>internshipMode.eq.${filters.mode}`,
      ].join(",")
    );
  }

  const { p_start, p_end } = directoryDateRange(filters);
  if (p_start) query = query.gte("created_at", p_start);
  if (p_end) query = query.lte("created_at", p_end);

  const { data: students, error, count } = await query.range(from, to);
  if (error) throw error;

  const studentIds = (students || [])
    .map((s) => String((s as { id?: string }).id || ""))
    .filter(Boolean);
  const beuMap = new Map<string, Record<string, unknown>>();

  if (studentIds.length > 0) {
    const { data: beuRows, error: beuErr } = await client
      .from("beu_details")
      .select("*")
      .in("student_id", studentIds);
    if (beuErr && !isMissingTable(beuErr)) {
      // RDS shim may still choke on some filters — directory can show without beu_details.
      console.warn("[engineering-directory] beu_details:", beuErr.message);
    } else {
      for (const row of beuRows || []) {
        beuMap.set(String((row as { student_id?: string }).student_id || ""), row as Record<string, unknown>);
      }
    }
  }

  let rows = (students || []).map((student) =>
    enrichEngineeringRow(student as Record<string, unknown>, beuMap)
  );

  // Defensive filter: exclude course-only access_scope / course enrollment sources
  // (JSON filters on the RDS shim are unreliable).
  rows = rows.filter((row) => !isCourseOnlyStudentRow(row));

  if (filters.mode && filters.mode !== "all") {
    rows = rows.filter((row) => matchesInternshipModeFilter(row, filters.mode!));
  }

  if (filters.branch && filters.branch !== "all") {
    rows = rows.filter((row) => String(row.beu_branch || "") === filters.branch);
  }

  if (filters.course && filters.course !== "all") {
    rows = rows.filter((row) => String(row.beu_course || "") === filters.course);
  }

  // Client-side exclusions shrink the page; prefer filtered length when we dropped rows.
  const dropped = (students || []).length - rows.length;
  const totalCount =
    dropped > 0 ? Math.max(0, (count ?? 0) - dropped) : (count ?? rows.length);

  return { rows, total: totalCount };
}
