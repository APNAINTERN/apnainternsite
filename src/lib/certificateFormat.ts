import type { SupabaseClient } from "@supabase/supabase-js";
import { inferDepartmentFromSubject, normalizeDegree } from "@/lib/collegeRoster";
import { isPlaceholderRegistrationId } from "@/lib/registrationId";
import { matchSubjectToOption } from "@/lib/subjectOptions";
import { isBnmuStudent } from "@/lib/feeRules";
import {
  resolveInternshipProgrammeConfig,
} from "@/lib/internshipProgramme";
import { resolveStudentTrack } from "@/lib/studentTrack";

/** Fixed internship period shown on all certificates (per official template). */
export const CERTIFICATE_INTERNSHIP_PERIOD = "1 June 2026 - 20 June 2026";

export const CERTIFICATE_TOTAL_HOURS = "120 Hours";

export const CERTIFICATE_CREDITS = "4 Credits";

export const CERTIFICATE_PROGRAMME_HOURS = 120;

/** Overall marks shown on certificates (90–100% only). */
export const CERTIFICATE_MARKS_PERCENT_OPTIONS = [90, 95, 100] as const;

/** @deprecated Attendance is no longer shown on certificates. */
export const CERTIFICATE_DISPLAY_PERCENT_OPTIONS = CERTIFICATE_MARKS_PERCENT_OPTIONS;

import { brandVerifyUrl } from "@/lib/brand";

export const CERTIFICATE_VERIFY_URL = brandVerifyUrl();

export const CERTIFICATE_COMPANY = "Apna Intern";

export const CERTIFICATE_CEO = "Raushan Kumar";

export const CERTIFICATE_CEO_TITLE = "Founder & CEO";

/** Official scanned signature asset (Raushan Kumar). */
export const CERTIFICATE_SIGNATURE_SRC = "/certificate/signature.png?v=7";

export const CERTIFICATE_ASSESSMENT_CRITERIA = [
  "Technical Knowledge & Application",
  "Quality of Work & Task Completion",
  "Initiative & Problem-Solving Ability",
  "Communication & Interpersonal Skills",
  "Punctuality, Discipline & Professional Conduct",
] as const;

export const CERTIFICATE_ASSESSMENT_RATINGS = ["Good", "Outstanding"] as const;

export type CertificateAssessmentRating = (typeof CERTIFICATE_ASSESSMENT_RATINGS)[number];

export type CertificateAssessmentRow = {
  criteria: string;
  rating: CertificateAssessmentRating;
};

export type CertificateDisplayData = {
  studentName?: string | null;
  parentName?: string | null;
  /** University roll number — shown in certificate body. */
  universityRollNo?: string | null;
  /** BNMU university registration number (not Apna Intern certificate ID). */
  universityRegistrationNumber?: string | null;
  /** Apna Intern certificate / registration ID — footer Certificate Number only. */
  registrationId?: string | null;
  collegeName?: string | null;
  universityName?: string | null;
  academicSession?: string | null;
  degree?: string | null;
  subject?: string | null;
  internshipDomain?: string | null;
  internshipDuration?: string | null;
  internshipMode?: string | null;
  creditsLabel?: string | null;
  totalHours?: string | null;
  creditsRecommended?: string | null;
  /** @deprecated Not shown on certificate — kept for legacy overrides. */
  attendancePercent?: string | null;
  marksPercent?: string | null;
  /** @deprecated Use assessmentRows — kept for legacy overrides. */
  assessmentRating?: string | null;
  assessmentRows?: CertificateAssessmentRow[] | null;
  certificateId?: string | null;
  issueDate?: string | null;
  /** standard = existing template; engineering = narrative industrial-training layout */
  certificateVariant?: "standard" | "engineering";
  /** Engineering narrative fields */
  semester?: string | null;
  gender?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  /** e.g. "One Month" for "… completed a One Month Industrial Training" */
  durationLabel?: string | null;
};

export type CertificateBuildOptions = {
  /** @deprecated Real attendance is not used — certificates use deterministic random stats. */
  attendanceDays?: number;
  /** @deprecated Real assignment marks are not used — certificates use deterministic random stats. */
  bestMarksPercent?: number | null;
};

