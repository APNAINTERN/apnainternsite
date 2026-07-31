import type { SupabaseClient } from "@supabase/supabase-js";
import { mergePaymentOrderMetadataIntoStudentRow } from "@/lib/paymentOrderProfileFallback";
import { isPlaceholderRegistrationId } from "@/lib/registrationId";
import {
  enrichStudentProfileForDisplay,
  mergeStudentRowsForDisplay,
} from "@/lib/studentProfileDisplay";

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const hasText = (v: unknown) => v != null && String(v).trim() !== "";

function rowLooksComplete(row: Record<string, unknown> | null): boolean {
  if (!row) return false;
  const enriched = enrichStudentProfileForDisplay(row);
  if (!enriched) return false;
  return Boolean(
    enriched.university_name ||
      enriched.college_name ||
      enriched.degree ||
      enriched.course ||
      enriched.internship_domain
  );
}

function mergeAcademicInfoIntoStudent(
  student: Record<string, unknown>,
  academic: Record<string, unknown>
): Record<string, unknown> {
  const pick = (key: string) => (hasText(student[key]) ? student[key] : academic[key]);
  return {
    ...student,
    university_name: pick("university_name"),
    college_name: pick("college_name"),
    degree: pick("degree"),
    department: pick("department"),
    academic_session: pick("academic_session"),
    class_semester: pick("class_semester"),
    roll_number: pick("roll_number"),
    course: pick("course"),
    subject: pick("subject"),
  };
}

async function fetchStudentRow(
  client: SupabaseClient,
  userId: string
): Promise<{ row: Record<string, unknown> | null; error: string | null }> {
  const { data: byId, error: idErr } = await client
    .from("students")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (idErr) {
    return { row: null, error: idErr.message };
  }

  let row = (byId as Record<string, unknown>) || null;

  const { data: academic, error: acErr } = await client
    .from("academic_info")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (acErr) {
    return { row, error: acErr.message };
  }

  if (academic && row) {
    row = mergeAcademicInfoIntoStudent(row, academic as Record<string, unknown>);
  } else if (academic && !row) {
    row = {
      id: userId,
      ...(academic as Record<string, unknown>),
    };
  }

  return { row, error: null };
}

async function legacyProfileFallback(
  client: SupabaseClient,
  userId: string,
  email: string
): Promise<Record<string, unknown> | null> {
  const [p, ai, ec] = await Promise.all([
    client.from("profiles").select("*").eq("id", userId).maybeSingle(),
    client.from("academic_info").select("*").eq("user_id", userId).maybeSingle(),
    client.from("emergency_contacts").select("*").eq("user_id", userId).maybeSingle(),
  ]);

  if (!p.data && !ai.data) return null;

  return {
    ...(p.data as Record<string, unknown>),
    id: userId,
    email: email || (p.data as { email?: string })?.email,
    university_name: ai.data?.university_name,
    college_name: ai.data?.college_name,
    course: ai.data?.course,
    degree: ai.data?.degree,
    department: ai.data?.department,
    class_semester: ai.data?.class_semester,
    academic_session: ai.data?.academic_session,
    roll_number: ai.data?.roll_number,
    subject: ai.data?.subject,
    emergency_name: ec.data?.contact_name,
    emergency_contact: ec.data?.contact_number,
    emergency_relation: ec.data?.relationship,
  };
}

export type LoadStudentDashboardResult = {
  profile: ReturnType<typeof enrichStudentProfileForDisplay>;
  rawRow: Record<string, unknown> | null;
  loadError: string | null;
};

/**
 * Load student row for dashboard with retries (post-registration race) and metadata enrichment.
 */
export async function loadStudentDashboardProfile(
  client: SupabaseClient,
  userId: string,
  email: string,
  opts?: { retryUntilComplete?: boolean; maxAttempts?: number }
): Promise<LoadStudentDashboardResult> {
  const maxAttempts = opts?.maxAttempts ?? (opts?.retryUntilComplete ? 8 : 2);
  let lastError: string | null = null;
  let rawRow: Record<string, unknown> | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { row, error } = await fetchStudentRow(client, userId);
    if (error) {
      lastError = error;
      console.warn("[dashboard] students fetch:", error);
    } else if (row) {
      rawRow = row;
      lastError = null;
      if (!opts?.retryUntilComplete || rowLooksComplete(row) || attempt === maxAttempts - 1) {
        break;
      }
    } else if (!opts?.retryUntilComplete) {
      break;
    }

    if (attempt < maxAttempts - 1) {
      await delay(opts?.retryUntilComplete ? 400 : 200);
    }
  }

  if (!rawRow) {
    rawRow = await legacyProfileFallback(client, userId, email);
  }

  if (rawRow && email.includes("@")) {
    const normalized = email.trim().toLowerCase();
    const { data: legacyRows } = await client
      .from("students")
      .select("*")
      .eq("email", normalized)
      .neq("id", userId)
      .order("created_at", { ascending: false })
      .limit(1);

    const legacy = legacyRows?.[0] as Record<string, unknown> | undefined;
    if (legacy) {
      rawRow = mergeStudentRowsForDisplay(rawRow, legacy);
    }
  }

  rawRow = await mergePaymentOrderMetadataIntoStudentRow(client, userId, email, rawRow);

  if (rawRow && isPlaceholderRegistrationId(rawRow.registration_id as string)) {
    const { data: fixed, error: regErr } = await client.rpc("ensure_student_registration_id", {
      p_user_id: userId,
    });
    if (!regErr && typeof fixed === "string" && fixed.trim()) {
      rawRow = { ...rawRow, registration_id: fixed.trim() };
    } else if (regErr) {
      const msg = String(regErr.message || "");
      if (!/ensure_student_registration_id|could not find|PGRST202/i.test(msg)) {
        console.warn("[dashboard] ensure_student_registration_id:", regErr.message);
      }
    }
  }

  return {
    profile: enrichStudentProfileForDisplay(rawRow),
    rawRow,
    loadError: lastError,
  };
}
