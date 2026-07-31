import { displayCollegeName } from "@/lib/collegeDisplay";

/** Alphanumeric key — ignores dots, punctuation, spacing (matches DB normalize_college_match_key). */
export function normalizeCollegeMatchKey(name: string | null | undefined): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[^a-z0-9]/g, "");
}

/** Same idea as DB `normalize_space_label`. */
export function normalizeCollegeLabel(name: string | null | undefined): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function appendKey(keys: Set<string>, value: string | null | undefined) {
  const k = normalizeCollegeMatchKey(value);
  if (k) keys.add(k);
}

/** All spellings we accept for one college row (DB name + display alias + before comma + city stripped). */
export function collegeMatchKeys(name: string | null | undefined): string[] {
  const raw = String(name ?? "").trim();
  if (!raw) return [];
  const keys = new Set<string>();

  appendKey(keys, raw);
  appendKey(keys, displayCollegeName(raw));
  appendKey(keys, raw.split(",")[0]?.trim());

  let stripped = raw.replace(/,?\s*darbhanga\s*$/i, "").trim();
  if (stripped && stripped !== raw) {
    appendKey(keys, stripped);
    appendKey(keys, stripped.split(",")[0]?.trim());
  }
  stripped = stripped.replace(/,?\s*laheriasarai\s*$/i, "").trim();
  if (stripped) {
    appendKey(keys, stripped);
    appendKey(keys, stripped.split(",")[0]?.trim());
  }

  return [...keys];
}

export function universityNamesMatch(
  ref: string | null | undefined,
  studentUni: string | null | undefined
): boolean {
  const s = String(studentUni ?? "").trim();
  const r = String(ref ?? "").trim();
  if (!s || !r) return true;
  const a = normalizeCollegeMatchKey(r);
  const b = normalizeCollegeMatchKey(s);
  if (!a || !b) return true;
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
  return false;
}

export function collegeNamesMatch(collegeRef: string, studentCollege: string | null | undefined): boolean {
  const studentKeys = collegeMatchKeys(studentCollege);
  if (!studentKeys.length) return false;
  const refKeys = collegeMatchKeys(collegeRef);
  if (!refKeys.length) return false;

  for (const sk of studentKeys) {
    for (const rk of refKeys) {
      if (sk === rk) return true;
      if (sk.length >= 6 && rk.length >= 6 && (sk.includes(rk) || rk.includes(sk))) return true;
    }
  }
  return false;
}

export function studentMatchesAssignedColleges(
  student: { college_name?: string | null; university_name?: string | null },
  assigned: AssignedCollege[]
): boolean {
  if (!assigned.length) return false;
  return assigned.some(
    (college) =>
      universityNamesMatch(college.universityName, student.university_name) &&
      collegeNamesMatch(college.name, student.college_name)
  );
}

export type DirectoryCollegeFilter = {
  /** Exact `students.college_name` — same strings as Admin → Student directory college filter. */
  directoryName: string;
  count: number;
};

/** Admin directory uses eq(college_name); build the same distinct labels for college portal filters. */
export function buildDirectoryCollegeFilters(
  students: { college_name?: string | null }[]
): DirectoryCollegeFilter[] {
  const counts = new Map<string, number>();
  for (const s of students) {
    const name = String(s.college_name ?? "").trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([directoryName, count]) => ({ directoryName, count }))
    .sort((a, b) => a.directoryName.localeCompare(b.directoryName));
}

/** Same rule as Admin.tsx: `q.eq("college_name", collegeFilter)`. */
export function studentMatchesDirectoryCollegeFilter(
  student: { college_name?: string | null },
  directoryName: string
): boolean {
  return String(student.college_name ?? "").trim() === directoryName;
}

export type AssignedCollege = {
  id: string;
  name: string;
  universityName?: string | null;
};

export function filterStudentsForAssignedColleges<
  T extends { college_name?: string | null; university_name?: string | null },
>(rows: T[], assigned: AssignedCollege[]): T[] {
  return rows.filter((s) => studentMatchesAssignedColleges(s, assigned));
}
