import type { SupabaseClient } from "@supabase/supabase-js";

const hasText = (v: unknown) => v != null && String(v).trim() !== "";

/** Keep legacy academic_info in sync so refresh/login fallbacks stay accurate. */
export async function syncStudentAcademicInfo(
  client: SupabaseClient,
  userId: string,
  row: Record<string, unknown>
): Promise<void> {
  const university = String(row.university_name || "").trim();
  const college = String(row.college_name || "").trim();
  if (!university && !college) return;

  const payload = {
    user_id: userId,
    university_name: university || "—",
    college_name: college || "—",
    degree: String(row.degree || "").trim() || "—",
    department: String(row.department || "").trim() || "—",
    class_semester: String(row.class_semester || "").trim() || "—",
    academic_session: String(row.academic_session || "").trim() || "—",
    roll_number: String(row.roll_number || "").trim() || "—",
    course:
      String(row.course || row.internship_domain || "").trim() || "—",
    subject: hasText(row.subject) ? String(row.subject).trim() : null,
  };

  const { error } = await client
    .from("academic_info")
    .upsert(payload, { onConflict: "user_id" });
  if (error) console.warn("[profile] academic_info upsert:", error.message);
}
