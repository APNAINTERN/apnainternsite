import { isBnmuStudent } from "@/lib/feeRules";

/** Shared login password for Deo Nandini Degree College (BNMU, Madhepura). */
export const DEO_NANDINI_DEFAULT_PASSWORD = "123456";

const DEO_NANDINI_COLLEGE_PATTERNS = [
  /deo\s*nandin/i,
  /deo\s*nandani/i,
  /deo\s*nadani/i,
  /dev\s*nandin/i,
  /dev\s*nandini/i,
];

export function isDeoNandiniBnmuCollege(
  uniName?: string | null,
  collegeName?: string | null
): boolean {
  if (!isBnmuStudent(uniName)) return false;
  const college = String(collegeName || "").trim();
  if (!college) return false;
  return DEO_NANDINI_COLLEGE_PATTERNS.some((p) => p.test(college));
}

/** College-specific default registration/login password, if any. */
export function defaultPasswordForCollege(
  uniName?: string | null,
  collegeName?: string | null
): string | null {
  if (isDeoNandiniBnmuCollege(uniName, collegeName)) {
    return DEO_NANDINI_DEFAULT_PASSWORD;
  }
  return null;
}
