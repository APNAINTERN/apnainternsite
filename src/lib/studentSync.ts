import { resolveInternshipModeForUniversity } from "@/lib/internshipProgramme";

/** Keeps students.metadata aligned with registration-style keys for leads / prefill / exports. */

export function mergeRegistrationMetadataFromStudentRow(editData: Record<string, unknown>) {
  const prev =
    typeof editData.metadata === "object" && editData.metadata !== null
      ? (editData.metadata as Record<string, unknown>)
      : {};
  const domain = (editData.internship_domain || editData.course || "") as string;
  const pwdRaw = prev.password;
  const pwd =
    typeof pwdRaw === "string" && pwdRaw.trim() ? pwdRaw.trim() : undefined;
  const modeRaw = editData.internship_mode ?? prev.internship_mode;
  const internship_mode = resolveInternshipModeForUniversity(
    editData.university_name as string | undefined,
    typeof modeRaw === "string" ? modeRaw : undefined
  );

  const merged: Record<string, unknown> = {
    ...prev,
    ...(pwd ? { password: pwd } : {}),
    internship_mode,
    fullName: editData.full_name,
    gender: editData.gender,
    parentName: editData.parent_name,
    email: editData.email,
    contact: editData.contact_number,
    university: editData.university_name,
    college: editData.college_name,
    degree: editData.degree,
    department: editData.department,
    session: editData.academic_session,
    semester: editData.class_semester,
    rollNo: editData.roll_number,
    roll_number: editData.roll_number,
    course: domain,
    internship_domain: domain,
    emName: editData.emergency_name,
    emPhone: editData.emergency_contact,
    emRel: editData.emergency_relation,
  };

  if ("subject" in editData) {
    const t = typeof editData.subject === "string" ? editData.subject.trim() : "";
    if (t) merged.subject = t;
    else delete merged.subject;
  }

  if ("university_roll_number" in editData) {
    const v =
      typeof editData.university_roll_number === "string"
        ? editData.university_roll_number.trim()
        : "";
    if (v) {
      merged.university_roll_number = v;
      merged.universityRollNumber = v;
    } else {
      delete merged.university_roll_number;
      delete merged.universityRollNumber;
    }
  }

  const sectionDuration = String(
    editData.section_duration || editData.internship_duration || prev.section_duration || ""
  ).trim();
  const sectionType = String(editData.section_type || prev.section_type || "").trim();
  if (sectionDuration) {
    merged.section_duration = sectionDuration;
    merged.internship_duration = sectionDuration;
  }
  if (sectionType === "Hours" || sectionType === "Weeks") {
    merged.section_type = sectionType;
  }
  if ("specialization" in editData || prev.specialization) {
    const spec = String(editData.specialization || prev.specialization || "").trim();
    if (spec) merged.specialization = spec;
  }
  if (typeof editData.subject === "string" && editData.subject.trim()) {
    merged.beu_branch = editData.subject.trim();
  }
  if (typeof editData.department === "string" && editData.department.trim()) {
    merged.beu_course = editData.department.trim();
  }

  return merged;
}