export type CertificateDisplayOptions = CertificateBuildOptions & {
  /**
   * Admin only: apply saved display_overrides for name, USN, college, etc.
   * Student portal always uses live profile (default false).
   */
  useSavedProfileOverrides?: boolean;
};

export type CertificateEligibilityIssue =
  | "missing_roll"
  | "low_attendance"
  | "no_graded_assignment";

export function certificateVerifyUrl(certificateId: string): string {
  return `${CERTIFICATE_VERIFY_URL}?cert=${encodeURIComponent(certificateId)}`;
}

/** Apna Intern internal IDs must never appear as university roll numbers. */
export function isApnaInternRegistrationId(value: string | null | undefined): boolean {
  const v = String(value ?? "").trim();
  if (!v) return false;
  return /^EZY\/\d{4}\/INT\//i.test(v) || isPlaceholderRegistrationId(v);
}

export function isValidUniversityRollNo(value: string | null | undefined): boolean {
  const v = String(value ?? "").trim();
  if (!v) return false;
  if (isApnaInternRegistrationId(v)) return false;
  return true;
}

export function resolveUniversityRollNo(
  student: Record<string, unknown> | null | undefined
): string {
  const meta = (student?.metadata as Record<string, unknown> | undefined) || {};
  const candidates = [
    student?.roll_number,
    student?.university_roll_no,
    meta.rollNo,
    meta.university_roll,
    meta.roll_number,
    meta.universityRollNo,
    meta.university_roll_no,
  ];
  for (const candidate of candidates) {
    const v = String(candidate ?? "").trim();
    if (isValidUniversityRollNo(v)) return v;
  }
  return "";
}

/** Profile "Registration number" (roll_number) — BNMU university registration no. on certificate. */
export function resolveUniversityRegistrationNumber(
  student: Record<string, unknown> | null | undefined
): string {
  const meta = (student?.metadata as Record<string, unknown> | undefined) || {};
  const candidates = [
    student?.roll_number,
    meta.rollNo,
    meta.roll_number,
    meta.registration_number,
  ];
  for (const candidate of candidates) {
    const v = String(candidate ?? "").trim();
    if (v && !isApnaInternRegistrationId(v)) return v;
  }
  return "";
}

/** BNMU-only roll number (separate profile field, stored in metadata). */
export function resolveBnmuUniversityRollNumber(
  student: Record<string, unknown> | null | undefined
): string {
  const meta = (student?.metadata as Record<string, unknown> | undefined) || {};
  const candidates = [
    student?.university_roll_number,
    meta.university_roll_number,
    meta.universityRollNumber,
  ];
  for (const candidate of candidates) {
    const v = String(candidate ?? "").trim();
    if (isValidUniversityRollNo(v)) return v;
  }
  return "";
}

/** BNMU needs registration no. (roll_number) + roll no. (university_roll_number); others need roll_number only. */
export function hasRequiredCertificateIdentityFields(
  student: Record<string, unknown> | null | undefined
): boolean {
  const uni = String(student?.university_name ?? "").trim();
  if (isBnmuStudent(uni)) {
    return (
      !!resolveUniversityRegistrationNumber(student) &&
      !!resolveBnmuUniversityRollNumber(student)
    );
  }
  return !!resolveUniversityRollNo(student);
}
/** Load university roll number from students + academic_info tables. */
export async function fetchUniversityRollNoFromDb(
  client: SupabaseClient,
  userId: string
): Promise<string> {
  const [{ data: student }, { data: academic }] = await Promise.all([
    client
      .from("students")
      .select("roll_number, registration_id, metadata")
      .eq("id", userId)
      .maybeSingle(),
    client.from("academic_info").select("roll_number").eq("user_id", userId).maybeSingle(),
  ]);

  return resolveUniversityRollNo({
    ...(student || {}),
    roll_number:
      [student?.roll_number, academic?.roll_number].find((v) => isValidUniversityRollNo(String(v ?? ""))) ||
      student?.roll_number ||
      academic?.roll_number,
  });
}

