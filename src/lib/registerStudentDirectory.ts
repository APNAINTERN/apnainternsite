import type { SupabaseClient } from "@supabase/supabase-js";
import { allocateNextRegistrationId } from "@/lib/registrationId";
import { withStoredDirectoryPassword } from "@/lib/studentCredentials";
import { applyStudentRegistrationPassword } from "@/lib/registrationPassword";
import { signInStudentWithPassword } from "@/lib/studentAuthLogin";
import { ensurePaymentSuccessLog } from "@/lib/recordPaymentSuccess";
import { syncStudentProfileMetadata } from "@/lib/studentProfileDisplay";
import { syncStudentAcademicInfo } from "@/lib/syncStudentAcademicInfo";

function isRegistrationIdConflict(err: { code?: string; message?: string }): boolean {
  const blob = `${err.code || ""} ${err.message || ""}`.toLowerCase();
  return (
    err.code === "409" ||
    blob.includes("students_registration_id_key") ||
    (blob.includes("registration_id") &&
      (blob.includes("unique") || blob.includes("duplicate") || blob.includes("already exists")))
  );
}

function studentRowWithoutRegistrationId(row: Record<string, unknown>): Record<string, unknown> {
  const safe = { ...row };
  delete safe.registration_id;
  if (safe.metadata && typeof safe.metadata === "object" && !Array.isArray(safe.metadata)) {
    const m = { ...(safe.metadata as Record<string, unknown>) };
    delete m.registration_id;
    safe.metadata = m;
  }
  return safe;
}

/** True when dashboard / offer letter have enough academic data to show. */
export function studentRowHasAcademicData(
  row: Record<string, unknown> | null | undefined
): boolean {
  if (!row) return false;
  const m = row.metadata;
  const meta =
    typeof m === "object" && m !== null && !Array.isArray(m) ? (m as Record<string, unknown>) : {};
  const has = (v: unknown) => v != null && String(v).trim() !== "";
  return (
    has(row.university_name) ||
    has(row.college_name) ||
    has(row.degree) ||
    has(row.course) ||
    has(meta.university) ||
    has(meta.college) ||
    has(meta.degree) ||
    has(meta.course)
  );
}

async function fetchStudentRow(
  client: SupabaseClient,
  userId: string,
  email: string
): Promise<Record<string, unknown> | null> {
  const { data: byId } = await client.from("students").select("*").eq("id", userId).maybeSingle();
  if (byId) return byId as Record<string, unknown>;

  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return null;

  const { data: byEmail } = await client
    .from("students")
    .select("*")
    .eq("email", normalized)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (byEmail as Record<string, unknown>) || null;
}

export type RegistrationStudentPayloadInput = {
  userId: string;
  normalizedEmail: string;
  fullName: string;
  gender: string;
  parentName: string;
  contact: string;
  universityName: string;
  collegeName: string;
  collegeId?: string | null;
  course: string;
  degree: string;
  departmentName: string;
  classSem: string;
  session: string;
  rollNo: string;
  subject: string;
  internshipMode: string;
  emName: string;
  emPhone: string;
  emRel: string;
  referralCode?: string | null;
  cyberShopName?: string | null;
  cyberEmail?: string | null;
  registrationId?: string;
  password?: string;
  extraMetadata?: Record<string, unknown>;
};

/** Canonical students row + metadata for registration and post-payment sync. */
export function buildRegistrationStudentPayload(
  input: RegistrationStudentPayloadInput
): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    fullName: input.fullName,
    gender: input.gender,
    parentName: input.parentName,
    contact: input.contact,
    subject: input.subject,
    internship_mode: input.internshipMode,
    access_scope: "internship",
    university: input.universityName,
    university_name: input.universityName,
    college: input.collegeName,
    college_name: input.collegeName,
    college_id: input.collegeId ?? null,
    degree: input.degree,
    department: input.departmentName,
    session: input.session,
    academic_session: input.session,
    semester: input.classSem,
    classSem: input.classSem,
    rollNo: input.rollNo,
    roll_number: input.rollNo,
    course: input.course,
    internship_domain: input.course,
    emName: input.emName,
    emPhone: input.emPhone,
    emRel: input.emRel,
    internship_duration: "120 Hours",
    ...input.extraMetadata,
  };

  const selectedDuration = String(
    meta.internship_duration || meta.section_duration || "120 Hours"
  ).trim() || "120 Hours";
  meta.internship_duration = selectedDuration;
  if (meta.section_duration) {
    meta.section_duration = String(meta.section_duration).trim();
  }

  const base: Record<string, unknown> = {
    id: input.userId,
    email: input.normalizedEmail,
    full_name: input.fullName,
    gender: input.gender,
    parent_name: input.parentName,
    contact_number: input.contact,
    university_name: input.universityName,
    college_name: input.collegeName,
    college_id: input.collegeId ?? null,
    course: input.course,
    internship_domain: input.course,
    degree: input.degree,
    department: input.departmentName,
    class_semester: input.classSem,
    academic_session: input.session,
    roll_number: input.rollNo,
    emergency_name: input.emName,
    emergency_contact: input.emPhone,
    emergency_relation: input.emRel,
    status: "Active",
    cybercafe_shop_name: input.cyberShopName ?? null,
    cybercafe_email: input.cyberEmail ?? null,
    referral_code: input.referralCode ?? null,
    internship_duration: selectedDuration,
    metadata: meta,
  };

  if (input.registrationId) {
    base.registration_id = input.registrationId;
  }

  return input.password ? withStoredDirectoryPassword(base, input.password) : base;
}

