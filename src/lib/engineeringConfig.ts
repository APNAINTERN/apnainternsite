import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BEU_BRANCHES,
  BEU_COURSES,
  BEU_SECTION_HOURS,
  BEU_SECTION_WEEKS,
  BEU_SEMESTERS,
  BEU_SESSIONS,
  BEU_SPECIALIZATIONS,
} from "@/lib/beuRegistration";

export type EngineeringUniversityConfig = {
  id: string;
  university_id: string;
  courses: string[];
  branches_by_course: Record<string, string[]>;
  domains: string[];
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  university_name?: string;
};

export type EngineeringConfigInput = {
  universityName: string;
  /** When editing an existing config, keep colleges on this university id. */
  universityId?: string;
  /** Existing config row id — use UPDATE instead of upsert when set. */
  configId?: string;
  collegeNames: string[];
  courses: string[];
  branchesByCourse: Record<string, string[]>;
  domains: string[];
};

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const msg = String(err.message || "").toLowerCase();
  return err.code === "42P01" || (msg.includes("engineering_university_configs") && msg.includes("does not exist"));
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v || "").trim()).filter(Boolean);
}

function parseBranchesMap(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string[]> = {};
  for (const [key, branches] of Object.entries(value as Record<string, unknown>)) {
    const list = parseStringArray(branches);
    if (key.trim() && list.length > 0) out[key.trim()] = list;
  }
  return out;
}

function rowToConfig(
  row: Record<string, unknown>,
  universityName?: string
): EngineeringUniversityConfig {
  return {
    id: String(row.id || ""),
    university_id: String(row.university_id || ""),
    courses: parseStringArray(row.courses),
    branches_by_course: parseBranchesMap(row.branches_by_course),
    domains: parseStringArray(row.domains),
    is_active: row.is_active !== false,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
    university_name: universityName,
  };
}

export function withOtherOption(values: string[]): string[] {
  const unique = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  if (!unique.includes("Other")) unique.push("Other");
  return unique;
}

export function defaultEngineeringOptions(): Pick<
  EngineeringUniversityConfig,
  "courses" | "branches_by_course" | "domains"
> {
  const courses = withOtherOption([...BEU_COURSES]);
  const branches_by_course: Record<string, string[]> = {};
  for (const course of courses) {
    branches_by_course[course] = withOtherOption([...BEU_BRANCHES]);
  }
  return {
    courses,
    branches_by_course,
    domains: [],
  };
}

/** Aggregate course / branch / domain lists across active engineering configs. */
export function aggregateEngineeringCatalogOptions(
  configs: EngineeringUniversityConfig[]
): {
  courses: string[];
  branches: string[];
  branchesByCourse: Record<string, string[]>;
  domains: string[];
} {
  const courses = new Set<string>([...BEU_COURSES]);
  const branches = new Set<string>([...BEU_BRANCHES]);
  const domains = new Set<string>();
  const branchesByCourse: Record<string, string[]> = {};

  for (const course of BEU_COURSES) {
    branchesByCourse[course] = [...BEU_BRANCHES];
  }

  for (const config of configs) {
    if (config.is_active === false) continue;
    for (const course of config.courses || []) {
      const c = String(course || "").trim();
      if (!c || c === "Other") continue;
      courses.add(c);
      if (!branchesByCourse[c]) branchesByCourse[c] = [];
    }
    for (const [course, list] of Object.entries(config.branches_by_course || {})) {
      const key = String(course || "").trim();
      if (!key) continue;
      const merged = new Set(branchesByCourse[key] || []);
      for (const b of list || []) {
        const branch = String(b || "").trim();
        if (!branch || branch === "Other") continue;
        branches.add(branch);
        merged.add(branch);
      }
      branchesByCourse[key] = [...merged];
    }
    for (const d of config.domains || []) {
      const domain = String(d || "").trim();
      if (domain) domains.add(domain);
    }
  }

  const sortAlpha = (a: string, b: string) => a.localeCompare(b);
  return {
    courses: [...courses].sort(sortAlpha),
    branches: [...branches].sort(sortAlpha),
    branchesByCourse,
    domains: [...domains].sort(sortAlpha),
  };
}