export function resolveStudentPhone(
  student: Record<string, unknown> | null | undefined
): string {
  const meta = (student?.metadata as Record<string, unknown> | undefined) || {};
  return String(
    student?.contact_number || student?.phone || meta.phone || meta.mobile || meta.contact || ""
  ).trim();
}

export function calcCertificateTotalHours(attendancePercent: number): number {
  const pct = Math.max(0, Math.min(100, attendancePercent));
  return Math.round((pct * CERTIFICATE_PROGRAMME_HOURS) / 100);
}

export function formatCertificateTotalHours(attendancePercent: number): string {
  return `${calcCertificateTotalHours(attendancePercent)} Hours`;
}

export function ratingFromAttendancePercent(percent: number): string {
  const pct = Math.max(0, Math.min(100, percent));
  if (pct >= 90) return "Outstanding";
  if (pct >= 80) return "Good";
  if (pct >= 70) return "Satisfactory";
  return "Needs Improvement";
}

/** Rating follows the better of attendance and marks (100% marks → Outstanding). */
export function ratingFromPerformancePercent(
  attendancePercent: number,
  marksPercent: number
): string {
  return ratingFromAttendancePercent(Math.max(attendancePercent, marksPercent));
}

function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Stable seed so the same certificate always shows the same random stats. */
export function certificatePerformanceSeed(
  student: Record<string, unknown> | null | undefined,
  cert?: Record<string, unknown> | null
): string {
  return String(
    cert?.certificate_id ||
      cert?.id ||
      cert?.user_id ||
      student?.id ||
      student?.registration_id ||
      student?.email ||
      "certificate"
  );
}

function pickCertificateMarksPercent(seed: string): number {
  const options = CERTIFICATE_MARKS_PERCENT_OPTIONS;
  const idx = stableHash(`${seed}:marks`) % options.length;
  return options[idx];
}

function pickCertificateAttendancePercent(seed: string): number {
  const options = CERTIFICATE_MARKS_PERCENT_OPTIONS;
  const idx = stableHash(`${seed}:attendance`) % options.length;
  return options[idx];
}

/** Pronouns for engineering certificate narrative. */
export function certificatePronouns(gender?: string | null): {
  subject: string;
  possessive: string;
  Subject: string;
} {
  const g = String(gender || "").trim().toLowerCase();
  if (g === "male" || g === "m") {
    return { subject: "he", possessive: "his", Subject: "He" };
  }
  if (g === "female" || g === "f") {
    return { subject: "she", possessive: "her", Subject: "She" };
  }
  return { subject: "he/she", possessive: "his/her", Subject: "He/She" };
}

/** Human duration phrase for engineering certificate body. */
export function engineeringDurationLabel(raw?: string | null): string {
  const s = String(raw || "").trim();
  if (!s) return "One Month";
  if (/1\s*month|one\s*month|4\s*weeks|120\s*hours?/i.test(s)) return "One Month";
  if (/2\s*months?|two\s*months?|8\s*weeks/i.test(s)) return "Two Months";
  if (/3\s*months?|three\s*months?|12\s*weeks/i.test(s)) return "Three Months";
  if (/6\s*weeks|six\s*weeks/i.test(s)) return "Six Weeks";
  if (/3\s*weeks|three\s*weeks/i.test(s)) return "Three Weeks";
  if (/2\s*weeks|two\s*weeks/i.test(s)) return "Two Weeks";
  if (/\d+\s*weeks?/i.test(s) || /\d+\s*hours?/i.test(s) || /\d+\s*months?/i.test(s)) {
    return s.replace(/\s+/g, " ");
  }
  return s;
}

export function formatSemesterLabel(raw?: string | null): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^semester\s*\d+/i.test(s)) return s.replace(/^semester/i, "Semester");
  if (/^\d+$/.test(s)) return `Semester ${s}`;
  if (/^sem\.?\s*\d+/i.test(s)) {
    const n = s.match(/\d+/)?.[0];
    return n ? `Semester ${n}` : s;
  }
  return s;
}

