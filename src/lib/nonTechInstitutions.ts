import type { SupabaseClient } from "@supabase/supabase-js";
import { isBeuStudent } from "@/lib/feeRules";
import {
  fetchAllCollegesCatalog,
  type CatalogCollege,
  type CatalogUniversity,
} from "@/lib/institutionCatalog";

/** Engineering / technical boards & universities (exclude from Non-Tech Management). */
const ENGINEERING_OR_TECH_NAME = [
  /engineering/i,
  /technical\s*education/i,
  /\btechnology\b/i,
  /polytechnic/i,
  /\bbeu\b/i,
  /\baktu\b/i,
  /\bbteup\b/i,
  /\bsbte\b/i,
  /\bjut\b/i,
];

/** Management-focused institutions (exclude from Non-Tech Management). */
const MANAGEMENT_NAME = [
  /management\s*university/i,
  /university\s+of\s+management/i,
  /institute\s+of\s+management/i,
  /business\s+school/i,
  /\bimt\b/i,
  /\bxavier.*management/i,
];

export function isEngineeringOrTechnicalUniversity(name: string | null | undefined): boolean {
  const n = String(name || "").trim();
  if (!n) return false;
  if (isBeuStudent(n)) return true;
  return ENGINEERING_OR_TECH_NAME.some((re) => re.test(n));
}

export function isManagementUniversity(name: string | null | undefined): boolean {
  const n = String(name || "").trim();
  if (!n) return false;
  return MANAGEMENT_NAME.some((re) => re.test(n));
}

/** BSc / BCom style general universities — not eng/tech/management. */
export function isNonTechUniversity(name: string | null | undefined): boolean {
  const n = String(name || "").trim();
  if (!n) return false;
  if (/^test$/i.test(n)) return false;
  if (isEngineeringOrTechnicalUniversity(n)) return false;
  if (isManagementUniversity(n)) return false;
  return true;
}

export type NonTechUniversityCatalog = CatalogUniversity & {
  colleges: CatalogCollege[];
};

/**
 * Load catalog universities + colleges, keeping only non-engineering / non-management
 * (e.g. Magadh, LNMU, BRABU — BSc/BCom style). No domains.
 */
export async function fetchNonTechUniversityCatalog(
  client: SupabaseClient
): Promise<NonTechUniversityCatalog[]> {
  const [{ data: unis, error: uniErr }, colleges] = await Promise.all([
    client.from("universities").select("id, name").order("name"),
    fetchAllCollegesCatalog(client),
  ]);
  if (uniErr) throw uniErr;

  const engIds = new Set<string>();
  const { data: engRows } = await client
    .from("engineering_university_configs")
    .select("university_id")
    .eq("is_active", true);
  for (const row of engRows || []) {
    if (row.university_id) engIds.add(String(row.university_id));
  }

  const collegesByUni = new Map<string, CatalogCollege[]>();
  for (const c of colleges) {
    const uid = String(c.university_id || "");
    if (!uid) continue;
    const list = collegesByUni.get(uid) || [];
    list.push(c);
    collegesByUni.set(uid, list);
  }

  const out: NonTechUniversityCatalog[] = [];
  for (const u of unis || []) {
    const id = String(u.id || "");
    const name = String(u.name || "");
    if (!id || !name) continue;
    if (engIds.has(id)) continue;
    if (!isNonTechUniversity(name)) continue;
    const uniColleges = (collegesByUni.get(id) || []).slice().sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    out.push({ id, name, colleges: uniColleges });
  }
  return out;
}
