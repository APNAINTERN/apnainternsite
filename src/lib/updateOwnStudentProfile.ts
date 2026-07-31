import type { SupabaseClient } from "@supabase/supabase-js";
import {
  enrichStudentProfileForDisplay,
  syncStudentProfileMetadata,
} from "@/lib/studentProfileDisplay";
import { syncStudentAcademicInfo } from "@/lib/syncStudentAcademicInfo";
import { isStudentSelfProfileEditBlocked } from "@/lib/studentPolicy";

export type SavedStudentRow = { id: string; email: string };

const PROFILE_COLUMNS = [
  "email",
  "full_name",
  "gender",
  "parent_name",
  "contact_number",
  "university_name",
  "college_name",
  "degree",
  "department",
  "academic_session",
  "class_semester",
  "roll_number",
  "course",
  "internship_domain",
  "internship_duration",
  "joining_date",
  "completion_date",
  "emergency_name",
  "emergency_contact",
  "emergency_relation",
  "status",
  "metadata",
] as const;

const ACADEMIC_VERIFY_KEYS = [
  "university_name",
  "college_name",
  "degree",
  "department",
  "academic_session",
  "class_semester",
  "roll_number",
  "course",
  "internship_domain",
] as const;

const ACADEMIC_META_ALIASES: Record<string, string[]> = {
  university_name: ["university_name", "university"],
  college_name: ["college_name", "college"],
  degree: ["degree"],
  department: ["department"],
  academic_session: ["academic_session", "session"],
  class_semester: ["class_semester", "semester", "classSem"],
  roll_number: ["roll_number", "rollNo"],
  course: ["course"],
  internship_domain: ["internship_domain", "course"],
};

const hasText = (v: unknown) => v != null && String(v).trim() !== "";

function pickProfilePatch(
  row: Record<string, unknown>,
  existing?: Record<string, unknown> | null
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of PROFILE_COLUMNS) {
    if (key in row && row[key] !== undefined) {
      out[key] = row[key];
    }
  }
  out.metadata = syncStudentProfileMetadata(out, out.metadata as Record<string, unknown>);
  if (out.metadata && typeof out.metadata === "object" && !Array.isArray(out.metadata)) {
    const m = { ...(out.metadata as Record<string, unknown>) };
    delete m.registration_id;
    out.metadata = m;
  }
  return applyLockedInstitutionFields(out, existing);
}

/** Students cannot change university/college after registration (fee integrity). */
function applyLockedInstitutionFields(
  patch: Record<string, unknown>,
  existing?: Record<string, unknown> | null
): Record<string, unknown> {
  if (!existing) return patch;

  const lockedUniversity = String(existing.university_name || "").trim();
  const lockedCollege = String(existing.college_name || "").trim();
  if (!lockedUniversity && !lockedCollege) return patch;

  const next: Record<string, unknown> = { ...patch };
  if (lockedUniversity) next.university_name = lockedUniversity;
  if (lockedCollege) next.college_name = lockedCollege;

  if (next.metadata && typeof next.metadata === "object" && !Array.isArray(next.metadata)) {
    const m = { ...(next.metadata as Record<string, unknown>) };
    delete m.university;
    delete m.university_name;
    delete m.college;
    delete m.college_name;
    delete m.college_id;
    delete m.university_id;
    next.metadata = syncStudentProfileMetadata(next, m);
    if (typeof next.metadata === "object" && next.metadata !== null && !Array.isArray(next.metadata)) {
      const cleaned = { ...(next.metadata as Record<string, unknown>) };
      delete cleaned.registration_id;
      next.metadata = cleaned;
    }
  } else {
    next.metadata = syncStudentProfileMetadata(next, {});
  }

  return next;
}

function isRegistrationIdConflict(err: { message?: string; code?: string }): boolean {
  const blob = `${err.code || ""} ${err.message || ""}`.toLowerCase();
  return blob.includes("students_registration_id_key") || blob.includes("registration_id");
}

function patchExpectsAcademics(patch: Record<string, unknown>): boolean {
  return ACADEMIC_VERIFY_KEYS.some((k) => hasText(patch[k]));
}