export function resolveEngineeringOptions(
  config: EngineeringUniversityConfig | null | undefined
): {
  courses: string[];
  branchesByCourse: Record<string, string[]>;
  domains: string[];
  specializations: string[];
  sessions: string[];
  semesters: string[];
  sectionHours: string[];
  sectionWeeks: string[];
} {
  const fallback = defaultEngineeringOptions();
  const courses =
    config?.courses?.length ? withOtherOption(config.courses) : fallback.courses;
  const branchesByCourse: Record<string, string[]> = {};
  for (const course of courses) {
    const fromConfig = config?.branches_by_course?.[course];
    branchesByCourse[course] =
      fromConfig?.length ? withOtherOption(fromConfig) : withOtherOption([...BEU_BRANCHES]);
  }
  return {
    courses,
    branchesByCourse,
    domains: config?.domains?.length ? config.domains : [],
    specializations: withOtherOption([...BEU_SPECIALIZATIONS]),
    sessions: [...BEU_SESSIONS],
    semesters: [...BEU_SEMESTERS],
    sectionHours: [...BEU_SECTION_HOURS],
    sectionWeeks: [...BEU_SECTION_WEEKS],
  };
}

export async function fetchAllEngineeringConfigs(
  client: SupabaseClient
): Promise<EngineeringUniversityConfig[]> {
  const { data, error } = await client
    .from("engineering_university_configs")
    .select("*")
    .order("created_at", { ascending: false });
  if (error && !isMissingTable(error)) throw error;
  if (!data?.length) return [];

  const uniIds = [...new Set(data.map((row) => String(row.university_id || "")).filter(Boolean))];
  const nameById = new Map<string, string>();
  if (uniIds.length > 0) {
    const { data: unis, error: uniErr } = await client
      .from("universities")
      .select("id, name")
      .in("id", uniIds);
    if (uniErr && !isMissingTable(uniErr)) throw uniErr;
    for (const u of unis || []) {
      nameById.set(String(u.id), String(u.name || ""));
    }
  }

  return data.map((row) =>
    rowToConfig(row as Record<string, unknown>, nameById.get(String(row.university_id || "")))
  );
}

export async function fetchEngineeringConfigMap(
  client: SupabaseClient
): Promise<Map<string, EngineeringUniversityConfig>> {
  const rows = await fetchAllEngineeringConfigs(client);
  const map = new Map<string, EngineeringUniversityConfig>();
  for (const row of rows) {
    if (row.university_id && row.is_active) map.set(row.university_id, row);
  }
  return map;
}

export async function fetchEngineeringConfigForUniversity(
  client: SupabaseClient,
  universityId: string
): Promise<EngineeringUniversityConfig | null> {
  const { data, error } = await client
    .from("engineering_university_configs")
    .select("*")
    .eq("university_id", universityId)
    .eq("is_active", true)
    .maybeSingle();
  if (error && !isMissingTable(error)) throw error;
  if (!data) return null;

  let universityName: string | undefined;
  const { data: uni } = await client
    .from("universities")
    .select("name")
    .eq("id", universityId)
    .maybeSingle();
  if (uni?.name) universityName = String(uni.name);

  return rowToConfig(data as Record<string, unknown>, universityName);
}

