import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_COLLEGE_FEE_PAISE,
  resolveStudentFeeBreakdown,
  type CollegeFeeFields,
} from "@/lib/collegeFees";
import { effectiveCoursePrice, enrollStudent, isStudentEnrolled, type Course } from "@/lib/coursesApi";
import { clearCoalesce } from "@/lib/requestCoalesce";
import {
  hasInternshipAccess,
  parseStudentAccessScope,
  parseStudentMetadata,
  studentHasPaidEnrollment,
  type StudentAccessScope,
} from "@/lib/studentPaymentAccess";

export type CourseEnrollPurpose =
  | "course_purchase"
  | "internship_upgrade"
  | "unpaid_registration";

/** Resolve college fee the same way as unpaid internship payment. */
export async function resolveCollegeFeePaise(
  client: SupabaseClient,
  universityName: string | null | undefined,
  collegeName: string | null | undefined
): Promise<{ amountPaise: number; note?: string | null }> {
  const collegeTrim = String(collegeName || "").trim();
  const uniTrim = String(universityName || "").trim();

  let collegeFee: CollegeFeeFields | null = null;
  let resolvedCollegeName = collegeTrim || null;
  let resolvedUniName = uniTrim || null;
  let uniPisa: number | null = null;

  if (collegeTrim) {
    const { data } = await client
      .from("colleges")
      .select(
        "name, pisa_fee, fee_base_paise, fee_processing_paise, show_fee_breakdown, fees_managed, universities(name, pisa_fee)"
      )
      .ilike("name", collegeTrim)
      .limit(1)
      .maybeSingle();

    if (data) {
      collegeFee = {
        pisa_fee: data.pisa_fee == null ? null : Number(data.pisa_fee),
        fee_base_paise: data.fee_base_paise == null ? null : Number(data.fee_base_paise),
        fee_processing_paise:
          data.fee_processing_paise == null ? null : Number(data.fee_processing_paise),
        show_fee_breakdown: data.show_fee_breakdown == null ? null : Boolean(data.show_fee_breakdown),
        fees_managed: data.fees_managed == null ? null : Boolean(data.fees_managed),
      };
      resolvedCollegeName = String(data.name || collegeTrim);
      const uniJoin = data.universities as
        | { name?: string | null; pisa_fee?: number | null }
        | { name?: string | null; pisa_fee?: number | null }[]
        | null
        | undefined;
      const uniRow = Array.isArray(uniJoin) ? uniJoin[0] : uniJoin;
      if (uniRow?.name) resolvedUniName = String(uniRow.name);
      if (uniRow?.pisa_fee != null) uniPisa = Number(uniRow.pisa_fee);
    }
  }

  const breakdown = resolveStudentFeeBreakdown(
    resolvedUniName,
    resolvedCollegeName,
    collegeFee,
    uniPisa != null ? { pisa_fee: uniPisa } : null,
    collegeTrim ? null : DEFAULT_COLLEGE_FEE_PAISE
  );

  return { amountPaise: breakdown.totalPaise, note: breakdown.note };
}

/**
 * Course checkout amount.
 * Already-registered/paid students (and all course add-ons) pay the course catalog fee only —
 * never the internship registration / college ₹500 fee.
 */
export function resolveCourseFeePaise(
  course: Pick<Course, "is_free" | "discount_price_paise" | "original_price_paise" | "currency">,
  opts?: { alreadyRegisteredPaid?: boolean }
): { amountPaise: number; note: string | null } {
  const amountPaise = effectiveCoursePrice(course);
  if (amountPaise <= 0) {
    return { amountPaise: 0, note: "Free course — no payment required" };
  }
  if (opts?.alreadyRegisteredPaid) {
    return {
      amountPaise,
      note: "Course fee only (registration fee already paid)",
    };
  }
  return { amountPaise, note: "Course enrollment fee" };
}

/** True when student already completed internship/registration payment (not course-only unpaid). */
export async function studentAlreadyPaidRegistration(
  client: SupabaseClient,
  userId: string,
  email?: string | null,
  metadata?: unknown
): Promise<boolean> {
  const scope = parseStudentAccessScope(metadata);
  if (hasInternshipAccess(scope)) return true;
  return studentHasPaidEnrollment(client, userId, email || undefined);
}

