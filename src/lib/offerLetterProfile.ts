import { displayCollegeName } from "@/lib/collegeDisplay";
import { isBrabuStudent, isLnmuStudent, isBnmuStudent } from "@/lib/feeRules";
import {
  BNMU_INTERNSHIP_DURATION,
  BNMU_INTERNSHIP_END,
  BNMU_INTERNSHIP_MODE,
  BNMU_INTERNSHIP_START,
  BNMU_OFFER_LETTER_ISSUE_DATE,
  BRABU_INTERNSHIP_DURATION,
  BRABU_INTERNSHIP_END,
  BRABU_INTERNSHIP_START,
  BRABU_OFFER_LETTER_ISSUE_DATE,
  LNMU_INTERNSHIP_DURATION,
  LNMU_INTERNSHIP_END,
  LNMU_INTERNSHIP_START,
} from "@/lib/internshipProgramme";
import { normalizeInternshipMode } from "@/lib/collegeRoster";
import { isPlaceholderRegistrationId, pendingRegistrationPlaceholder } from "@/lib/registrationId";
import {
  enrichStudentProfileForDisplay,
  resolveSelectedInternshipDuration,
} from "@/lib/studentProfileDisplay";
import { resolveBnmuUniversityRollNumber } from "@/lib/certificateFormat";

export {
  LNMU_INTERNSHIP_START,
  LNMU_INTERNSHIP_END,
  LNMU_INTERNSHIP_DURATION,
} from "@/lib/internshipProgramme";
export const LNMU_STIPEND = "Not Applicable";
export const ACCEPTANCE_LETTER_ISSUE_DATE = "30 May 2026";
/** @deprecated Use BRABU_OFFER_LETTER_ISSUE_DATE from internshipProgramme. */
export const BRABU_SRKG_OFFER_LETTER_ISSUE_DATE = "1 July 2026";

const SRKG_COLLEGE_PATTERNS = [/s\.?\s*r\.?\s*k\.?\s*g/i, /\bsrkg\b/i];

function matchesAnyPattern(value: string | null | undefined, patterns: RegExp[]): boolean {
  const hay = String(value || "").trim();
  if (!hay) return false;
  return patterns.some((p) => p.test(hay));
}

export function isBrabuUniversity(uniName?: string | null): boolean {
  return isBrabuStudent(uniName);
}

export function isSrkgSitamarhiCollege(collegeName?: string | null): boolean {
  const hay = String(collegeName || "").trim();
  if (!hay) return false;
  return (
    matchesAnyPattern(hay, SRKG_COLLEGE_PATTERNS) && /sitamarhi/i.test(hay)
  );
}

export function isBrabuSrkgStudent(
  uniName?: string | null,
  collegeName?: string | null
): boolean {
  return isBrabuUniversity(uniName) && isSrkgSitamarhiCollege(collegeName);
}

/** Top-of-letter date for offer / acceptance letters (display only). */
export function resolveOfferLetterIssueDate(
  profile: Record<string, unknown> | null | undefined
): string {
  const p = profile || {};
  const m = metaOf(p);
  const uni = String(p.university_name || p.university || p.universityName || m.university || "");

  if (isBnmuStudent(uni)) return BNMU_OFFER_LETTER_ISSUE_DATE;
  if (isBrabuStudent(uni)) return BRABU_OFFER_LETTER_ISSUE_DATE;
  return ACCEPTANCE_LETTER_ISSUE_DATE;
}

export type OfferLetterResolved = {
  isLnmu: boolean;
  isBnmu: boolean;
  issueDate: string;
  letterRefNo: string;
  applicationDateIso: string | null;
  fullName: string;
  /** University / college roll no. from registration (not API letter ref). */
  registrationNo: string;
  /** BNMU university roll no. (separate profile field). */
  universityRollNo: string;
  collegeName: string;
  departmentSemester: string;
  internshipDomain: string;
  internshipDuration: string;
  internshipMode: string;
  startDate: string;
  endDate: string;
  stipend: string;
};

function metaOf(profile: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const m = profile?.metadata;
  return m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, unknown>) : {};
}

export function fmtOfferLetterDate(iso?: string | null, fallback = "—"): string {
  if (!iso) return fallback;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return fallback;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return fallback;
  }
}

/** Official API letter reference (API/INT/{year}/{seq}) — not university roll number. */
export function letterRefFromProfile(profile: Record<string, unknown> | null | undefined): string {
  const regId = String(profile?.registration_id ?? "").trim();
  if (regId && !isPlaceholderRegistrationId(regId)) return regId;
  return "";
}