async function findOrCreateUniversity(
  client: SupabaseClient,
  name: string,
  existingId?: string
): Promise<{ id: string; name: string }> {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("University name is required");

  if (existingId) {
    const { data: byId, error: byIdErr } = await client
      .from("universities")
      .select("id, name")
      .eq("id", existingId)
      .maybeSingle();
    if (byIdErr) throw byIdErr;
    if (byId?.id) {
      if (String(byId.name || "").trim() !== trimmed) {
        const { error: renameErr } = await client
          .from("universities")
          .update({ name: trimmed })
          .eq("id", existingId);
        if (renameErr) throw renameErr;
      }
      return { id: String(byId.id), name: trimmed };
    }
  }

  const { data: exact } = await client
    .from("universities")
    .select("id, name")
    .ilike("name", trimmed)
    .limit(5);
  const exactHit = (exact || []).find(
    (u) => String(u.name || "").trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (exactHit?.id) return { id: String(exactHit.id), name: String(exactHit.name) };

  const { data: created, error } = await client
    .from("universities")
    .insert({ name: trimmed })
    .select("id, name")
    .single();
  if (error) {
    // Race: another request created the same name — re-read.
    const { data: again } = await client
      .from("universities")
      .select("id, name")
      .ilike("name", trimmed)
      .limit(5);
    const hit = (again || []).find(
      (u) => String(u.name || "").trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (hit?.id) return { id: String(hit.id), name: String(hit.name) };
    throw error;
  }
  return { id: String(created.id), name: String(created.name) };
}

async function chunkedCollegeInsert(
  client: SupabaseClient,
  rows: Record<string, unknown>[],
  chunkSize = 40
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const { error } = await client.from("colleges").insert(slice);
    if (error) throw error;
  }
}

async function chunkedCollegeFeeUpdate(
  client: SupabaseClient,
  ids: string[],
  feeDefaults: Record<string, unknown>,
  chunkSize = 40
): Promise<void> {
  for (let i = 0; i < ids.length; i += chunkSize) {
    const slice = ids.slice(i, i + chunkSize);
    const { error } = await client.from("colleges").update(feeDefaults).in("id", slice);
    if (error) throw error;
  }
}

async function renameCollegeRow(
  client: SupabaseClient,
  collegeId: string,
  fromName: string,
  toName: string
): Promise<void> {
  const { error } = await client.from("colleges").update({ name: toName }).eq("id", collegeId);
  if (error) throw error;
  if (fromName && fromName !== toName) {
    await client.from("students").update({ college_name: toName }).eq("college_name", fromName);
  }
}

function collegeNameSimilarity(a: string, b: string): number {
  const na = String(a || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const nb = String(b || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const longer = na.length >= nb.length ? na : nb;
  const shorter = na.length >= nb.length ? nb : na;
  let hits = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter.slice(i, i + 2)) || longer.includes(shorter[i]!)) hits += 1;
  }
  return hits / Math.max(longer.length, 1);
}