export function isEngineeringCertificateData(
  data: Pick<CertificateDisplayData, "certificateVariant"> | null | undefined
): boolean {
  return data?.certificateVariant === "engineering";
}

function pickCertificateAssessmentRating(seed: string, index: number): CertificateAssessmentRating {
  const options = CERTIFICATE_ASSESSMENT_RATINGS;
  return options[stableHash(`${seed}:assessment:${index}`) % options.length];
}

export function randomizedCertificateAssessmentRows(seed: string): CertificateAssessmentRow[] {
  return CERTIFICATE_ASSESSMENT_CRITERIA.map((criteria, index) => ({
    criteria,
    rating: pickCertificateAssessmentRating(seed, index),
  }));
}

/** Random (deterministic) marks 90|95|100; fixed 120 hours; per-criterion Good/Outstanding ratings. */
export function randomizedCertificatePerformance(
  seed: string
): {
  marksPercent: number;
  totalHours: string;
  creditsRecommended: string;
  assessmentRows: CertificateAssessmentRow[];
} {
  const marksPercent = pickCertificateMarksPercent(seed);
  return {
    marksPercent,
    totalHours: CERTIFICATE_TOTAL_HOURS,
    creditsRecommended: CERTIFICATE_CREDITS,
    assessmentRows: randomizedCertificateAssessmentRows(seed),
  };
}

export function computeBestAssignmentPercent(
  assignments: Array<{
    total_marks?: number | null;
    submission?: {
      score?: number | null;
      grading_status?: string | null;
    } | null;
  }>
): number | null {
  let best: number | null = null;
  for (const assignment of assignments) {
    const sub = assignment.submission;
    if (!sub || sub.grading_status === "pending_review") continue;
    if (sub.score == null || !Number.isFinite(sub.score)) continue;
    const total = Math.max(1, Number(assignment.total_marks) || 1);
    const pct = (Number(sub.score) / total) * 100;
    best = best == null ? pct : Math.max(best, pct);
  }
  return best;
}

export function validateCertificateEligibility(
  student: Record<string, unknown>,
  attendanceDays: number,
  bestMarksPercent: number | null | undefined,
  minAttendancePercent = 75
): CertificateEligibilityIssue[] {
  const issues: CertificateEligibilityIssue[] = [];
  if (!hasRequiredCertificateIdentityFields(student)) issues.push("missing_roll");
  const pct = (Math.max(0, attendanceDays) / 20) * 100;
  if (pct < minAttendancePercent) issues.push("low_attendance");
  if (bestMarksPercent == null || bestMarksPercent <= 0) issues.push("no_graded_assignment");
  return issues;
}

export function certificateEligibilityMessage(issue: CertificateEligibilityIssue): string {
  switch (issue) {
    case "missing_roll":
      return "University roll number is missing in the student profile";
    case "low_attendance":
      return "Attendance is below 75%";
    case "no_graded_assignment":
      return "No graded assignment marks found";
    default:
      return "Not eligible for certificate";
  }
}

export function formatCertificateIssueDate(raw?: string | null): string {
  if (!raw) return new Date().toLocaleDateString("en-GB");
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date().toLocaleDateString("en-GB");
  return d.toLocaleDateString("en-GB");
}

const CERTIFICATE_PERFORMANCE_OVERRIDE_KEYS = [
  "marksPercent",
  "totalHours",
  "creditsRecommended",
  "assessmentRating",
  "assessmentRows",
] as const;

function readCertificateOverrides(
  cert?: Record<string, unknown> | null
): Partial<CertificateDisplayData> {
  const raw = cert?.display_overrides;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Partial<CertificateDisplayData>;
}