/** Letter ref. for LNMU students: auto-generated API registration id at enrolment. */
export function lnmuLetterRefNo(profile: Record<string, unknown> | null | undefined): string {
  const fromReg = letterRefFromProfile(profile);
  if (fromReg) return fromReg;

  const yr =
    (profile?.created_at && new Date(String(profile.created_at)).getFullYear()) ||
    new Date().getFullYear();
  const raw = String(profile?.id || profile?.user_id || "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();
  const tail = raw ? raw.slice(-6) : Date.now().toString().slice(-6);
  return `API/LNMU/${yr}/${tail}`;
}

function formatSemesterLabel(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/semester/i.test(s)) return s;
  if (/^sem\s/i.test(s)) return s.replace(/^sem\s/i, "Semester ");
  return `Semester ${s}`;
}

function lnmuDepartmentSemester(profile: Record<string, unknown>, m: Record<string, unknown>): string {
  const subject = String(profile.subject || m.subject || "").trim();
  const semesterRaw = String(
    profile.class_semester || profile.class_sem || m.semester || m.classSem || ""
  ).trim();
  const sem = formatSemesterLabel(semesterRaw);
  if (subject && sem) return `${subject} — ${sem}`;
  return subject || sem || "—";
}

function lnmuCollegeName(profile: Record<string, unknown>, m: Record<string, unknown>): string {
  const raw =
    String(profile.college_name || "").trim() ||
    String(profile.college || m.college || m.college_name || "").trim();
  return displayCollegeName(raw) || "—";
}

function rollRegistrationNo(profile: Record<string, unknown>, m: Record<string, unknown>): string {
  return (
    String(profile.roll_number || "").trim() ||
    String(m.rollNo || m.roll_number || "").trim() ||
    String(profile.registration_number || m.registrationNumber || "").trim() ||
    "—"
  );
}

function internshipDomain(profile: Record<string, unknown>, m: Record<string, unknown>): string {
  return (
    String(profile.internship_domain || "").trim() ||
    String(profile.course || m.course || "").trim() ||
    "—"
  );
}

function applicationDateIso(
  profile: Record<string, unknown>,
  payment?: Record<string, unknown> | null
): string | null {
  const candidates = [
    profile.application_date,
    profile.applied_at,
    profile.created_at,
    payment?.created_at,
  ];
  for (const c of candidates) {
    if (c && String(c).trim()) return String(c);
  }
  return null;
}

/**
 * Merge student row + payment + metadata for offer letter rendering.
 * LNMU-specific fields follow registration form mapping (requirements 1–12).
 */
