import type { SupabaseClient } from "@supabase/supabase-js";

/** Sync profiles row for a learner when editing from Admin / Super Admin / Staff (bypasses profiles RLS safely via RPC). */
export async function adminUpsertStudentProfile(
  client: SupabaseClient,
  params: {
    id: string;
    full_name: string;
    email: string;
    contact_number?: string | null;
    gender?: string | null;
    parent_name?: string | null;
  }
): Promise<void> {
  const { error } = await client.rpc("admin_upsert_student_profile", {
    p_id: params.id,
    p_full_name: params.full_name || "Student",
    p_email: params.email.trim().toLowerCase(),
    p_contact_number: params.contact_number ?? "",
    p_gender: params.gender ?? "",
    p_parent_name: params.parent_name ?? "",
  });

  if (error) {
    const msg = error.message || "";
    if (/admin_upsert_student_profile|does not exist|42883/i.test(msg)) {
      throw new Error(
        "Run migration supabase/migrations/20260509220000_admin_upsert_student_profile_rpc.sql on Supabase (SQL Editor), then retry saving."
      );
    }
    throw error;
  }
}