function pickProfileDisplayOverrides(
  overrides: Partial<CertificateDisplayData>
): Partial<CertificateDisplayData> {
  const out: Partial<CertificateDisplayData> = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (
      CERTIFICATE_PERFORMANCE_OVERRIDE_KEYS.includes(
        key as (typeof CERTIFICATE_PERFORMANCE_OVERRIDE_KEYS)[number]
      )
    ) {
      continue;
    }
    if (value != null && String(value).trim() !== "") {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

function parseCertificatePercentLabel(value: string | null | undefined): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const match = raw.match(/^([\d.]+)\s*%?$/);
  if (!match) return null;
  const n = Math.round(Number(match[1]));
  if (!Number.isFinite(n)) return null;
  return n;
}

function isAllowedCertificateMarksPercent(value: number): boolean {
  return (CERTIFICATE_MARKS_PERCENT_OPTIONS as readonly number[]).includes(value);
}

/** @deprecated Use isAllowedCertificateMarksPercent */
function isAllowedCertificateDisplayPercent(value: number): boolean {
  return isAllowedCertificateMarksPercent(value);
}

/** Only accept admin overrides in 85|90|95|100 — ignore stale fetched values like 0.0%. */
function resolveCertificatePercentOverride(
  value: string | null | undefined
): number | null {
  const parsed = parseCertificatePercentLabel(value);
  if (parsed == null || !isAllowedCertificateDisplayPercent(parsed)) return null;
  return parsed;
}

function parseCertificateTotalHoursLabel(value: string | null | undefined): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const match = raw.match(/^(\d+)\s*Hours?$/i);
  if (!match) return null;
  const hours = Number(match[1]);
  return Number.isFinite(hours) && hours > 0 ? hours : null;
}

function isAllowedCertificateTotalHours(hours: number): boolean {
  return CERTIFICATE_DISPLAY_PERCENT_OPTIONS.some(
    (pct) => calcCertificateTotalHours(pct) === hours
  );
}

function applyCertificatePerformanceOverrides(
  data: CertificateDisplayData,
  overrides: Partial<CertificateDisplayData>
): CertificateDisplayData {
  const merged = { ...data };
  const marksOverride = resolveCertificatePercentOverride(overrides.marksPercent);

  merged.totalHours = CERTIFICATE_TOTAL_HOURS;
  merged.creditsRecommended = CERTIFICATE_CREDITS;

  if (marksOverride != null) {
    merged.marksPercent = `${marksOverride}%`;
  }

  const hoursOverride = parseCertificateTotalHoursLabel(overrides.totalHours);
  if (hoursOverride === CERTIFICATE_PROGRAMME_HOURS) {
    merged.totalHours = CERTIFICATE_TOTAL_HOURS;
  }

  const creditsOverride = String(overrides.creditsRecommended ?? "").trim();
  if (creditsOverride) {
    merged.creditsRecommended = creditsOverride;
  }

  if (Array.isArray(overrides.assessmentRows) && overrides.assessmentRows.length > 0) {
    merged.assessmentRows = overrides.assessmentRows;
  }

  const seed =
    merged.certificateId ||
    merged.registrationId ||
    merged.universityRollNo ||
    merged.studentName ||
    "certificate";
  if (!merged.assessmentRows?.length) {
    merged.assessmentRows = randomizedCertificateAssessmentRows(String(seed));
  }

  return merged;
}

/** Merge DB overrides and certificate row fields onto computed display data. */
export function applyCertificateRecordFields(
  data: CertificateDisplayData,
  cert?: Record<string, unknown> | null,
  options?: Pick<CertificateDisplayOptions, "useSavedProfileOverrides">
): CertificateDisplayData {
  const overrides = readCertificateOverrides(cert);
  const profileOverrides = pickProfileDisplayOverrides(overrides);
  const base = options?.useSavedProfileOverrides
    ? { ...data, ...profileOverrides }
    : data;

  const merged = applyCertificatePerformanceOverrides(base, overrides);

  if (cert?.certificate_id) merged.certificateId = String(cert.certificate_id);
  if (cert?.issue_date) {
    merged.issueDate = formatCertificateIssueDate(String(cert.issue_date));
  }
  if (isBnmuStudent(merged.universityName) && merged.certificateVariant !== "engineering") {
    const programme = resolveInternshipProgrammeConfig(merged.universityName);
    merged.internshipDuration = programme.period;
    merged.creditsLabel = programme.creditsLabel;
    merged.internshipMode = programme.internshipMode;
  }
  // Keep engineering narrative fields from profile overrides when present.
  if (merged.certificateVariant === "engineering") {
    if (overrides.semester) merged.semester = String(overrides.semester);
    if (overrides.durationLabel) merged.durationLabel = String(overrides.durationLabel);
    if (overrides.startDate) merged.startDate = String(overrides.startDate);
    if (overrides.endDate) merged.endDate = String(overrides.endDate);
    if (overrides.attendancePercent) {
      merged.attendancePercent = String(overrides.attendancePercent);
    }
    if (overrides.gender) merged.gender = String(overrides.gender);
  }
  return merged;
}

