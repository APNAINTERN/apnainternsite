import type { SupabaseClient } from "@supabase/supabase-js";
import { REGISTRATION_PASSWORD_MIN_LENGTH } from "@/lib/registrationPassword";
import { markLeadCrmConvertedByEmail } from "@/lib/leadAssignment";
import {
  resolveEngineeringUniversityNames,
  resolveStudentTrack,
  type StudentTrack,
} from "@/lib/studentTrack";
import { parseJsonField } from "@/lib/parseJsonField";

export type AdminAddRegistrationInput = {
  email: string;
  password: string;
  phone: string;
  fullName?: string;
  paymentId?: string;
  amountPaise?: number;
  registrationSource?: string;
  universityName?: string;
  collegeName?: string;
  course?: string;
  degree?: string;
  department?: string;
  subject?: string;
  /** Explicit track from Add Registration academic flow. */
  studentTrack?: StudentTrack;
  /** True when engineering BEU/details form was completed. */
  hasEngineeringDetails?: boolean;
};

export type AdminAddRegistrationResult = {
  userId: string;
  email: string;
  registrationId: string | null;
  paymentId: string;
  paid: boolean;
};

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").slice(-10);
}

export function validateAdminAddRegistrationInput(input: AdminAddRegistrationInput): string | null {
  const email = normalizeEmail(input.email);
  if (!email.includes("@")) return "Enter a valid email address.";
  const phone = normalizePhone(input.phone);
  if (phone.length < 10) return "Enter a valid 10-digit mobile number.";
  const password = input.password.trim();
  if (password.length < REGISTRATION_PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${REGISTRATION_PASSWORD_MIN_LENGTH} characters.`;
  }
  const payId = String(input.paymentId || "").trim();
  if (payId && !/^pay_/i.test(payId)) {
    return "Payment id must start with pay_ (Razorpay id), or leave blank.";
  }
  return null;
}

/**
 * Try the full 13-param version of the RPC (available after migration
 * 20260723120000_admin_create_registration_full_params.sql is applied).
 */
async function tryFullRpc(
  client: SupabaseClient,
  email: string,
  password: string,
  phone: string,
  fullName: string | undefined,
  paymentId: string | undefined,
  amountPaise: number | undefined,
  input: AdminAddRegistrationInput
) {
  return client.rpc("admin_create_minimal_student_registration", {
    p_email: email,
    p_password: password,
    p_phone: phone,
    p_full_name: fullName ?? null,
    p_payment_id: paymentId ?? null,
    p_amount_paise: amountPaise ?? null,
    p_registration_source: input.registrationSource ?? null,
    p_university_name: String(input.universityName || "").trim() || null,
    p_college_name: String(input.collegeName || "").trim() || null,
    p_course: String(input.course || "").trim() || null,
    p_degree: String(input.degree || "").trim() || null,
    p_department: String(input.department || "").trim() || null,
    p_subject: String(input.subject || "").trim() || null,
  });
}

/**
 * Fallback: call the original 6-param version (the one guaranteed to exist in DB).
 */
async function tryLegacyRpc(
  client: SupabaseClient,
  email: string,
  password: string,
  phone: string,
  fullName: string | undefined,
  paymentId: string | undefined,
  amountPaise: number | undefined
) {
  return client.rpc("admin_create_minimal_student_registration", {
    p_email: email,
    p_password: password,
    p_phone: phone,
    p_full_name: fullName ?? null,
    p_payment_id: paymentId ?? null,
    p_amount_paise: amountPaise ?? null,
  });
}

/**
 * After the legacy RPC creates the student, patch academic fields directly.
 * This is only needed when the full-param RPC isn't deployed yet.
 */
async function patchAcademicFields(
  client: SupabaseClient,
  email: string,
  input: AdminAddRegistrationInput
) {
  const patch: Record<string, string> = {};
  if (input.universityName?.trim()) patch.university_name = input.universityName.trim();
  if (input.collegeName?.trim())    patch.college_name    = input.collegeName.trim();
  if (input.course?.trim())         patch.course          = input.course.trim();
  if (input.degree?.trim())         patch.internship_domain = input.degree.trim();
  if (Object.keys(patch).length === 0) return; // nothing to patch

  const { error } = await client
    .from("students")
    .update(patch)
    .eq("email", email);

  if (error) {
    // Non-fatal: base registration succeeded, just log
    console.warn("[add-registration] academic patch failed:", error.message);
  }
}

function isSignatureMismatch(code: string | undefined, msg: string): boolean {
  // PGRST202 = "Could not find the function" (wrong number/names of params)
  return (
    code === "PGRST202" ||
    /could not find the function/i.test(msg) ||
    /function.*does not exist/i.test(msg) ||
    /no function matches/i.test(msg)
  );
}

export async function adminCreateMinimalStudentRegistration(
  client: SupabaseClient,
  input: AdminAddRegistrationInput
): Promise<AdminAddRegistrationResult> {
  const validationError = validateAdminAddRegistrationInput(input);
  if (validationError) throw new Error(validationError);

  const email       = normalizeEmail(input.email);
  const phone       = normalizePhone(input.phone);
  const password    = input.password.trim();
  const fullName    = String(input.fullName || "").trim() || undefined;
  const paymentId   = String(input.paymentId || "").trim() || undefined;
  const amountPaise =
    input.amountPaise != null && Number.isFinite(input.amountPaise)
      ? Math.round(input.amountPaise)
      : undefined;

  // 1️⃣  Try the full 13-param RPC first (works after migration is applied)
  let result = await tryFullRpc(client, email, password, phone, fullName, paymentId, amountPaise, input);

  // 2️⃣  If the DB doesn't know the extra params yet, fall back to the 6-param version
  if (result.error && isSignatureMismatch(result.error.code, String(result.error.message || ""))) {
    console.info("[add-registration] Full RPC not deployed yet, falling back to 6-param version.");
    result = await tryLegacyRpc(client, email, password, phone, fullName, paymentId, amountPaise);

    if (!result.error) {
      // Patch academic fields separately since legacy RPC doesn't handle them
      await patchAcademicFields(client, email, input);
    }
  }

  const { data, error } = result;

  if (error) {
    const msg = String(error.message || "");

    if (isSignatureMismatch(error.code, msg)) {
      // Both RPCs failed — the function itself is missing entirely
      throw new Error(
        "Add Registration is not set up in the database yet. " +
        "Please run supabase/migrations/20260604120000_admin_create_minimal_student_registration.sql " +
        "in the Supabase SQL Editor, then try again."
      );
    }
    if (/access denied/i.test(msg)) {
      throw new Error("You do not have permission to add registrations. Please contact the admin.");
    }
    if (/already exists|duplicate/i.test(msg)) {
      throw new Error("A student with this email already exists. Use a different email.");
    }
    throw new Error(msg || "Could not create student registration.");
  }

  const row = (data || {}) as Record<string, unknown>;
  if (row.ok !== true) {
    throw new Error("Registration could not be completed. Please try again.");
  }

  const userId = String(row.user_id || "");
  const engNames = await resolveEngineeringUniversityNames(client);
  const track: StudentTrack =
    input.studentTrack ||
    (input.hasEngineeringDetails
      ? "engineering"
      : resolveStudentTrack(
          {
            university_name: input.universityName,
            department: input.degree || input.department,
            beu_course: input.hasEngineeringDetails ? input.degree : undefined,
            beu_branch: input.hasEngineeringDetails ? input.department : undefined,
            metadata: {
              registration_source: input.registrationSource,
              source: input.registrationSource,
            },
          },
          engNames
        ));

  if (userId) {
    try {
      const { data: existing } = await client
        .from("students")
        .select("metadata")
        .eq("id", userId)
        .maybeSingle();
      const prevMeta =
        parseJsonField((existing as { metadata?: unknown } | null)?.metadata) || {};
      await client
        .from("students")
        .update({
          metadata: {
            ...prevMeta,
            student_track: track,
            source: prevMeta.source || input.registrationSource || null,
            registration_source:
              prevMeta.registration_source || input.registrationSource || null,
          },
        })
        .eq("id", userId);
    } catch (e) {
      console.warn("[add-registration] student_track metadata skipped:", e);
    }

    // Non-Technical only — Engineering students belong in Engineering Directory.
    if (track !== "engineering") {
      try {
        await client.rpc("mark_student_directory_visible", { p_user_id: userId });
      } catch (e) {
        console.warn("[add-registration] mark_student_directory_visible skipped:", e);
      }
    }
  }

  await markLeadCrmConvertedByEmail(
    client,
    String(row.email || email),
    "Auto-converted: added to registration"
  );

  return {
    userId,
    email:          String(row.email || email),
    registrationId: row.registration_id ? String(row.registration_id) : null,
    paymentId:      String(row.payment_id || paymentId || ""),
    paid:           row.paid === true,
  };
}
