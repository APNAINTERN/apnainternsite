import type { SupabaseClient } from "@supabase/supabase-js";
import { coalesce } from "@/lib/requestCoalesce";

/** When false (dev only), students may use the dashboard without a payment_success row. */
export function isStudentPaymentGateEnforced(): boolean {
  return import.meta.env.VITE_REGISTRATION_PAYMENT_OPTIONAL !== "true";
}

export function isImpersonatingStudent(): boolean {
  return typeof localStorage !== "undefined" && !!localStorage.getItem("impersonate_id");
}

/**
 * After unpaid login, land on home so students can browse freely.
 * Payment stays available via nav "Pay fee" / dashboard soft lock.
 */
export const STUDENT_PAYMENT_REQUIRED_PATH = "/register?payment=required";
export const STUDENT_POST_UNPAID_LOGIN_PATH = "/";

type PaymentSuccessRow = {
  payment_id?: string | null;
  amount_paise?: number | null;
  status?: string | null;
};

export function parseStudentMetadata(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

/** Product access after payment — course buyers stay out of internship modules. */
export type StudentAccessScope = "course_only" | "internship" | "full";

export function parseStudentAccessScope(metadata: unknown): StudentAccessScope {
  const meta = parseStudentMetadata(metadata);
  const raw = String(meta.access_scope || "").trim().toLowerCase();
  if (raw === "course_only" || raw === "course") return "course_only";
  if (raw === "full") return "full";
  if (raw === "internship") return "internship";
  // Legacy paid / roster students without a flag → full internship dashboard.
  return "internship";
}

export function hasInternshipAccess(scope: StudentAccessScope): boolean {
  return scope === "internship" || scope === "full";
}

export function internshipUpgradePaymentPath(): string {
  return `${STUDENT_PAYMENT_REQUIRED_PATH}&purpose=internship_upgrade`;
}

export function coursePurchasePaymentPath(courseSlug: string): string {
  const slug = encodeURIComponent(String(courseSlug || "").trim());
  return `/register?payment=required&purpose=course_purchase&course=${slug}`;
}

/**
 * Unpaid Student Data Upload rows stay out of Admin/Staff Directory (and module
 * light lists) until payment clears metadata.payment_required / bulk_upload_paid.
 */
export function isStudentPendingDirectoryPayment(
  metadata: unknown
): boolean {
  const meta = parseStudentMetadata(metadata);
  if (meta.payment_required === true || meta.payment_required === "true") {
    return true;
  }
  if (meta.bulk_upload_paid === false || meta.bulk_upload_paid === "false") {
    return true;
  }
  return false;
}

export function isStudentVisibleInSupportDirectory(
  student: { metadata?: unknown } | null | undefined
): boolean {
  if (!student) return false;
  return !isStudentPendingDirectoryPayment(student.metadata);
}

async function fetchStudentDirectoryRow(
  client: SupabaseClient,
  userId: string,
  email?: string
): Promise<{ id: string; metadata?: unknown } | null> {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  const { data: byId } = await client
    .from("students")
    .select("id, metadata")
    .eq("id", userId)
    .maybeSingle();
  if (byId?.id) return byId;

  if (normalizedEmail.includes("@")) {
    const { data: byEmail } = await client
      .from("students")
      .select("id, metadata")
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (byEmail?.id) return byEmail;
  }

  return null;
}

async function studentExistsInDirectory(
  client: SupabaseClient,
  userId: string,
  email?: string
): Promise<boolean> {
  const row = await fetchStudentDirectoryRow(client, userId, email);
  return Boolean(row?.id);
}

/**
 * Unpaid Student Data Upload imports set metadata.payment_required=true.
 * Those students must pay before dashboard access; all other directory students
 * keep the existing bypass (admin-created / roster / etc.).
 */
async function studentRequiresPaymentBeforeDashboard(
  client: SupabaseClient,
  userId: string,
  email?: string
): Promise<boolean> {
  const row = await fetchStudentDirectoryRow(client, userId, email);
  if (!row) return false;
  const meta = parseStudentMetadata(row.metadata);
  return meta.payment_required === true || meta.payment_required === "true";
}

/** Whether a payment_success row counts as paid enrollment. */
export function paymentRowQualifiesAsPaid(row: PaymentSuccessRow | null | undefined): boolean {
  if (!row?.payment_id) return false;
  const paymentId = String(row.payment_id).trim();
  if (!paymentId) return false;

  const status = String(row.status ?? "success").trim().toLowerCase();
  if (status && status !== "success") return false;

  if (
    /^pay_admin_/i.test(paymentId) ||
    /^admin_/i.test(paymentId) ||
    /^ADMIN_TRANS_/i.test(paymentId)
  ) {
    return true;
  }

  const amountPaise = Number(row.amount_paise);
  return /^pay_[a-z0-9]/i.test(paymentId) && Number.isFinite(amountPaise) && amountPaise >= 100;
}

async function fetchQualifyingPaymentRow(
  client: SupabaseClient,
  userId: string,
  email?: string
): Promise<PaymentSuccessRow | null> {
  const { data: byUser, error: userErr } = await client
    .from("payment_success")
    .select("payment_id, amount_paise, status")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (userErr) {
    console.warn("[payment-gate] payment_success by user_id:", userErr.message);
  } else if (paymentRowQualifiesAsPaid(byUser)) {
    return byUser;
  }

  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail.includes("@")) return null;

  const { data: byEmail, error: emailErr } = await client
    .from("payment_success")
    .select("payment_id, amount_paise, status")
    .eq("email", normalizedEmail)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (emailErr) {
    console.warn("[payment-gate] payment_success by email:", emailErr.message);
    return null;
  }

  return paymentRowQualifiesAsPaid(byEmail) ? byEmail : null;
}

