import type { SupabaseClient } from "@supabase/supabase-js";
import { isBeuStudent } from "@/lib/feeRules";
import { isEngineeringOrTechnicalUniversity } from "@/lib/nonTechInstitutions";
import { studentMetadataOf } from "@/lib/studentProfileDisplay";

/** Non-technical UG programmes (Directory / Non-Tech Registration). */
export const NON_TECH_DEPARTMENTS_UG = ["B.A.", "B.Sc", "B.Com"] as const;

/** Non-technical PG programmes. */
export const NON_TECH_DEPARTMENTS_PG = ["M.A.", "M.Sc", "M.Com"] as const;

export type NonTechDegree = "UG" | "PG";

export function normalizeNonTechDegree(raw: string | null | undefined): NonTechDegree | "" {
  const d = String(raw || "").trim().toUpperCase();
  return d === "UG" || d === "PG" ? d : "";
}

/** Standard B.A./B.Sc/B.Com or M.A./M.Sc/M.Com lists for registration forms. */
export function departmentsForNonTechDegree(degree: string | null | undefined): string[] {
  const d = normalizeNonTechDegree(degree);
  if (d === "UG") return [...NON_TECH_DEPARTMENTS_UG];
  if (d === "PG") return [...NON_TECH_DEPARTMENTS_PG];
  return [];
}

/** Filter configured non-tech courses (B.A., M.Sc, …) to match UG or PG selection. */
export function filterNonEngineeringCoursesForDegree(
  degree: string | null | undefined,
  courses: string[]
): string[] {
  const d = normalizeNonTechDegree(degree);
  if (!d) return [];
  const allowed = new Set(departmentsForNonTechDegree(d));
  return courses.filter((c) => {
    const name = String(c || "").trim();
    if (!name || name === "Other") return false;
    if (allowed.has(name)) return true;
    if (d === "UG") return /^b[\s.]/i.test(name);
    return /^m[\s.]/i.test(name);
  });
}

export function departmentMatchesNonTechDegree(
  degree: string | null | undefined,
  department: string | null | undefined
): boolean {
  const d = normalizeNonTechDegree(degree);
  const dept = String(department || "").trim();
  if (!d || !dept) return !dept;
  return filterNonEngineeringCoursesForDegree(d, [dept]).length > 0;
}

export type StudentTrack = "engineering" | "non_tech";

/**
 * University names used by Engineering Directory
 * (BEU-pattern names + active engineering_university_configs).
 */
export async function resolveEngineeringUniversityNames(
  client: SupabaseClient
): Promise<string[]> {
  const names = new Set<string>();

  const { fetchAllSupabaseRows } = await import("@/lib/fetchAllSupabaseRows");
  const allUnis = await fetchAllSupabaseRows<{ id?: string; name?: string }>(client, "universities", {
    select: "id, name",
    orderBy: "name",
    ascending: true,
    pageSize: 1000,
  });
  const nameById = new Map<string, string>();
  for (const u of allUnis) {
    const id = String(u.id || "").trim();
    const name = String(u.name || "").trim();
    if (id && name) nameById.set(id, name);
    if (name && (isBeuStudent(name) || isEngineeringOrTechnicalUniversity(name))) {
      names.add(name);
    }
  }

  const { data: engConfigs, error: engErr } = await client
    .from("engineering_university_configs")
    .select("university_id")
    .eq("is_active", true);
  if (engErr) {
    console.warn("[student-track] eng configs:", engErr.message);
  } else {
    for (const row of engConfigs || []) {
      const id = String((row as { university_id?: string }).university_id || "").trim();
      const name = nameById.get(id);
      if (name) names.add(name);
    }
  }

  return [...names];
}

export function isEngineeringUniversityName(
  universityName: string | null | undefined,
  engineeringUniversityNames?: Iterable<string>
): boolean {
  const name = String(universityName || "").trim();
  if (!name) return false;
  if (isBeuStudent(name) || isEngineeringOrTechnicalUniversity(name)) return true;
  if (engineeringUniversityNames) {
    const set =
      engineeringUniversityNames instanceof Set
        ? engineeringUniversityNames
        : new Set(
            [...engineeringUniversityNames].map((n) => String(n || "").trim()).filter(Boolean)
          );
    if (set.has(name)) return true;
    for (const eng of set) {
      if (eng.toLowerCase() === name.toLowerCase()) return true;
    }
  }
  return false;
}

export function resolveStudentTrack(
  student: Record<string, unknown> | null | undefined,
  engineeringUniversityNames?: Iterable<string>
): StudentTrack {
  if (!student) return "non_tech";
  const meta = studentMetadataOf(student);
  const tagged = String(meta.student_track || meta.track || "").trim().toLowerCase();
  if (tagged === "engineering" || tagged === "eng") return "engineering";
  if (tagged === "non_tech" || tagged === "non-tech" || tagged === "nontechnical") {
    return "non_tech";
  }
  const source = String(meta.registration_source || meta.source || "").toLowerCase();
  if (source.includes("engineering") || source.includes("beu")) return "engineering";
  if (student.beu_course || student.beu_branch || meta.beu_course || meta.beu_branch) {
    return "engineering";
  }
  const uni = String(
    student.university_name || meta.university_name || meta.university || ""
  );
  if (isEngineeringUniversityName(uni, engineeringUniversityNames)) return "engineering";
  return "non_tech";
}

export function isEngineeringStudentRow(
  student: Record<string, unknown>,
  engineeringUniversityNames?: Iterable<string>
): boolean {
  return resolveStudentTrack(student, engineeringUniversityNames) === "engineering";
}

/** Keep only Non-Technical students for Admin Directory. */
export function filterNonTechDirectoryStudents<T extends Record<string, unknown>>(
  rows: T[],
  engineeringUniversityNames?: Iterable<string>
): T[] {
  return rows.filter((row) => !isEngineeringStudentRow(row, engineeringUniversityNames));
}