export function resolveOfferLetterFields(
  profile: Record<string, unknown> | null | undefined,
  payment?: Record<string, unknown> | null
): OfferLetterResolved {
  const p = enrichStudentProfileForDisplay(profile || {}) || {};
  const m = metaOf(p);
  const uni = String(p.university_name || p.university || p.universityName || "");
  const isLnmu = isLnmuStudent(uni);
  const isBnmu = isBnmuStudent(uni);
  const isBrabu = isBrabuStudent(uni);

  const mode =
    normalizeInternshipMode(
      String(p.internship_mode || m.internship_mode || "Online")
    ) || "Online";

  const appIso = applicationDateIso(p, payment);
  const issueDate = resolveOfferLetterIssueDate(p);

  if (isBnmu) {
    return {
      isLnmu: false,
      isBnmu: true,
      issueDate,
      letterRefNo: lnmuLetterRefNo(p),
      applicationDateIso: appIso,
      fullName: String(p.full_name || "—").trim() || "—",
      registrationNo: rollRegistrationNo(p, m),
      universityRollNo: resolveBnmuUniversityRollNumber(p) || "—",
      collegeName: lnmuCollegeName(p, m),
      departmentSemester: lnmuDepartmentSemester(p, m),
      internshipDomain: internshipDomain(p, m),
      internshipDuration: BNMU_INTERNSHIP_DURATION,
      internshipMode: BNMU_INTERNSHIP_MODE,
      startDate: BNMU_INTERNSHIP_START,
      endDate: BNMU_INTERNSHIP_END,
      stipend: LNMU_STIPEND,
    };
  }

  if (isLnmu) {
    return {
      isLnmu: true,
      isBnmu: false,
      issueDate,
      letterRefNo: lnmuLetterRefNo(p),
      applicationDateIso: appIso,
      fullName: String(p.full_name || "—").trim() || "—",
      registrationNo: rollRegistrationNo(p, m),
      universityRollNo: rollRegistrationNo(p, m),
      collegeName: lnmuCollegeName(p, m),
      departmentSemester: lnmuDepartmentSemester(p, m),
      internshipDomain: internshipDomain(p, m),
      internshipDuration: LNMU_INTERNSHIP_DURATION,
      internshipMode: mode,
      startDate: LNMU_INTERNSHIP_START,
      endDate: LNMU_INTERNSHIP_END,
      stipend: LNMU_STIPEND,
    };
  }

  if (isBrabu) {
    return {
      isLnmu: false,
      isBnmu: false,
      issueDate,
      letterRefNo: String(p.registration_id || pendingRegistrationPlaceholder()),
      applicationDateIso: appIso,
      fullName: String(p.full_name || "—").trim() || "—",
      registrationNo: rollRegistrationNo(p, m),
      universityRollNo: rollRegistrationNo(p, m),
      collegeName: lnmuCollegeName(p, m),
      departmentSemester: lnmuDepartmentSemester(p, m),
      internshipDomain: internshipDomain(p, m),
      internshipDuration: BRABU_INTERNSHIP_DURATION,
      internshipMode: mode,
      startDate: BRABU_INTERNSHIP_START,
      endDate: BRABU_INTERNSHIP_END,
      stipend: LNMU_STIPEND,
    };
  }

  const department = String(p.department || p.degree || m.department || m.degree || "").trim();
  const subject = String(p.subject || m.subject || "").trim();
  const semester = String(p.class_semester || p.class_sem || m.semester || m.classSem || "").trim();
  const deptParts = [department, subject, semester ? formatSemesterLabel(semester) : ""].filter(Boolean);
  const defaultDepartment = deptParts.join(" — ") || "—";

  return {
    isLnmu: false,
    isBnmu: false,
    issueDate,
    letterRefNo: String(p.registration_id || pendingRegistrationPlaceholder()),
    applicationDateIso: appIso,
    fullName: String(p.full_name || "—").trim() || "—",
    registrationNo: rollRegistrationNo(p, m),
    universityRollNo: rollRegistrationNo(p, m),
    collegeName:
      String(p.college_name || p.college || p.collegeName || "").trim() ||
      String(p.university_name || p.university || "").trim() ||
      "N/A",
    departmentSemester: defaultDepartment,
    internshipDomain:
      String(p.course || p.internship_domain || m.course || "General Training").trim() ||
      "General Training",
    internshipDuration: resolveSelectedInternshipDuration(p),
    internshipMode: mode,
    startDate: fmtOfferLetterDate(
      String(p.joining_date || ""),
      "Programme dates will be confirmed by your coordinator."
    ),
    endDate: fmtOfferLetterDate(
      String(p.completion_date || ""),
      "As per academic internship completion norms."
    ),
    stipend: "Not Applicable — Academic Programme",
  };
}

/** Normalize raw student + optional payment row before passing to OfferLetter. */
export function normalizeOfferLetterProfile(
  profile: Record<string, unknown> | null | undefined,
  payment?: Record<string, unknown> | null
): Record<string, unknown> {
  if (!profile) return {};
  const enriched = enrichStudentProfileForDisplay(profile) || profile;
  const m = metaOf(enriched);
  const mode =
    normalizeInternshipMode(String(enriched.internship_mode || m.internship_mode || "")) ||
    "Online";
  const payCreated = payment?.created_at ? String(payment.created_at) : null;

  const resolved = resolveOfferLetterFields(enriched, payment);

  const regId = String(enriched.registration_id ?? "").trim();
  const safeRegId =
    regId && !isPlaceholderRegistrationId(regId)
      ? regId
      : letterRefFromProfile(enriched) || resolved.letterRefNo;

  const resolvedMode = resolved.isBnmu
    ? BNMU_INTERNSHIP_MODE
    : mode;

  return {
    ...enriched,
    registration_id: safeRegId,
    internship_mode: resolvedMode,
    internship_duration:
      resolveSelectedInternshipDuration(enriched) || resolved.internshipDuration,
    application_date:
      enriched.application_date ||
      enriched.applied_at ||
      enriched.created_at ||
      resolved.applicationDateIso ||
      payCreated,
    joining_date:
      enriched.joining_date ||
      (resolved.isBnmu
        ? BNMU_INTERNSHIP_START
        : resolved.isLnmu
          ? LNMU_INTERNSHIP_START
          : isBrabuStudent(String(enriched.university_name || enriched.university || ""))
            ? BRABU_INTERNSHIP_START
            : undefined),
    completion_date:
      enriched.completion_date ||
      (resolved.isBnmu
        ? BNMU_INTERNSHIP_END
        : resolved.isLnmu
          ? LNMU_INTERNSHIP_END
          : isBrabuStudent(String(enriched.university_name || enriched.university || ""))
            ? BRABU_INTERNSHIP_END
            : undefined),
    metadata: {
      ...m,
      ...(mode ? { internship_mode: mode } : {}),
    },
  };
}