export function certificateDisplayFromRecord(
  student: Record<string, unknown> | null | undefined,
  cert?: Record<string, unknown> | null,
  options?: CertificateDisplayOptions
): CertificateDisplayData {
  return applyCertificateRecordFields(
    certificateDataFromStudent(student, cert, options),
    cert,
    options
  );
}

export type CertificateEditFormState = {
  studentName: string;
  universityRollNo: string;
  universityRegistrationNumber: string;
  collegeName: string;
  universityName: string;
  academicSession: string;
  degree: string;
  department: string;
  subject: string;
  internshipDomain: string;
  internshipDuration: string;
  internshipMode: string;
  totalHours: string;
  creditsRecommended: string;
  marksPercent: string;
  assessmentRows: CertificateAssessmentRow[];
};

export function certificateEditFormFromDisplay(
  data: CertificateDisplayData
): CertificateEditFormState {
  const degree = normalizeDegree(data.degree) || data.degree || "";
  const department =
    inferDepartmentFromSubject(data.subject) ||
    (degree === "PG" && data.degree && !["UG", "PG"].includes(data.degree)
      ? String(data.degree)
      : "");
  const subject =
    matchSubjectToOption(data.subject, department) || data.subject || "";

  return {
    studentName: data.studentName || "",
    universityRollNo: data.universityRollNo || "",
    universityRegistrationNumber: data.universityRegistrationNumber || "",
    collegeName: data.collegeName || "",
    universityName: data.universityName || "",
    academicSession: data.academicSession || "",
    degree,
    department,
    subject,
    internshipDomain: data.internshipDomain || "",
    internshipDuration: data.internshipDuration || CERTIFICATE_INTERNSHIP_PERIOD,
    internshipMode: data.internshipMode || "Online",
    totalHours: data.totalHours || CERTIFICATE_TOTAL_HOURS,
    creditsRecommended: data.creditsRecommended || CERTIFICATE_CREDITS,
    marksPercent: data.marksPercent || "",
    assessmentRows: data.assessmentRows || [],
  };
}

export function certificateOverridesFromEditForm(
  form: CertificateEditFormState
): Partial<CertificateDisplayData> {
  const pick = (value: string) => {
    const trimmed = value.trim();
    return trimmed || undefined;
  };
  return {
    universityRollNo: pick(form.universityRollNo),
    universityRegistrationNumber: pick(form.universityRegistrationNumber),
    collegeName: pick(form.collegeName),
    universityName: pick(form.universityName),
    academicSession: pick(form.academicSession),
    degree: pick(form.degree),
    subject: pick(form.subject),
    internshipMode: pick(form.internshipMode),
    totalHours: pick(form.totalHours),
    creditsRecommended: pick(form.creditsRecommended),
    marksPercent: pick(form.marksPercent),
    assessmentRows: form.assessmentRows?.length ? form.assessmentRows : undefined,
  };
}

