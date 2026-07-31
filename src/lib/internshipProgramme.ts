import { isBnmuStudent, isBrabuStudent, isLnmuStudent } from "@/lib/feeRules";
import { CERTIFICATE_INTERNSHIP_PERIOD } from "@/lib/certificateFormat";
import { INTERNSHIP_ATTENDANCE_TOTAL_DAYS, attendanceLocalDateKey } from "@/lib/attendanceStats";

/** LNMU internship window (certificates, attendance, offer letter, logbook). */
export const LNMU_INTERNSHIP_START = "1 June 2026";
export const LNMU_INTERNSHIP_END = "20 June 2026";
export const LNMU_INTERNSHIP_DURATION = "120 Hours";

/** Inclusive calendar days between programme start and end (local dates). */
export function inclusiveProgrammeDayCount(start: Date, end: Date): number {
  const a = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const b = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  if (b < a) return 0;
  return Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

/** BNMU internship window (certificates, attendance, offer letter, logbook). */
export const BNMU_INTERNSHIP_START = "23 May 2026";
export const BNMU_INTERNSHIP_END = "21 June 2026";
export const BNMU_INTERNSHIP_PERIOD = "23 May 2026 - 21 June 2026";
export const BNMU_INTERNSHIP_DURATION = "120 Hours";
export const BNMU_ATTENDANCE_PROGRAMME_DAYS = inclusiveProgrammeDayCount(
  new Date(2026, 4, 23),
  new Date(2026, 5, 21)
);
export const BNMU_CERTIFICATE_CREDITS_LABEL = "No. of Credit Equivalent";
export const BNMU_INTERNSHIP_MODE = "Hybrid";
/** Offer letter / acceptance letter date for BNMU students. */
export const BNMU_OFFER_LETTER_ISSUE_DATE = "21 May 2026";

/** BRABU internship window (certificates, attendance, offer letter, logbook). */
export const BRABU_INTERNSHIP_START = "1 July 2026";
export const BRABU_INTERNSHIP_END = "30 July 2026";
export const BRABU_INTERNSHIP_PERIOD = "1 July 2026 - 30 July 2026";
export const BRABU_INTERNSHIP_DURATION = "120 Hours";
export const BRABU_ATTENDANCE_PROGRAMME_DAYS = inclusiveProgrammeDayCount(
  new Date(2026, 6, 1),
  new Date(2026, 6, 30)
);
/** Offer letter / acceptance letter date for BRABU students. */
export const BRABU_OFFER_LETTER_ISSUE_DATE = "1 July 2026";

export const DEFAULT_CERTIFICATE_CREDITS_LABEL = "No. of Credits Recommended";

export function programmeAttendanceDayBasis(uniName?: string | null): number {
  return resolveInternshipProgrammeConfig(uniName).programmeDayCount;
}

/** ISO date range for admin bulk attendance mark (per university). */
export const LNMU_PROGRAMME_START_ISO = "2026-06-01";
export const LNMU_PROGRAMME_END_ISO = "2026-06-20";
export const BNMU_PROGRAMME_START_ISO = "2026-05-23";
export const BNMU_PROGRAMME_END_ISO = "2026-06-21";
export const BRABU_PROGRAMME_START_ISO = "2026-07-01";
export const BRABU_PROGRAMME_END_ISO = "2026-07-30";

export function bulkAttendanceDateRangeForUniversity(uniName?: string | null): {
  startDate: string;
  endDate: string;
  label: string;
} | null {
  if (isBnmuStudent(uniName)) {
    return {
      startDate: BNMU_PROGRAMME_START_ISO,
      endDate: BNMU_PROGRAMME_END_ISO,
      label: `BNMU: ${BNMU_INTERNSHIP_START} – ${BNMU_INTERNSHIP_END}`,
    };
  }
  if (isLnmuStudent(uniName)) {
    return {
      startDate: LNMU_PROGRAMME_START_ISO,
      endDate: LNMU_PROGRAMME_END_ISO,
      label: `LNMU: ${LNMU_INTERNSHIP_START} – ${LNMU_INTERNSHIP_END}`,
    };
  }
  if (isBrabuStudent(uniName)) {
    return {
      startDate: BRABU_PROGRAMME_START_ISO,
      endDate: BRABU_PROGRAMME_END_ISO,
      label: `BRABU: ${BRABU_INTERNSHIP_START} – ${BRABU_INTERNSHIP_END}`,
    };
  }
  return null;
}

export const ADMIN_PROGRAMME_ATTENDANCE_HINT = `LNMU internship: ${LNMU_INTERNSHIP_START} – ${LNMU_INTERNSHIP_END} (20 days). BNMU internship: ${BNMU_INTERNSHIP_START} – ${BNMU_INTERNSHIP_END} (30 days). BRABU internship: ${BRABU_INTERNSHIP_START} – ${BRABU_INTERNSHIP_END} (30 days). Admins can backfill any programme day; student self-mark stops from 22 Jun 2026.`;

export type InternshipProgrammeConfig = {
  isBnmu: boolean;
  period: string;
  startDisplay: string;
  endDisplay: string;
  duration: string;
  internshipMode: string;
  programmeStartDate: Date;
  programmeDayCount: number;
  creditsLabel: string;
};

/** BNMU documents always show Hybrid; other universities use stored mode (default Online). */
export function resolveInternshipModeForUniversity(
  uniName?: string | null,
  storedMode?: string | null
): string {
  if (isBnmuStudent(uniName)) return BNMU_INTERNSHIP_MODE;
  const mode = String(storedMode || "").trim();
  if (/^online$/i.test(mode)) return "Online";
  if (/^offline$/i.test(mode)) return "Offline";
  if (/^hybrid$/i.test(mode)) return "Hybrid";
  return mode || "Online";
}

export function resolveInternshipProgrammeConfig(
  uniName?: string | null,
  storedMode?: string | null
): InternshipProgrammeConfig {
  const internshipMode = resolveInternshipModeForUniversity(uniName, storedMode);

  if (isBnmuStudent(uniName)) {
    return {
      isBnmu: true,
      period: BNMU_INTERNSHIP_PERIOD,
      startDisplay: BNMU_INTERNSHIP_START,
      endDisplay: BNMU_INTERNSHIP_END,
      duration: BNMU_INTERNSHIP_DURATION,
      internshipMode,
      programmeStartDate: new Date(2026, 4, 23),
      programmeDayCount: BNMU_ATTENDANCE_PROGRAMME_DAYS,
      creditsLabel: BNMU_CERTIFICATE_CREDITS_LABEL,
    };
  }

  if (isBrabuStudent(uniName)) {
    return {
      isBnmu: false,
      period: BRABU_INTERNSHIP_PERIOD,
      startDisplay: BRABU_INTERNSHIP_START,
      endDisplay: BRABU_INTERNSHIP_END,
      duration: BRABU_INTERNSHIP_DURATION,
      internshipMode,
      programmeStartDate: new Date(2026, 6, 1),
      programmeDayCount: BRABU_ATTENDANCE_PROGRAMME_DAYS,
      creditsLabel: DEFAULT_CERTIFICATE_CREDITS_LABEL,
    };
  }

  return {
    isBnmu: false,
    period: CERTIFICATE_INTERNSHIP_PERIOD,
    startDisplay: LNMU_INTERNSHIP_START,
    endDisplay: LNMU_INTERNSHIP_END,
    duration: LNMU_INTERNSHIP_DURATION,
    internshipMode,
    programmeStartDate: new Date(2026, 5, 1),
    programmeDayCount: INTERNSHIP_ATTENDANCE_TOTAL_DAYS,
    creditsLabel: DEFAULT_CERTIFICATE_CREDITS_LABEL,
  };
}

export function internshipProgrammeDayKeys(uniName?: string | null): string[] {
  const cfg = resolveInternshipProgrammeConfig(uniName);
  const keys: string[] = [];
  for (let i = 0; i < cfg.programmeDayCount; i++) {
    const d = new Date(cfg.programmeStartDate);
    d.setDate(cfg.programmeStartDate.getDate() + i);
    keys.push(attendanceLocalDateKey(d));
  }
  return keys;
}

/** Split programme day numbers into PDF pages (10 days per page). */
export function programmeDayChunks(totalDays: number, pageSize = 10): number[][] {
  const chunks: number[][] = [];
  for (let start = 1; start <= totalDays; start += pageSize) {
    const end = Math.min(start + pageSize - 1, totalDays);
    chunks.push(Array.from({ length: end - start + 1 }, (_, i) => start + i));
  }
  return chunks;
}
