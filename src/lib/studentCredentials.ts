import type { SupabaseClient } from "@supabase/supabase-js";

/** Radix Select placeholders for optional student edit fields */
export const EDIT_GENDER_SENTINEL = "__edit_gender_unset__";
export const EDIT_DOMAIN_SENTINEL = "__edit_domain_unset__";

/** Latest directory row for credential emails — always fetch from DB; do not trust paginated table cache. */
export async function fetchLatestStudentCredentialRow(
  client: SupabaseClient,
  studentId: string
): Promise<{
  registration_id: string | null;
  metadata: unknown;
  email: string | null;
  full_name: string | null;
} | null> {
  const { data, error } = await client
    .from("students")
    .select("registration_id, metadata, email, full_name")
    .eq("id", studentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Plaintext password for admin resend (stored in metadata only — not a students table column). */
export function getStudentDirectoryPassword(row: any): string | undefined {
  const m = row?.metadata;
  if (m && typeof m === "object" && typeof (m as Record<string, unknown>).password === "string") {
    const p = String((m as Record<string, unknown>).password).trim();
    if (p) return p;
  }
  return undefined;
}

/**
 * Store optional directory copy of login password in metadata.password for admin credential emails.
 * Auth password lives only in Supabase Auth (auth.users).
 */
export function withStoredDirectoryPassword<T extends { metadata?: unknown }>(
  payload: T,
  plainPassword: string | undefined | null
): T {
  const p = typeof plainPassword === "string" ? plainPassword.trim() : "";
  if (!p) return payload;
  const prevMeta =
    typeof payload.metadata === "object" && payload.metadata !== null
      ? { ...(payload.metadata as Record<string, unknown>) }
      : {};
  return {
    ...payload,
    metadata: { ...prevMeta, password: p },
  };
}

/**
 * After the learner changes password in Auth (e.g. Dashboard), mirror it in metadata for "Resend credentials".
 */
export async function syncStudentDirectoryPassword(
  client: SupabaseClient,
  userId: string,
  plainPassword: string
): Promise<void> {
  const p = typeof plainPassword === "string" ? plainPassword.trim() : "";
  if (!userId || !p) return;

  const { data: prevRow } = await client.from("students").select("metadata").eq("id", userId).maybeSingle();
  const prevMeta =
    typeof prevRow?.metadata === "object" && prevRow.metadata !== null
      ? { ...(prevRow.metadata as Record<string, unknown>) }
      : {};

  const { error } = await client
    .from("students")
    .update({
      metadata: { ...prevMeta, password: p },
    })
    .eq("id", userId);

  if (error) console.warn("[syncStudentDirectoryPassword]", error.message);
}

/**
 * After `auth.updateUser({ password })`, keep metadata copy in sync (admin "Resend credentials").
 */
export async function syncDirectoryPasswordAfterAuthChange(
  client: SupabaseClient,
  plainPassword: string
): Promise<void> {
  const p = typeof plainPassword === "string" ? plainPassword.trim() : "";
  if (p.length < 5) throw new Error("Password must be at least 5 characters");

  const { error: rpcErr } = await client.rpc("sync_student_directory_password", { p_plain: p });
  if (!rpcErr) return;

  const msg = rpcErr.message || "";
  if (/sync_student_directory_password|does not exist|42883|PGRST202|404/i.test(msg)) {
    const { data: u } = await client.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) throw rpcErr;
    await syncStudentDirectoryPassword(client, uid, p);
    return;
  }
  throw rpcErr;
}

/** Readable temporary password for reset + email flows. */
export function generateTempPassword(length = 12): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < length; i++) out += chars[arr[i]! % chars.length];
  return out;
}