export function certificateDataFromStudent(
  student: Record<string, unknown> | null | undefined,
  cert?: Record<string, unknown> | null,
  _options?: CertificateBuildOptions
): CertificateDisplayData {
  const meta = (student?.metadata as Record<string, unknown> | undefined) || {};
  const universityName = String(student?.university_name || meta.university_name || "").trim() || undefined;
  const storedMode = String(student?.internship_mode || meta.internship_mode || "Online").trim() || "Online";
  const programme = resolveInternshipProgrammeConfig(universityName, storedMode);
  const mode = programme.internshipMode;

  const seed = certificatePerformanceSeed(student, cert);
  const performance = randomizedCertificatePerformance(seed);

  const bnmu = isBnmuStudent(universityName);
  const universityRegistrationNumber = bnmu
    ? resolveUniversityRegistrationNumber(student) || undefined
    : undefined;
  const universityRollNo = bnmu
    ? resolveBnmuUniversityRollNumber(student) || undefined
    : resolveUniversityRollNo(student) || undefined;
  const certificateId = String(cert?.certificate_id || student?.registration_id || "").trim() || undefined;

  const isEngineering = resolveStudentTrack(student as Record<string, unknown>) === "engineering";

  const sectionDuration = String(
    student?.beu_section_duration ||
      student?.section_duration ||
      meta.section_duration ||
      student?.internship_duration ||
      meta.internship_duration ||
      programme.duration ||
      ""
  ).trim();

  const semesterRaw = String(
    student?.class_semester || meta.semester || meta.class_semester || ""
  ).trim();

  const domain = String(
    student?.beu_domain ||
      student?.internship_domain ||
      student?.course ||
      meta.internship_domain ||
      ""
  ).trim();

  const joining = String(student?.joining_date || meta.joining_date || "").trim();
  const completion = String(student?.completion_date || meta.completion_date || "").trim();
  const startDate =
    (joining && !Number.isNaN(Date.parse(joining))
      ? new Date(joining).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : programme.startDisplay) || undefined;
  const endDate =
    (completion && !Number.isNaN(Date.parse(completion))
      ? new Date(completion).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : programme.endDisplay) || undefined;

  const attendancePct =
    _options?.attendanceDays != null && Number.isFinite(_options.attendanceDays)
      ? Math.min(
          100,
          Math.round(
            (Math.max(0, Number(_options.attendanceDays)) /
              Math.max(1, programme.programmeDayCount || 20)) *
              100
          )
        )
      : pickCertificateAttendancePercent(seed);

  const marksPct =
    _options?.bestMarksPercent != null &&
    Number.isFinite(_options.bestMarksPercent) &&
    Number(_options.bestMarksPercent) > 0
      ? Math.round(Number(_options.bestMarksPercent))
      : performance.marksPercent;

  const gender = String(student?.gender || meta.gender || "").trim() || undefined;

  const base: CertificateDisplayData = {
    studentName: String(student?.full_name || "Student"),
    parentName: String(
      student?.parent_name || student?.father_name || meta.parentName || ""
    ).trim() || undefined,
    universityRollNo,
    universityRegistrationNumber,
    registrationId: certificateId,
    collegeName: String(student?.college_name || meta.college_name || meta.college || "").trim() || undefined,
    universityName,
    academicSession: String(student?.academic_session || meta.session || "").trim() || undefined,
    degree: String(
      student?.beu_course || student?.degree || meta.degree || ""
    ).trim() || undefined,
    subject: String(
      student?.beu_branch || meta.subject || student?.course || student?.subject || ""
    ).trim() || undefined,
    internshipDomain: domain || undefined,
    internshipDuration: isEngineering
      ? sectionDuration || programme.period
      : programme.period,
    internshipMode: mode,
    totalHours: performance.totalHours,
    creditsRecommended: performance.creditsRecommended,
    creditsLabel: programme.creditsLabel,
    marksPercent: `${marksPct}%`,
    assessmentRows: performance.assessmentRows,
    certificateId,
    issueDate: formatCertificateIssueDate(
      (cert?.issue_date as string | undefined) || (cert?.created_at as string | undefined)
    ),
  };

  if (!isEngineering) return base;

  return {
    ...base,
    certificateVariant: "engineering",
    semester: formatSemesterLabel(semesterRaw) || undefined,
    gender,
    startDate,
    endDate,
    durationLabel: engineeringDurationLabel(sectionDuration || programme.duration),
    attendancePercent: `${attendancePct}%`,
    // Engineering narrative uses registration number = university roll / reg id field
    universityRegistrationNumber:
      universityRegistrationNumber ||
      universityRollNo ||
      String(student?.roll_number || meta.roll_number || "").trim() ||
      undefined,
  };
}