export type CompleteStudentDirectoryInput = {
  client: SupabaseClient;
  studentRow: Record<string, unknown>;
  profileRow?: Record<string, unknown>;
  paymentRow?: Record<string, unknown>;
  /** Used to obtain a session after signUp when email auto-confirm is enabled. */
  signInPassword?: string;
};

/**
 * After cyber-café signUp on an ephemeral client, finish enrollment on the main client
 * (payment_success + complete_student_registration require the student session here).
 */
export async function completeStudentDirectoryRegistrationAsStudent(
  directoryClient: SupabaseClient,
  input: Omit<CompleteStudentDirectoryInput, "client">
): Promise<void> {
  const email = String(input.studentRow.email || "").trim().toLowerCase();
  const password = String(input.signInPassword || "").trim();
  if (email && password) {
    const signIn = await signInStudentWithPassword(directoryClient, email, password);
    if (!signIn.ok) throw signIn.error;
  }
  await completeStudentDirectoryRegistration({ ...input, client: directoryClient });
}

const RPC_RETRY_ATTEMPTS = 3;
const RPC_RETRY_DELAY_MS = 400;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function callCompleteStudentRegistrationRpc(
  client: SupabaseClient,
  studentRow: Record<string, unknown>,
  profileRow: Record<string, unknown> | null | undefined
): Promise<{ error: { code?: string; message?: string } | null }> {
  const { error } = await client.rpc("complete_student_registration", {
    p_student: studentRow,
    p_profile: profileRow ?? null,
  });
  return { error };
}

/**
 * Save student + profile after signUp via SECURITY DEFINER RPC (no service role / Vercel secret).
 * Retries on transient/duplicate errors and verifies academic fields were persisted.
 */
