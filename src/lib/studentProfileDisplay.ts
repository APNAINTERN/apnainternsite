import { resolveInternshipModeForUniversity } from "@/lib/internshipProgramme";

const hasText = (v: unknown) => v != null && String(v).trim() !== "";

/** Mirror academic columns into metadata so dashboard shows values after profile save. */
export function syncStudentProfileMetadata(
  row: Record<string, unknown>,
  baseMeta?: Record<string, unknown>
): Record<string, unknown> {
  const m: Record<string, unknown> = { ...(baseMeta || studentMetadataOf(row)) };
  const copy = (col: string, ...aliases: string[]) => {
    const v = row[col];
    if (!hasText(v)) return;
    m[col] = v;
    for (const a of aliases) m[a] = v;
  };

  copy("email");
  copy("university_name", "university");
  copy("college_name", "college");
  copy("degree");
  copy("department");
  copy("academic_session", "session");
  copy("class_semester", "semester", "classSem");
  copy("roll_number", "rollNo");
  copy("university_roll_number", "universityRollNumber");
  copy("course");
  copy("internship_domain");
  copy("internship_duration");
  copy("joining_date");
  copy("completion_date");
  copy("subject");
  copy("internship_mode");

  return m;
}

/** Prefer newer auth row; fill gaps from legacy duplicate email row only when needed. */
export function mergeStudentRowsForDisplay(
  canonical: Record<string, unknown>,
  other: Record<string, unknown>
): Record<string, unknown> {
  if (String(canonical.id) === String(other.id)) {
    return canonical;
  }

  const canonDisplay = enrichStudentProfileForDisplay(canonical) || canonical;
  // Prefer auth-linked row (columns + metadata); legacy duplicates only fill gaps.
  const pick = (key: string) =>
    hasText(canonDisplay[key]) ? canonDisplay[key] : other[key];

  const metaCanonical = studentMetadataOf(canonical);
  const metaOther = studentMetadataOf(other);

  return {
    ...other,
    ...canonical,
    id: canonical.id,
    email: pick("email"),
    full_name: pick("full_name"),
    gender: pick("gender"),
    parent_name: pick("parent_name"),
    contact_number: pick("contact_number"),
    university_name: pick("university_name"),
    college_name: pick("college_name"),
    degree: pick("degree"),
    department: pick("department"),
    academic_session: pick("academic_session"),
    class_semester: pick("class_semester"),
    roll_number: pick("roll_number"),
    course: pick("course"),
    internship_domain: pick("internship_domain"),
    internship_duration: pick("internship_duration"),
    joining_date: pick("joining_date"),
    completion_date: pick("completion_date"),
    emergency_name: pick("emergency_name"),
    emergency_contact: pick("emergency_contact"),
    emergency_relation: pick("emergency_relation"),
    status: pick("status"),
    registration_id: pick("registration_id"),
    metadata: { ...metaOther, ...metaCanonical },
  };
}

