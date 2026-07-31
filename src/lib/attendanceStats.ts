/** Internship attendance is measured out of this fixed day count. */
export const INTERNSHIP_ATTENDANCE_TOTAL_DAYS = 20;

/** Minimum attendance % required to show as eligible (15 of 20 days). */
export const ATTENDANCE_ELIGIBILITY_MIN_PERCENT = 75;

/** LNMU bulk pre-mark window (admin) — full programme calendar. */
export const LNMU_BULK_ATTENDANCE_START = "2026-06-01";
export const LNMU_BULK_ATTENDANCE_END = "2026-06-20";

/** LNMU & BNMU students cannot self-mark attendance on or after this local calendar date. */
export const LNMU_BNMU_STUDENT_ATTENDANCE_BLOCKED_FROM = "2026-06-22";

export function isLnmuBnmuAttendanceMarkingBlocked(
  uniName?: string | null,
  now: Date = new Date()
): boolean {
  const uni = String(uniName || "").trim();
  if (!uni) return false;

  const lower = uni.toLowerCase();
  const isLnmu = /lnmu|lalit\s*narayan|mithila/.test(lower);
  const isBnmu = /bnmu|bhupendra\s*narayan\s*mandal/.test(lower);
  if (!isLnmu && !isBnmu) return false;

  const blockStart = localDayStart(new Date(`${LNMU_BNMU_STUDENT_ATTENDANCE_BLOCKED_FROM}T00:00:00`));
  return now >= blockStart;
}

export function attendanceLocalDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function markedAtToLocalDateKey(markedAt: string | Date): string {
  const d = markedAt instanceof Date ? markedAt : new Date(markedAt);
  return attendanceLocalDateKey(d);
}

export function localDayStart(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function localDayEndExclusive(d: Date = new Date()): Date {
  const x = localDayStart(d);
  x.setDate(x.getDate() + 1);
  return x;
}

export function hasAttendanceOnLocalDate(
  records: Array<{ marked_at?: string | null }>,
  dateKey: string = attendanceLocalDateKey()
): boolean {
  return records.some(
    (rec) => rec.marked_at && markedAtToLocalDateKey(rec.marked_at) === dateKey
  );
}

export function normalizeAttendanceCriteria(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : ATTENDANCE_ELIGIBILITY_MIN_PERCENT;
}

export function calcAttendancePercentage(
  totalDays: number,
  totalDaysBasis: number = INTERNSHIP_ATTENDANCE_TOTAL_DAYS
): number {
  const basis = Math.max(1, totalDaysBasis);
  const days = Math.max(0, totalDays);
  return Math.min(100, (days / basis) * 100);
}

export function minDaysForAttendanceEligibility(
  minPercent: number = ATTENDANCE_ELIGIBILITY_MIN_PERCENT,
  totalDaysBasis: number = INTERNSHIP_ATTENDANCE_TOTAL_DAYS
): number {
  return Math.ceil((minPercent / 100) * totalDaysBasis);
}

export function isAttendanceEligible(
  totalDays: number,
  minPercent: number = ATTENDANCE_ELIGIBILITY_MIN_PERCENT,
  totalDaysBasis: number = INTERNSHIP_ATTENDANCE_TOTAL_DAYS
): boolean {
  const days = Math.max(0, totalDays);
  if (days >= minDaysForAttendanceEligibility(minPercent, totalDaysBasis)) return true;
  return calcAttendancePercentage(days, totalDaysBasis) >= minPercent;
}

export function countAttendanceByStudent(
  rows: Array<{ student_id?: string | null; day_count?: number }>
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const id = normalizeStudentId(row.student_id);
    if (!id) continue;
    if (row.day_count != null && Number.isFinite(row.day_count)) {
      counts[id] = row.day_count;
      continue;
    }
    counts[id] = (counts[id] || 0) + 1;
  }
  return counts;
}

export function normalizeStudentId(id: unknown): string {
  return String(id ?? "").trim().toLowerCase();
}

/** Resolve the auth/directory id used in attendance.student_id. */
export function getStudentRecordId(student: Record<string, unknown>): string {
  const raw = student.id ?? student.user_id ?? student.student_id;
  return String(raw ?? "").trim();
}

export function attendanceCountsFromRows(
  rows: Array<{ student_id?: string | null; day_count?: number }>
): Record<string, number> {
  return countAttendanceByStudent(rows);
}

export function enrichStudentAttendance<T extends Record<string, unknown>>(
  student: T,
  totalDays: number,
  minPercent: number = ATTENDANCE_ELIGIBILITY_MIN_PERCENT,
  totalDaysBasis: number = INTERNSHIP_ATTENDANCE_TOTAL_DAYS
): T & {
  total_days: number;
  percentage: number;
  attendanceTotalDays: number;
  isEligible: boolean;
} {
  const basis = Math.max(1, totalDaysBasis);
  const days = Math.max(0, totalDays);
  const percentage = calcAttendancePercentage(days, basis);
  return {
    ...student,
    total_days: days,
    percentage,
    attendanceTotalDays: basis,
    isEligible: isAttendanceEligible(days, minPercent, basis),
  };
}