export async function completeStudentDirectoryRegistration(
  input: CompleteStudentDirectoryInput
): Promise<void> {
  const { client, studentRow, profileRow, paymentRow, signInPassword } = input;
  const email = String(studentRow.email || "").trim().toLowerCase();
  const userId = String(studentRow.id || "");

  const { data: sessionWrap } = await client.auth.getSession();
  if (!sessionWrap.session?.access_token && email && signInPassword) {
    const signIn = await signInStudentWithPassword(client, email, signInPassword);
    if (!signIn.ok) throw signIn.error;
  }

  // Log payment before profile RPC so paid students keep dashboard access even if upsert fails.
  if (paymentRow?.payment_id) {
    await ensurePaymentSuccessLog(client, {
      user_id: String(paymentRow.user_id || studentRow.id || ""),
      payment_id: String(paymentRow.payment_id),
      amount_paise: Number(paymentRow.amount_paise) || 0,
      email: String(paymentRow.email || email),
      full_name: String(paymentRow.full_name || studentRow.full_name || "Student"),
      college_name: (paymentRow.college_name as string) ?? null,
      cybercafe_shop_name: (paymentRow.cybercafe_shop_name as string) ?? null,
      cybercafe_email: (paymentRow.cybercafe_email as string) ?? null,
      status: String(paymentRow.status || "success"),
    });
  }

  let lastError: { code?: string; message?: string } | null = null;
  let rowForRpc = { ...studentRow };

  for (let attempt = 0; attempt < RPC_RETRY_ATTEMPTS; attempt++) {
    const { error: rpcError } = await callCompleteStudentRegistrationRpc(
      client,
      rowForRpc,
      profileRow
    );

    if (!rpcError) {
      lastError = null;
      break;
    }

    lastError = rpcError;
    const msg = String(rpcError.message || "");

    if (rpcError.code === "PGRST202" || msg.toLowerCase().includes("could not find")) {
      throw new Error(
        "Registration database function missing. Run supabase/hotfix_complete_student_registration_safe_reg_id.sql in Supabase SQL Editor."
      );
    }

    if (/registration window expired/i.test(msg)) {
      throw new Error(
        "Could not save student directory row (registration window). For Lead Hub transfers, run supabase/hotfix_lead_transfer_student_directory.sql in Supabase, then retry."
      );
    }

    if (attempt < RPC_RETRY_ATTEMPTS - 1 && isRegistrationIdConflict(rpcError)) {
      rowForRpc = studentRowWithoutRegistrationId(rowForRpc);
      try {
        rowForRpc.registration_id = await allocateNextRegistrationId(client);
      } catch {
        delete rowForRpc.registration_id;
      }
      await delay(RPC_RETRY_DELAY_MS);
      continue;
    }

    if (attempt === RPC_RETRY_ATTEMPTS - 1 && isRegistrationIdConflict(rpcError)) {
      rowForRpc = studentRowWithoutRegistrationId(rowForRpc);
      const { error: noRegErr } = await callCompleteStudentRegistrationRpc(
        client,
        rowForRpc,
        profileRow
      );
      if (!noRegErr) {
        lastError = null;
        break;
      }
      lastError = noRegErr;
    }

    if (lastError) {
      const saved = await tryFallbackOwnProfileSave(client, userId, rowForRpc);
      if (saved) {
        lastError = null;
        break;
      }
      throw new Error(
        String(lastError.message || "Could not save student directory details.")
      );
    }
  }

  if (lastError) {
    throw new Error(String(lastError.message || "Could not save student directory details."));
  }

  if (!userId) {
    throw new Error("Registration saved without a user id.");
  }

  let saved = await fetchStudentRow(client, userId, email);
  if (!studentRowHasAcademicData(saved)) {
    await delay(500);
    saved = await fetchStudentRow(client, userId, email);
  }
  if (!studentRowHasAcademicData(saved)) {
    await tryFallbackOwnProfileSave(client, userId, rowForRpc);
    await delay(300);
    saved = await fetchStudentRow(client, userId, email);
  }

  if (!studentRowHasAcademicData(saved)) {
    throw new Error(
      "Your payment was received but profile details could not be saved. Please contact support with your email — do not register again with the same email."
    );
  }

  await syncStudentAcademicInfo(client, userId, saved as Record<string, unknown>);

  const plainPw = String(
    (studentRow.metadata as Record<string, unknown> | undefined)?.password ||
      studentRow.password ||
      signInPassword ||
      ""
  ).trim();
  if (plainPw.length >= 5) {
    try {
      await applyStudentRegistrationPassword(client, userId, email, plainPw);
    } catch (pwErr) {
      console.warn("[registration] apply_student_registration_password:", pwErr);
    }
  }
}

/** When complete_student_registration 409s, persist academics via student_update_own_profile. */
async function tryFallbackOwnProfileSave(
  client: SupabaseClient,
  userId: string,
  studentRow: Record<string, unknown>
): Promise<boolean> {
  if (!userId) return false;

  const { data: sessionWrap } = await client.auth.getSession();
  if (!sessionWrap.session?.access_token) return false;

  const meta =
    typeof studentRow.metadata === "object" && studentRow.metadata !== null
      ? (studentRow.metadata as Record<string, unknown>)
      : {};
  const patch = syncStudentProfileMetadata(
    {
      id: userId,
      email: studentRow.email,
      full_name: studentRow.full_name,
      gender: studentRow.gender,
      parent_name: studentRow.parent_name,
      contact_number: studentRow.contact_number,
      university_name: studentRow.university_name,
      college_name: studentRow.college_name,
      degree: studentRow.degree,
      department: studentRow.department,
      academic_session: studentRow.academic_session,
      class_semester: studentRow.class_semester,
      roll_number: studentRow.roll_number,
      course: studentRow.course,
      internship_domain: studentRow.internship_domain,
      emergency_name: studentRow.emergency_name,
      emergency_contact: studentRow.emergency_contact,
      emergency_relation: studentRow.emergency_relation,
      status: studentRow.status || "Active",
      metadata: meta,
    },
    meta
  );

  const { error } = await client.rpc("student_update_own_profile", { p_row: patch });
  if (error) {
    console.warn("[registration] student_update_own_profile fallback:", error.message);
    return false;
  }
  return true;
}
