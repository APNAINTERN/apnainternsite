/** @deprecated Profile self-edit is enabled for all universities including LNMU and BNMU. */
export const STUDENT_SELF_PROFILE_EDIT_BLOCKED_FROM = "2026-06-23";

/** @deprecated use STUDENT_SELF_PROFILE_EDIT_BLOCKED_FROM */
export const LNMU_STUDENT_PROFILE_EDIT_BLOCKED_FROM = STUDENT_SELF_PROFILE_EDIT_BLOCKED_FROM;

/** LNMU and BNMU learners may self-edit their profile. */
export function isStudentSelfProfileEditBlocked(
  _uniName?: string | null,
  _now: Date = new Date()
): boolean {
  return false;
}

/** @deprecated use isStudentSelfProfileEditBlocked */
export function isLnmuStudentProfileEditBlocked(
  uniName?: string | null,
  now: Date = new Date()
): boolean {
  return isStudentSelfProfileEditBlocked(uniName, now);
}
