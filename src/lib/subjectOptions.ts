/**
 * Canonical Subject dropdown options used by both the manual public
 * `RegistrationForm` and the reference-number based `PrefilledRegistrationForm`.
 *
 * Keeping them in one place ensures that:
 *   - The two forms always offer the same list to students/operators.
 *   - Roster-imported values like `"ENGLISH"` can be reliably matched back
 *     to the exact dropdown option (`"B.A. (English)"`) via
 *     `matchSubjectToOption()`.
 */

export const baSubjects = [
  "B.A. (Ancient Indian History - AIH)", "B.A. (Anthropology)", "B.A. (Arabic)", "B.A. (Bengali)",
  "B.A. (Bhojpuri)", "B.A. (Dramatics)", "B.A. (Economics)", "B.A. (English)", "B.A. (Geography)",
  "B.A. (Home Science)", "B.A. (Hindi)", "B.A. (History)", "B.A. (Law)", "B.A. (LSW)", "B.A. (Maithili)",
  "B.A. (Mathematics)", "B.A. (Music)", "B.A. (Pali)", "B.A. (Persian)", "B.A. (Philosophy)",
  "B.A. (Political Science)", "B.A. (Prakrit)", "B.A. (Psychology)", "B.A. (Rural Economics)",
  "B.A. (Sanskrit)", "B.A. (Sociology)", "B.A. (Statistics)", "B.A. (Urdu)", "Statistics",
];

export const bscSubjects = [
  "B.Sc (Botany)", "B.Sc (Chemistry)", "B.Sc (Geology)", "B.Sc (Mathematics)", "B.Sc (Physics)", "B.Sc (Zoology)",
];

export const bcomSubjects = [
  "B.Com Accounting and Finance", "B.Com (HRM)", "B.Com (Marketing)",
];

export function subjectsFor(department: string | undefined | null): string[] {
  switch ((department || "").trim()) {
    case "B.A.":
      return baSubjects;
    case "B.Sc":
      return bscSubjects;
    case "B.Com":
      return bcomSubjects;
    default:
      return [];
  }
}

/**
 * Map a raw roster value like `"ENGLISH"`, `"english language"`, or
 * `"B.A. English"` to one of the canonical dropdown options for the given
 * department. Returns "" if no confident match is found.
 */
export function matchSubjectToOption(
  raw: string | undefined | null,
  department: string | undefined | null
): string {
  if (!raw) return "";
  const r = String(raw).trim().toLowerCase();
  if (!r) return "";

  const candidates = subjectsFor(department);
  if (!candidates.length) return "";

  // 1. Exact match (case-insensitive).
  const exact = candidates.find((c) => c.toLowerCase() === r);
  if (exact) return exact;

  // 2. The dropdown options follow the pattern `B.A. (Subject Name)` or
  //    `B.Sc (Subject Name)` — pull the "Subject Name" out and try to match
  //    the raw value against that.
  const looseMatch = candidates.find((c) => {
    const inner = c.match(/\(([^)]+)\)/)?.[1] || c.replace(/^(B\.A\.|B\.Sc|B\.Com)\s*/i, "");
    const key = inner.trim().toLowerCase();
    if (!key) return false;
    return r === key || r.includes(key) || key.includes(r);
  });
  if (looseMatch) return looseMatch;

  // 3. B.A. LSW (Labour Studies & Welfare) roster shorthand.
  if (department === "B.A." && /\blsw\b|labour.*welfare|labour\s*stud/i.test(r)) {
    return "B.A. (LSW)";
  }

  // 4. B.Com fuzzy specials.
  if (department === "B.Com") {
    if (/accoun|finance/.test(r)) return "B.Com Accounting and Finance";
    if (/h\.?\s?r\.?\s?m|human\s*resource/.test(r)) return "B.Com (HRM)";
    if (/marketing/.test(r)) return "B.Com (Marketing)";
  }

  return "";
}