/** Read metadata object from a students row (handles jsonb returned as string). */
export function studentMetadataOf(
  profile: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const m = profile?.metadata;
  if (m == null) return {};
  if (typeof m === "string") {
    try {
      const parsed = JSON.parse(m) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
    return {};
  }
  return typeof m === "object" && !Array.isArray(m) ? (m as Record<string, unknown>) : {};
}

/**
 * Merge top-level columns with registration metadata so dashboard and offer letter
 * show values even when only metadata was persisted (e.g. payment webhook path).
 */
export function enrichStudentProfileForDisplay<T extends Record<string, unknown>>(
  profile: T | null | undefined
): T | null {
  if (!profile) return null;
  const m = studentMetadataOf(profile);
  const str = (v: unknown) => (v != null && String(v).trim() ? String(v).trim() : "");

  const full_name =
    str(profile.full_name) || str(m.fullName) || str(m.full_name);
  const university_name =
    str(profile.university_name) || str(m.university_name) || str(m.university);
  const college_name =
    str(profile.college_name) || str(m.college_name) || str(m.college);
  const degree = str(profile.degree) || str(m.degree);
  const department = str(profile.department) || str(m.department);
  const academic_session =
    str(profile.academic_session) || str(m.academic_session) || str(m.session);
  const class_semester =
    str(profile.class_semester) ||
    str(profile.class_sem) ||
    str(m.semester) ||
    str(m.classSem);
  const roll_number =
    str(profile.roll_number) || str(m.rollNo) || str(m.roll_number);
  const university_roll_number =
    str(profile.university_roll_number) ||
    str(m.university_roll_number) ||
    str(m.universityRollNumber);
  const course =
    str(profile.course) || str(profile.internship_domain) || str(m.course);
  const internship_domain =
    str(profile.internship_domain) || str(profile.course) || str(m.course);
  const subject = str(profile.subject) || str(m.subject);
  const internship_mode = resolveInternshipModeForUniversity(
    university_name,
    str(profile.internship_mode) || str(m.internship_mode)
  );
  const parent_name = str(profile.parent_name) || str(m.parentName) || str(m.parent_name);
  const gender = str(profile.gender) || str(m.gender);
  const contact_number =
    str(profile.contact_number) || str(m.contact) || str(m.contact_number);
  const registration_id = str(profile.registration_id) || str(m.registration_id);
  // Engineering registration stores the chosen length in section_duration.
  // Prefer it when internship_duration is missing or still the 120 Hours default.
  const sectionDuration =
    str(m.section_duration) ||
    str(profile.beu_section_duration) ||
    str(m.beu_section_duration);
  const storedDuration =
    str(profile.internship_duration) || str(m.internship_duration);
  const internship_duration =
    sectionDuration && (!storedDuration || storedDuration === "120 Hours")
      ? sectionDuration
      : storedDuration || sectionDuration || "120 Hours";
  const joining_date = str(profile.joining_date) || str(m.joining_date);
  const completion_date = str(profile.completion_date) || str(m.completion_date);
  const emergency_name =
    str(profile.emergency_name) || str(m.emName) || str(m.emergency_name);
  const emergency_contact =
    str(profile.emergency_contact) || str(m.emPhone) || str(m.emergency_contact);
  const emergency_relation =
    str(profile.emergency_relation) || str(m.emRel) || str(m.emergency_relation);

  return {
    ...profile,
    full_name,
    university_name,
    college_name,
    degree,
    department,
    academic_session,
    class_semester,
    roll_number,
    university_roll_number,
    course,
    internship_domain,
    subject,
    internship_mode,
    parent_name,
    gender,
    contact_number,
    registration_id,
    internship_duration,
    joining_date,
    completion_date,
    emergency_name,
    emergency_contact,
    emergency_relation,
    metadata: {
      ...m,
      ...(full_name ? { fullName: full_name } : {}),
      ...(subject ? { subject } : {}),
      ...(internship_mode ? { internship_mode } : {}),
      ...(university_name ? { university: university_name, university_name } : {}),
      ...(college_name ? { college: college_name, college_name } : {}),
      ...(degree ? { degree } : {}),
      ...(department ? { department } : {}),
      ...(academic_session ? { session: academic_session, academic_session } : {}),
      ...(class_semester ? { semester: class_semester, classSem: class_semester } : {}),
      ...(roll_number ? { rollNo: roll_number, roll_number } : {}),
      ...(university_roll_number
        ? { university_roll_number, universityRollNumber: university_roll_number }
        : {}),
      ...(course ? { course } : {}),
      ...(internship_duration ? { internship_duration } : {}),
      ...(sectionDuration ? { section_duration: sectionDuration } : {}),
    },
  } as T;
}

/** Duration chosen at registration (engineering section_duration, else internship_duration). */
export function resolveSelectedInternshipDuration(
  profile: Record<string, unknown> | null | undefined
): string {
  const enriched = enrichStudentProfileForDisplay(profile || {});
  const value = enriched?.internship_duration;
  return value != null && String(value).trim() ? String(value).trim() : "120 Hours";
}