/** True when the student has a successful registration payment logged. */
export async function studentHasPaidEnrollment(
  client: SupabaseClient,
  userId: string,
  email?: string
): Promise<boolean> {
  if (!userId) return false;

  return coalesce(`paid:${userId}`, async () => {
    const { data: rpcPaid, error: rpcErr } = await client.rpc("student_has_paid_enrollment", {
      p_user_id: userId,
    });

    if (!rpcErr && rpcPaid === true) return true;
    if (rpcErr) {
      const msg = String(rpcErr.message || "");
      if (!/student_has_paid_enrollment|could not find|42883|not exposed/i.test(msg)) {
        console.warn("[payment-gate] student_has_paid_enrollment:", rpcErr.message);
      }
    }

    const row = await fetchQualifyingPaymentRow(client, userId, email);
    if (paymentRowQualifiesAsPaid(row)) return true;

    const { data: recovered, error: recoverErr } = await client.rpc(
      "student_recover_paid_enrollment",
      { p_payment_id: null }
    );
    if (!recoverErr && recovered === true) return true;
    if (
      recoverErr &&
      !/student_recover_paid_enrollment|could not find|42883|not exposed/i.test(
        String(recoverErr.message || "")
      )
    ) {
      console.warn("[payment-gate] student_recover_paid_enrollment:", recoverErr.message);
    }

    const rowAfter = await fetchQualifyingPaymentRow(client, userId, email);
    return paymentRowQualifiesAsPaid(rowAfter);
  });
}

/** Active LMS enrollments also unlock a (course-scoped) dashboard. */
export async function studentHasActiveCourseEnrollment(
  client: SupabaseClient,
  userId: string
): Promise<boolean> {
  if (!userId) return false;
  const { count, error } = await client
    .from("course_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("student_id", userId)
    .neq("status", "cancelled");
  if (error) {
    console.warn("[payment-gate] course_enrollments:", error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

export async function fetchStudentAccessScope(
  client: SupabaseClient,
  userId: string,
  email?: string
): Promise<StudentAccessScope> {
  const row = await fetchStudentDirectoryRow(client, userId, email);
  return parseStudentAccessScope(row?.metadata);
}

export async function canAccessStudentDashboard(
  client: SupabaseClient,
  userId: string,
  email?: string
): Promise<boolean> {
  if (!isStudentPaymentGateEnforced()) return true;
  if (isImpersonatingStudent()) return true;
  return coalesce(`access:${userId}`, async () => {
    if (await studentHasPaidEnrollment(client, userId, email)) return true;

    // Course-only buyers: paid course purchase creates payment_success OR enrollment row.
    if (await studentHasActiveCourseEnrollment(client, userId)) return true;

    const inDirectory = await studentExistsInDirectory(client, userId, email);
    if (!inDirectory) return false;

    // Only unpaid bulk-upload students are locked; other directory rows stay unlocked.
    if (await studentRequiresPaymentBeforeDashboard(client, userId, email)) {
      return false;
    }
    return true;
  }, 15_000);
}
