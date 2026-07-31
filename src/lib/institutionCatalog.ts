import { isBnmuStudent, isBrabuStudent, isLnmuStudent } from "@/lib/feeRules";
import { displayCollegeName } from "@/lib/collegeDisplay";

export type CatalogUniversity = { id: string; name: string };
export type CatalogCollege = {
  id: string;
  name: string;
  university_id: string;
  pisa_fee?: number | null;
  fee_base_paise?: number | null;
  fee_processing_paise?: number | null;
  show_fee_breakdown?: boolean | null;
  fees_managed?: boolean | null;
};

/** Strip punctuation/spaces so "UVK COLLEGE" matches "U V K College, Madhepura". */
export function normalizeInstitutionKey(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function institutionsMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const na = normalizeInstitutionKey(a);
  const nb = normalizeInstitutionKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

/** Resolve universities.id from a stored / selected university name (exact + fuzzy). */
export function resolveUniversityId(
  unis: CatalogUniversity[],
  universityName: string | null | undefined
): string {
  const raw = String(universityName || "").trim();
  if (!raw || raw === "all") return "";

  const exact = unis.find((u) => u.name === raw);
  if (exact) return exact.id;

  const lower = raw.toLowerCase();
  const byIncludes = unis.find((u) => {
    const n = String(u.name || "").toLowerCase();
    return n === lower || n.includes(lower) || lower.includes(n);
  });
  if (byIncludes) return byIncludes.id;

  const byKey = unis.find((u) => institutionsMatch(u.name, raw));
  if (byKey) return byKey.id;

  if (isBnmuStudent(raw)) {
    const bnmu = unis.find((u) => isBnmuStudent(u.name));
    if (bnmu) return bnmu.id;
  }
  if (isLnmuStudent(raw)) {
    const lnmu = unis.find((u) => isLnmuStudent(u.name));
    if (lnmu) return lnmu.id;
  }
  if (isBrabuStudent(raw)) {
    const brabu = unis.find((u) => isBrabuStudent(u.name));
    if (brabu) return brabu.id;
  }

  return "";
}

/**
 * Colleges for a university filter/edit selection.
 * Same list used by Admin directory filters and student edit form.
 */
export function collegesForUniversity(
  colleges: CatalogCollege[],
  unis: CatalogUniversity[],
  universityNameOrAll: string | null | undefined
): CatalogCollege[] {
  const raw = String(universityNameOrAll || "").trim();
  if (!raw || raw === "all") {
    return [...colleges].sort((a, b) =>
      displayCollegeName(a.name).localeCompare(displayCollegeName(b.name))
    );
  }

  const uniId = resolveUniversityId(unis, raw);
  if (!uniId) return [];

  return colleges
    .filter((c) => String(c.university_id) === String(uniId))
    .sort((a, b) => displayCollegeName(a.name).localeCompare(displayCollegeName(b.name)));
}

/**
 * Load every college row (past PostgREST 1000-row caps) for admin filters / edit forms.
 */
export async function fetchAllCollegesCatalog(
  client: import("@supabase/supabase-js").SupabaseClient
): Promise<CatalogCollege[]> {
  const { fetchAllSupabaseRows } = await import("@/lib/fetchAllSupabaseRows");
  const rows = await fetchAllSupabaseRows<CatalogCollege>(client, "colleges", {
    select: "id, name, university_id",
    orderBy: "name",
    ascending: true,
    pageSize: 1000,
  });
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name || ""),
    university_id: String(r.university_id || ""),
  }));
}

/** All colleges for one university (paginated — Eng. Management / registration safe). */
export async function fetchCollegesByUniversityId(
  client: import("@supabase/supabase-js").SupabaseClient,
  universityId: string
): Promise<CatalogCollege[]> {
  const { fetchAllSupabaseRows } = await import("@/lib/fetchAllSupabaseRows");
  const uid = String(universityId || "").trim();
  if (!uid) return [];
  const rows = await fetchAllSupabaseRows<CatalogCollege>(client, "colleges", {
    select:
      "id, name, university_id, pisa_fee, fee_base_paise, fee_processing_paise, show_fee_breakdown, fees_managed",
    orderBy: "name",
    ascending: true,
    pageSize: 1000,
    modify: (q) => q.eq("university_id", uid),
  });
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name || ""),
    university_id: String(r.university_id || ""),
    pisa_fee: r.pisa_fee == null ? null : Number(r.pisa_fee),
    fee_base_paise: r.fee_base_paise == null ? null : Number(r.fee_base_paise),
    fee_processing_paise:
      r.fee_processing_paise == null ? null : Number(r.fee_processing_paise),
    show_fee_breakdown: r.show_fee_breakdown == null ? null : Boolean(r.show_fee_breakdown),
    fees_managed: r.fees_managed == null ? null : Boolean(r.fees_managed),
  }));
}