export async function ensureCourseEnrollment(
  client: SupabaseClient,
  courseId: string,
  studentId: string
): Promise<void> {
  const existing = await isStudentEnrolled(client, studentId, courseId);
  if (existing) return;
  try {
    await enrollStudent(client, courseId, studentId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Unique (course_id, student_id) — treat as success.
    if (/duplicate|unique|23505/i.test(msg)) return;
    throw err;
  }
}

export async function patchStudentAccessScope(
  client: SupabaseClient,
  userId: string,
  currentMetadata: unknown,
  nextScope: StudentAccessScope,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const meta = parseStudentMetadata(currentMetadata);
  const prev = parseStudentAccessScope(meta);
  // Never downgrade internship/full → course_only.
  let access_scope: StudentAccessScope = nextScope;
  if (prev === "full" || prev === "internship") {
    if (nextScope === "course_only") access_scope = prev;
  }
  if (nextScope === "full" || nextScope === "internship") {
    access_scope = nextScope === "full" ? "full" : "internship";
  }

  const nextMeta = {
    ...meta,
    ...extra,
    access_scope,
    payment_required: false,
    bulk_upload_paid: true,
  };

  await client
    .from("students")
    .update({ metadata: JSON.stringify(nextMeta) })
    .eq("id", userId);

  clearCoalesce(`access:${userId}`);
  clearCoalesce(`paid:${userId}`);
}

export async function logPaymentSuccessRow(
  client: SupabaseClient,
  row: {
    user_id: string;
    payment_id: string;
    amount_paise: number;
    email?: string | null;
    full_name?: string | null;
    college_name?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const payload = {
    user_id: row.user_id,
    payment_id: row.payment_id,
    amount_paise: row.amount_paise,
    email: row.email,
    full_name: row.full_name,
    college_name: row.college_name ?? null,
    status: "success",
    metadata: row.metadata ? JSON.stringify(row.metadata) : undefined,
  };

  const { error: logErr } = await client.rpc("ensure_payment_success_log", {
    p_row: payload,
  });
  if (logErr) {
    await client.from("payment_success").upsert(
      {
        user_id: payload.user_id,
        payment_id: payload.payment_id,
        amount_paise: payload.amount_paise,
        email: payload.email,
        full_name: payload.full_name,
        college_name: payload.college_name,
        status: "success",
      },
      { onConflict: "payment_id" }
    );
  }
}

export type DirectoryStudentLite = {
  id: string;
  email: string | null;
  full_name: string | null;
  contact_number: string | null;
  university_name: string | null;
  college_name: string | null;
  class_semester?: string | null;
  academic_session?: string | null;
  registration_id?: string | null;
  metadata?: unknown;
};

export async function fetchDirectoryStudent(
  client: SupabaseClient,
  userId: string,
  email?: string | null
): Promise<DirectoryStudentLite | null> {
  const { data: byId } = await client
    .from("students")
    .select(
      "id, email, full_name, contact_number, university_name, college_name, class_semester, academic_session, registration_id, metadata"
    )
    .eq("id", userId)
    .maybeSingle();
  if (byId?.id) return byId as DirectoryStudentLite;

  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized.includes("@")) return null;
  const { data: byEmail } = await client
    .from("students")
    .select(
      "id, email, full_name, contact_number, university_name, college_name, class_semester, academic_session, registration_id, metadata"
    )
    .eq("email", normalized)
    .maybeSingle();
  return (byEmail as DirectoryStudentLite) || null;
}

/** Persist course-enrollment form details before (or without) payment. */
export async function saveCourseEnrollmentStudentDraft(
  client: SupabaseClient,
  input: {
    userId: string;
    email: string;
    fullName: string;
    phone: string;
    universityName: string;
    collegeName: string;
    semester: string;
    session: string;
    courseId: string;
    courseSlug: string;
    courseTitle?: string;
    paymentRequired: boolean;
    signInPassword?: string;
  }
): Promise<DirectoryStudentLite> {
  const email = input.email.trim().toLowerCase();
  const meta: Record<string, unknown> = {
    access_scope: "course_only",
    source: "course_enrollment_form",
    payment_required: input.paymentRequired,
    pending_course_id: input.courseId,
    pending_course_slug: input.courseSlug,
    university: input.universityName,
    university_name: input.universityName,
    college: input.collegeName,
    college_name: input.collegeName,
    semester: input.semester,
    session: input.session,
    academic_session: input.session,
    contact: input.phone,
    fullName: input.fullName,
  };

  const studentRow: Record<string, unknown> = {
    id: input.userId,
    email,
    full_name: input.fullName,
    contact_number: input.phone,
    university_name: input.universityName,
    college_name: input.collegeName,
    class_semester: input.semester,
    academic_session: input.session,
    // Placeholders so directory validation / offer helpers have academic fields.
    course: input.courseTitle || "Course Enrollment",
    internship_domain: input.courseTitle || "Course Enrollment",
    degree: "Course",
    status: "Active",
    // Object (not JSON.stringify) — RPC expects jsonb object under metadata.
    metadata: meta,
  };

  const { completeStudentDirectoryRegistration } = await import(
    "@/lib/registerStudentDirectory"
  );

  await completeStudentDirectoryRegistration({
    client,
    studentRow,
    profileRow: {
      id: input.userId,
      full_name: input.fullName,
      email,
      contact_number: input.phone,
    },
    signInPassword: input.signInPassword,
  });

  const row = await fetchDirectoryStudent(client, input.userId, email);
  if (!row) {
    throw new Error(
      "Details were submitted but your student profile could not be loaded. Please try again or contact support."
    );
  }
  return row;
}