function fieldPersisted(
  key: string,
  patch: Record<string, unknown>,
  row: Record<string, unknown> | null
): boolean {
  if (!hasText(patch[key])) return true;
  const display = enrichStudentProfileForDisplay(row);
  if (display && hasText(display[key as keyof typeof display])) return true;

  const meta = row?.metadata;
  const parsed =
    typeof meta === "string"
      ? (() => {
          try {
            return JSON.parse(meta) as Record<string, unknown>;
          } catch {
            return {};
          }
        })()
      : typeof meta === "object" && meta !== null && !Array.isArray(meta)
        ? (meta as Record<string, unknown>)
        : {};

  return (ACADEMIC_META_ALIASES[key] || [key]).some((alias) => hasText(parsed[alias]));
}

function academicsPersisted(
  patch: Record<string, unknown>,
  row: Record<string, unknown> | null
): boolean {
  if (!patchExpectsAcademics(patch)) return true;
  return ACADEMIC_VERIFY_KEYS.every((k) => fieldPersisted(k, patch, row));
}

async function academicsPersistedInAcademicInfo(
  client: SupabaseClient,
  userId: string,
  patch: Record<string, unknown>
): Promise<boolean> {
  const { data, error } = await client
    .from("academic_info")
    .select("university_name, college_name, degree, department, academic_session, class_semester, roll_number, course")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return false;
  const row = data as Record<string, unknown>;
  return ACADEMIC_VERIFY_KEYS.every((k) => fieldPersisted(k, patch, row));
}

async function fetchOwnStudentRow(
  client: SupabaseClient,
  userId: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await client.from("students").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return (data as Record<string, unknown>) || null;
}

function patchWithoutRegistrationId(patch: Record<string, unknown>): Record<string, unknown> {
  const safe = { ...patch };
  delete safe.registration_id;
  if (safe.metadata && typeof safe.metadata === "object" && !Array.isArray(safe.metadata)) {
    const m = { ...(safe.metadata as Record<string, unknown>) };
    delete m.registration_id;
    safe.metadata = m;
  }
  return safe;
}

async function updateById(
  client: SupabaseClient,
  userId: string,
  patch: Record<string, unknown>
): Promise<SavedStudentRow | null> {
  const safePatch = patchWithoutRegistrationId(patch);
  const { data, error } = await client
    .from("students")
    .update(safePatch)
    .eq("id", userId)
    .select("id, email")
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) return null;
  return { id: String(data.id), email: String(data.email || patch.email || "") };
}

async function insertById(
  client: SupabaseClient,
  userId: string,
  patch: Record<string, unknown>
): Promise<SavedStudentRow | null> {
  const insertPayload = patchWithoutRegistrationId({
    id: userId,
    full_name: patch.full_name || "Student",
    ...patch,
  });

  const { data, error } = await client
    .from("students")
    .insert(insertPayload)
    .select("id, email")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      const msg = String(error.message || "");
      if (msg.includes("students_pkey") || isRegistrationIdConflict(error)) {
        return updateById(client, userId, patch);
      }
    }
    throw error;
  }
  if (!data?.id) return null;
  return { id: String(data.id), email: String(data.email || "") };
}

async function trySyncOwnAuthEmail(
  client: SupabaseClient,
  userId: string,
  email: string,
  opts?: { required?: boolean }
): Promise<void> {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized.includes("@")) return;

  const { error } = await client.rpc("sync_student_own_auth_email", {
    p_user_id: userId,
    p_new_email: normalized,
  });
  if (!error) return;

  const missing =
    error.code === "PGRST202" ||
    /sync_student_own_auth_email|could not find|42883/i.test(String(error.message || ""));
  if (missing) {
    if (opts?.required) {
      throw new Error(
        "Could not update your login email. Ask support to run supabase/hotfix_student_profile_email_sync.sql in Supabase, then save your profile again."
      );
    }
    return;
  }
  throw error;
}