async function ensureColleges(
  client: SupabaseClient,
  universityId: string,
  collegeNames: string[]
): Promise<{
  inserted: string[];
  total: number;
  feesSynced: number;
  removed: string[];
  removeWarnings: string[];
}> {
  const names = [
    ...new Set(
      collegeNames
        .map((n) => n.trim().replace(/\s+/g, " "))
        .filter(Boolean)
    ),
  ];
  if (names.length === 0) {
    return { inserted: [], total: 0, feesSynced: 0, removed: [], removeWarnings: [] };
  }

  const { fetchCollegesByUniversityId, institutionsMatch } = await import(
    "@/lib/institutionCatalog"
  );
  const { defaultEngineeringCollegeFeePayload } = await import("@/lib/collegeFees");
  const feeDefaults = defaultEngineeringCollegeFeePayload();

  const existing = await fetchCollegesByUniversityId(client, universityId);
  const claimedIds = new Set<string>();
  const unmatchedNames: string[] = [];

  for (const name of names) {
    const exact = existing.find(
      (c) => !claimedIds.has(c.id) && c.name.toLowerCase() === name.toLowerCase()
    );
    if (exact) {
      claimedIds.add(exact.id);
      continue;
    }

    const fuzzy = existing.find(
      (c) => !claimedIds.has(c.id) && institutionsMatch(c.name, name)
    );
    if (fuzzy) {
      claimedIds.add(fuzzy.id);
      if (fuzzy.name !== name) {
        await renameCollegeRow(client, fuzzy.id, fuzzy.name, name);
      }
      continue;
    }

    unmatchedNames.push(name);
  }

  // Renames that don't fuzzy-match still leave an orphan row + a "new" name.
  // Pair those instead of inserting duplicates.
  const orphans = existing.filter((c) => !claimedIds.has(c.id));
  const toInsert: Record<string, unknown>[] = [];
  const remainingUnmatched = [...unmatchedNames];

  if (orphans.length === 1 && remainingUnmatched.length === 1) {
    const orphan = orphans[0]!;
    const nextName = remainingUnmatched.shift()!;
    claimedIds.add(orphan.id);
    await renameCollegeRow(client, orphan.id, orphan.name, nextName);
  } else if (orphans.length > 0 && remainingUnmatched.length > 0) {
    const available = [...orphans];
    while (remainingUnmatched.length > 0 && available.length > 0) {
      let bestI = 0;
      let bestJ = 0;
      let bestScore = -1;
      for (let i = 0; i < remainingUnmatched.length; i++) {
        for (let j = 0; j < available.length; j++) {
          const score = collegeNameSimilarity(remainingUnmatched[i]!, available[j]!.name);
          if (score > bestScore) {
            bestScore = score;
            bestI = i;
            bestJ = j;
          }
        }
      }

      // Only force a rename when counts match (pure edit/replace), or similarity is decent.
      const forcePair = remainingUnmatched.length === available.length;
      if (!forcePair && bestScore < 0.35) break;

      const nextName = remainingUnmatched.splice(bestI, 1)[0]!;
      const orphan = available.splice(bestJ, 1)[0]!;
      claimedIds.add(orphan.id);
      await renameCollegeRow(client, orphan.id, orphan.name, nextName);
    }
  }

  for (const name of remainingUnmatched) {
    toInsert.push({ university_id: universityId, name, ...feeDefaults });
  }

  if (toInsert.length > 0) {
    await chunkedCollegeInsert(client, toInsert);
  }

  // Colleges removed from the Eng. Management list must leave the catalog,
  // otherwise the next edit reload shows them again (looks like save failed).
  const leftoverOrphans = existing.filter((c) => !claimedIds.has(c.id));
  const removed: string[] = [];
  const removeWarnings: string[] = [];
  for (const orphan of leftoverOrphans) {
    const { error } = await client.from("colleges").delete().eq("id", orphan.id);
    if (error) {
      removeWarnings.push(
        `${orphan.name}: ${error.message || "could not delete (still referenced)"}`
      );
      continue;
    }
    removed.push(orphan.name);
  }

  const after = await fetchCollegesByUniversityId(client, universityId);
  const missing = names.filter(
    (n) =>
      !after.some(
        (c) => c.name.toLowerCase() === n.toLowerCase() || institutionsMatch(c.name, n)
      )
  );
  if (missing.length > 0) {
    throw new Error(
      `Could not save college(s) to catalog: ${missing.slice(0, 3).join("; ")}${
        missing.length > 3 ? "…" : ""
      }`
    );
  }

  const needsFeeSync = after.filter((c) => {
    const listed = names.some(
      (n) => c.name.toLowerCase() === n.toLowerCase() || institutionsMatch(c.name, n)
    );
    if (!listed) return false;
    const managed = !!c.fees_managed;
    const hasFee = (c.pisa_fee ?? 0) > 0;
    const flat500 =
      (c.pisa_fee ?? 0) === 50000 && (c.fee_processing_paise ?? 0) <= 0;
    return !managed || !hasFee || flat500;
  });

  let feesSynced = toInsert.length;
  if (needsFeeSync.length > 0) {
    const ids = needsFeeSync.map((c) => c.id);
    await chunkedCollegeFeeUpdate(client, ids, feeDefaults);
    feesSynced = ids.length;
  }

  return {
    inserted: toInsert.map((r) => String(r.name)),
    total: names.length,
    feesSynced,
    removed,
    removeWarnings,
  };
}

