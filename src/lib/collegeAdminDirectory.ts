import type { SupabaseClient } from "@supabase/supabase-js";

export type CollegeAdminRow = {
  user_id: string;
  college_admin_code?: string | null;
  created_at?: string | null;
  profile_email?: string | null;
  profile_name?: string | null;
  college_ids: string[];
  college_names: string[];
};

/** Load college admin assignments with profile name/email (REST shim safe). */
export async function fetchCollegeAdminDirectory(
  client: SupabaseClient,
  colleges: Array<{ id: string; name?: string | null }>
): Promise<CollegeAdminRow[]> {
  const { data: caa, error: caaErr } = await client
    .from("college_admin_assignments")
    .select("user_id, college_id, college_admin_code, created_at")
    .order("created_at", { ascending: false });

  if (caaErr) throw caaErr;
  if (!caa?.length) return [];

  const caIds = [...new Set(caa.map((r) => r.user_id).filter(Boolean))] as string[];
  const profById: Record<string, { email?: string; full_name?: string }> = {};

  // Chunk `.in()` queries — also works around uuid[] casting issues on the REST shim.
  const CHUNK = 40;
  for (let i = 0; i < caIds.length; i += CHUNK) {
    const slice = caIds.slice(i, i + CHUNK);
    const { data: profiles, error: profErr } = await client
      .from("profiles")
      .select("id,email,full_name")
      .in("id", slice);
    if (profErr) {
      console.warn("college admin profiles chunk:", profErr.message);
      continue;
    }
    for (const p of profiles || []) {
      profById[String(p.id)] = { email: p.email, full_name: p.full_name };
    }
  }

  const collegeById = new Map(colleges.map((c) => [c.id, c.name || ""]));
  const byUser = new Map<string, CollegeAdminRow>();

  for (const r of caa) {
    const collegeName = collegeById.get(r.college_id) || "";
    const existing = byUser.get(r.user_id);
    if (!existing) {
      byUser.set(r.user_id, {
        user_id: r.user_id,
        college_admin_code: r.college_admin_code,
        created_at: r.created_at,
        profile_email: profById[r.user_id]?.email,
        profile_name: profById[r.user_id]?.full_name,
        college_ids: r.college_id ? [r.college_id] : [],
        college_names: collegeName ? [collegeName] : [],
      });
    } else {
      if (r.college_id && !existing.college_ids.includes(r.college_id)) {
        existing.college_ids.push(r.college_id);
      }
      if (collegeName && !existing.college_names.includes(collegeName)) {
        existing.college_names.push(collegeName);
      }
    }
  }

  return Array.from(byUser.values());
}
