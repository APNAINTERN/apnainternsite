import {
  CERTIFICATE_INTERNSHIP_PERIOD,
  CERTIFICATE_TOTAL_HOURS,
  resolveBnmuUniversityRollNumber,
  resolveStudentPhone,
  resolveUniversityRegistrationNumber,
} from "@/lib/certificateFormat";
import { isBnmuStudent } from "@/lib/feeRules";
import {
  internshipProgrammeDayKeys,
  resolveInternshipProgrammeConfig,
} from "@/lib/internshipProgramme";
import { resolveOfferLetterFields } from "@/lib/offerLetterProfile";
import { calcAttendancePercentage, markedAtToLocalDateKey } from "@/lib/attendanceStats";
import { displayRegistrationId } from "@/lib/registrationId";

export type StudentDocumentFields = {
  studentName: string;
  gender: string;
  fatherName: string;
  rollNumber: string;
  isBnmu: boolean;
  universityRegistrationNumber: string;
  universityRollNumber: string;
  programSemester: string;
  mobile: string;
  email: string;
  registrationNumber: string;
  instituteName: string;
  university: string;
  collegeName: string;
  course: string;
  subject: string;
  semester: string;
  domain: string;
  mode: string;
  duration: string;
  startDate: string;
  endDate: string;
  phone: string;
  session: string;
  programmePeriod: string;
};

function metaOf(profile: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const m = profile?.metadata;
  return m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, unknown>) : {};
}

export function resolveStudentDocumentFields(
  profile: Record<string, unknown> | null | undefined
): StudentDocumentFields {
  const m = metaOf(profile);
  const offer = resolveOfferLetterFields(profile);
  const university = String(profile?.university_name || m.university_name || "—").trim() || "—";
  const storedMode = String(profile?.internship_mode || m.internship_mode || "Online").trim() || "Online";
  const programme = resolveInternshipProgrammeConfig(university, storedMode);
  const gender = String(profile?.gender || m.gender || "—").trim() || "—";
  const fatherName = String(
    profile?.father_name || profile?.parent_name || m.fatherName || m.parentName || "—"
  ).trim();
  const phone = resolveStudentPhone(profile);
  const isBnmu = isBnmuStudent(university);
  const universityRegistrationNumber = isBnmu
    ? resolveUniversityRegistrationNumber(profile) || "—"
    : "—";
  const universityRollNumber = isBnmu
    ? resolveBnmuUniversityRollNumber(profile) || "—"
    : String(profile?.roll_number || m.rollNo || m.university_roll || offer.registrationNo || "").trim() ||
      "—";
  const rollNumber = universityRollNumber;
  const semester = String(
    profile?.class_semester || profile?.class_sem || m.semester || m.classSem || "—"
  ).trim();
  const degree = String(profile?.degree || m.degree || "—").trim();
  const programSemester =
    offer.departmentSemester ||
    [degree, semester ? `Semester ${semester.replace(/^semester\s/i, "")}` : ""]
      .filter(Boolean)
      .join(" – ") ||
    "—";

  return {
    studentName: offer.fullName || "Student",
    gender,
    fatherName: fatherName || "—",
    rollNumber,
    isBnmu,
    universityRegistrationNumber,
    universityRollNumber,
    programSemester,
    mobile: phone,
    email: String(profile?.email || m.email || "—").trim() || "—",
    registrationNumber: displayRegistrationId(profile?.registration_id) || rollNumber || "—",
    instituteName: offer.collegeName || "—",
    university: String(profile?.university_name || m.university_name || "—").trim() || "—",
    collegeName: offer.collegeName || "—",
    course: degree || "—",
    subject: String(profile?.subject || m.subject || profile?.course || "—").trim() || "—",
    semester: semester || "—",
    domain: offer.internshipDomain || "—",
    mode: offer.internshipMode || programme.internshipMode,
    duration: offer.internshipDuration || programme.duration || CERTIFICATE_TOTAL_HOURS,
    startDate: offer.startDate || programme.startDisplay,
    endDate: offer.endDate || programme.endDisplay,
    phone,
    session: String(profile?.academic_session || m.session || "—").trim() || "—",
    programmePeriod: programme.period,
  };
}

/** Identity rows for logbook, attendance report, etc. */
export function studentDocumentIdentityRows(
  fields: StudentDocumentFields
): [string, string][] {
  if (fields.isBnmu) {
    return [
      ["University Registration No.", fields.universityRegistrationNumber],
      ["University Roll No.", fields.universityRollNumber],
    ];
  }
  return [["University Roll No.", fields.universityRollNumber]];
}

export { internshipProgrammeDayKeys };

export function attendancePresentDaySet(
  records: Array<{ marked_at?: string | null; is_present?: boolean | null }>
): Set<string> {
  const set = new Set<string>();
  for (const rec of records) {
    if (rec.marked_at && rec.is_present !== false) set.add(markedAtToLocalDateKey(rec.marked_at));
  }
  return set;
}

/** Present days that fall within the student's internship programme window. */
export function countProgrammePresentDays(
  records: Array<{ marked_at?: string | null }>,
  uniName?: string | null
): number {
  const present = attendancePresentDaySet(records);
  return internshipProgrammeDayKeys(uniName).filter((key) => present.has(key)).length;
}

/** Next absent programme days — used when admin adds attendance manually. */
export function nextAbsentProgrammeDayKeys(
  records: Array<{ marked_at?: string | null }>,
  count: number,
  uniName?: string | null
): string[] {
  const present = attendancePresentDaySet(records);
  const absent = internshipProgrammeDayKeys(uniName).filter((key) => !present.has(key));
  return absent.slice(0, Math.max(0, count));
}

/** Stable midday timestamp on a programme day (for attendance.marked_at). */
export function programmeDayMarkedAtIso(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0).toISOString();
}

export function attendanceReportRows(
  records: Array<{ marked_at?: string | null }>,
  uniName?: string | null
): { day: number; date: string; dateKey: string; status: "Present" | "Absent" }[] {
  const present = attendancePresentDaySet(records);
  const programme = resolveInternshipProgrammeConfig(uniName);
  const start = programme.programmeStartDate;
  return internshipProgrammeDayKeys(uniName).map((dateKey, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return {
      day: i + 1,
      date: d.toLocaleDateString("en-GB"),
      dateKey,
      status: present.has(dateKey) ? "Present" : "Absent",
    };
  });
}

export function formatDocumentIssueDate(date = new Date()): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function attendanceReportSummary(
  records: Array<{ marked_at?: string | null }>,
  uniName?: string | null
) {
  const programme = resolveInternshipProgrammeConfig(uniName);
  const totalMarked = countProgrammePresentDays(records, uniName);
  return {
    totalMarked,
    programmeDays: programme.programmeDayCount,
    percentage: calcAttendancePercentage(totalMarked, programme.programmeDayCount),
    period: programme.period,
    issueDate: formatDocumentIssueDate(),
  };
}