export async function fetchCollegesForUniversity(
  client: SupabaseClient,
  universityId: string
): Promise<string[]> {
  const { fetchCollegesByUniversityId } = await import("@/lib/institutionCatalog");
  const rows = await fetchCollegesByUniversityId(client, universityId);
  return rows.map((r) => r.name).filter(Boolean);
}

export async function saveEngineeringConfig(
  client: SupabaseClient,
  input: EngineeringConfigInput
): Promise<
  EngineeringUniversityConfig & {
    colleges_saved: number;
    colleges_inserted: number;
    colleges_removed: number;
    colleges_fees_synced: number;
    college_warnings: string[];
  }
> {
  const university = await findOrCreateUniversity(
    client,
    input.universityName,
    input.universityId
  );

  const courses = withOtherOption(input.courses.filter((c) => c !== "Other"));
  const branches_by_course = Object.fromEntries(
    Object.entries(input.branchesByCourse).map(([course, branches]) => [
      course,
      withOtherOption(branches.filter((b) => b !== "Other")),
    ])
  );
  // Ensure every course has a branches entry (including auto-added "Other").
  for (const course of courses) {
    if (!branches_by_course[course]?.length) {
      branches_by_course[course] = withOtherOption([]);
    }
  }

  const payload = {
    university_id: university.id,
    courses,
    branches_by_course,
    domains: [...new Set(input.domains.map((d) => d.trim()).filter(Boolean))],
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  // Persist courses/domains/branches FIRST so Eng. Management edits are not
  // blocked when college catalog sync fails.
  let data: Record<string, unknown> | null = null;
  if (input.configId) {
    const { data: updated, error } = await client
      .from("engineering_university_configs")
      .update(payload)
      .eq("id", input.configId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!updated) {
      // Row id stale / missing — fall through to upsert by university_id.
      const { data: upserted, error: upsertErr } = await client
        .from("engineering_university_configs")
        .upsert(payload, { onConflict: "university_id" })
        .select("*")
        .single();
      if (upsertErr) throw upsertErr;
      data = upserted as Record<string, unknown>;
    } else {
      data = updated as Record<string, unknown>;
    }
  } else {
    const { data: upserted, error } = await client
      .from("engineering_university_configs")
      .upsert(payload, { onConflict: "university_id" })
      .select("*")
      .single();
    if (error) throw error;
    data = upserted as Record<string, unknown>;
  }

  let collegeResult = {
    inserted: [] as string[],
    total: 0,
    feesSynced: 0,
    removed: [] as string[],
    removeWarnings: [] as string[],
  };
  try {
    collegeResult = await ensureColleges(client, university.id, input.collegeNames);
  } catch (collegeErr) {
    const msg =
      collegeErr instanceof Error ? collegeErr.message : "College catalog sync failed.";
    collegeResult.removeWarnings = [msg];
  }

  return {
    ...rowToConfig(data, university.name),
    colleges_saved: collegeResult.total,
    colleges_inserted: collegeResult.inserted.length,
    colleges_removed: collegeResult.removed.length,
    colleges_fees_synced: collegeResult.feesSynced,
    college_warnings: collegeResult.removeWarnings,
  };
}

export async function deleteEngineeringConfig(
  client: SupabaseClient,
  configId: string
): Promise<void> {
  const { error } = await client.from("engineering_university_configs").delete().eq("id", configId);
  if (error && !isMissingTable(error)) throw error;
}

/**
 * Parse Eng. Management textareas: one entry per line.
 * Do NOT split on commas — college names often include ", City" (e.g. "GEC, Patna").
 */
export function parseMultilineList(value: string): string[] {
  return [
    ...new Set(
      String(value || "")
        .split(/\r?\n+/)
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ];
}

