import type { SupabaseClient } from "@supabase/supabase-js";
import { enrichStudentProfileForDisplay } from "@/lib/studentProfileDisplay";

const hasText = (v: unknown) => v != null && String(v).trim() !== "";

/** Map payment_orders.metadata keys into a students-shaped row for dashboard display. */
export function studentRowFromPaymentOrderMetadata(
  userId: string,
  email: string,
  meta: Record<string, unknown>
): Record<string, unknown> {
  const str = (k: string, ...aliases: string[]) => {
    for (const key of [k, ...aliases]) {
      const v = meta[key];
      if (hasText(v)) return String(v).trim();
    }
    return "";
  };

  return {
    id: userId,
    email: email.trim().toLowerCase(),
    full_name: str("fullName", "full_name"),
    gender: str("gender"),
    parent_name: str("parentName", "parent_name"),
    contact_number: str("contact_number", "contact"),
    university_name: str("university_name", "university"),
    college_name: str("college_name", "college"),
    course: str("course"),
    internship_domain: str("course"),
    degree: str("degree"),
    department: str("department"),
    class_semester: str("classSem", "semester", "class_semester"),
    academic_session: str("session", "academic_session"),
    roll_number: str("rollNo", "roll_number"),
    subject: str("subject"),
    internship_mode: str("internship_mode"),
    emergency_name: str("emName", "emergency_name"),
    emergency_contact: str("emPhone", "emergency_contact"),
    emergency_relation: str("emRel", "emergency_relation"),
    metadata: meta,
  };
}

/** When students row is thin after payment, merge the latest successful order metadata. */
export async function mergePaymentOrderMetadataIntoStudentRow(
  client: SupabaseClient,
  userId: string,
  email: string,
  row: Record<string, unknown> | null
): Promise<Record<string, unknown> | null> {
  const enriched = enrichStudentProfileForDisplay(row);
  if (
    enriched &&
    (enriched.university_name ||
      enriched.college_name ||
      enriched.degree ||
      enriched.course)
  ) {
    return enriched;
  }

  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return row;

  const { data: orders, error } = await client
    .from("payment_orders")
    .select("metadata, status, updated_at")
    .eq("user_email", normalized)
    .eq("status", "success")
    .order("updated_at", { ascending: false })
    .limit(3);

  if (error || !orders?.length) return row;

  for (const order of orders) {
    const meta = order.metadata;
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) continue;
    const fromOrder = studentRowFromPaymentOrderMetadata(
      userId,
      normalized,
      meta as Record<string, unknown>
    );
    const orderDisplay = enrichStudentProfileForDisplay(fromOrder);
    if (
      !orderDisplay?.university_name &&
      !orderDisplay?.college_name &&
      !orderDisplay?.degree &&
      !orderDisplay?.course
    ) {
      continue;
    }
    if (!row) return orderDisplay;
    return enrichStudentProfileForDisplay({
      ...row,
      ...fromOrder,
      id: userId,
      metadata: {
        ...(typeof row.metadata === "object" && row.metadata
          ? (row.metadata as Record<string, unknown>)
          : {}),
        ...(meta as Record<string, unknown>),
      },
    });
  }

  return row;
}