async function rpcUpdateOwnProfile(
  client: SupabaseClient,
  userId: string,
  patch: Record<string, unknown>
): Promise<SavedStudentRow | null> {
  const { data: sessionData } = await client.auth.getSession();
  const authId = sessionData.session?.user?.id;
  if (!authId || authId !== userId) {
    return null;
  }

  const rpcPayload = {
    ...patch,
    email: patch.email,
    metadata: patch.metadata ?? {},
  };

  const { data: rpcData, error: rpcErr } = await client.rpc("student_update_own_profile", {
    p_row: rpcPayload,
  });

  if (rpcErr) {
    const missing =
      rpcErr.code === "PGRST202" ||
      /student_update_own_profile|could not find|42883/i.test(String(rpcErr.message || ""));
    if (missing) return null;
    if (isRegistrationIdConflict(rpcErr)) {
      return updateById(client, userId, patch);
    }
    throw rpcErr;
  }

  if (rpcData && typeof rpcData === "object") {
    const parsed = rpcData as { id?: string; email?: string };
    if (parsed.id) {
      return {
        id: String(parsed.id),
        email: String(parsed.email || patch.email || ""),
      };
    }
  }
  return null;
}

async function ensureAcademicsPersisted(
  client: SupabaseClient,
  userId: string,
  patch: Record<string, unknown>
): Promise<void> {
  if (!patchExpectsAcademics(patch)) return;

  await syncStudentAcademicInfo(client, userId, patch);

  let row = await fetchOwnStudentRow(client, userId);
  if (academicsPersisted(patch, row)) return;
  if (await academicsPersistedInAcademicInfo(client, userId, patch)) return;

  await rpcUpdateOwnProfile(client, userId, patch);
  row = await fetchOwnStudentRow(client, userId);
  if (academicsPersisted(patch, row)) return;
  if (await academicsPersistedInAcademicInfo(client, userId, patch)) return;

  const retry = await updateById(client, userId, patch);
  if (retry) {
    row = await fetchOwnStudentRow(client, userId);
    if (academicsPersisted(patch, row)) return;
    if (await academicsPersistedInAcademicInfo(client, userId, patch)) return;
  }

  throw new Error(
    "Academic details did not save. In Supabase SQL Editor, run the full file supabase/hotfix_student_update_own_profile.sql, then try saving again."
  );
}

/**
 * Save the logged-in learner's students row without touching registration_id.
 */
export async function updateOwnStudentProfile(
  client: SupabaseClient,
  userId: string,
  row: Record<string, unknown>
): Promise<SavedStudentRow> {
  const existing = await fetchOwnStudentRow(client, userId);
  const uniName = String(
    row.university_name ?? existing?.university_name ?? ""
  ).trim();
  if (isStudentSelfProfileEditBlocked(uniName)) {
    throw new Error("Profile editing is no longer available for your university.");
  }

  const patch = pickProfilePatch(row, existing);
  if (!patch.email) {
    patch.email = String(row.email || "").trim().toLowerCase();
  } else {
    patch.email = String(patch.email).trim().toLowerCase();
  }

  const previousEmail = String(existing?.email || "").trim().toLowerCase();
  const emailChanged = Boolean(patch.email) && patch.email !== previousEmail;

  await trySyncOwnAuthEmail(client, userId, String(patch.email), {
    required: emailChanged,
  });

  let saved: SavedStudentRow | null = null;

  saved = await rpcUpdateOwnProfile(client, userId, patch);
  if (!saved) saved = await updateById(client, userId, patch);
  if (!saved) {
    try {
      saved = await insertById(client, userId, patch);
    } catch (insertErr) {
      const err = insertErr as { message?: string; code?: string };
      if (err.code === "23505" && isRegistrationIdConflict(err)) {
        saved = await updateById(client, userId, patch);
      }
      if (!saved) throw insertErr;
    }
  }

  if (!saved) {
    throw new Error(
      "Could not save student profile (blocked or no row returned). Check database policies."
    );
  }

  await ensureAcademicsPersisted(client, userId, patch);

  if (emailChanged) {
    const { data: sessionData } = await client.auth.getSession();
    const sessionEmail = String(sessionData.session?.user?.email || "")
      .trim()
      .toLowerCase();
    if (sessionEmail && sessionEmail !== String(saved.email).trim().toLowerCase()) {
      await client.auth.refreshSession();
    }
  }

  return saved;
}
