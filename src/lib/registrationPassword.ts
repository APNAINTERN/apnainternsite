import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAuthSignUpOptions } from "@/lib/authRoutes";
import { signInStudentWithPassword } from "@/lib/studentAuthLogin";

/** Minimum length for student-chosen registration passwords (e.g. 12345). */
export const REGISTRATION_PASSWORD_MIN_LENGTH = 5;

const GENERIC_REGISTRATION_ERROR =
  "Registration could not be completed. Please try again or contact support.";

const PAYMENT_CAPTURED_SETUP_ERROR =
  "Your payment was received. Account setup did not finish — contact support with your email and we will complete your registration.";

export function validateRegistrationPassword(
  password: string,
  confirmPw: string
): string | null {
  const p = password.trim();
  if (p.length < REGISTRATION_PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${REGISTRATION_PASSWORD_MIN_LENGTH} characters`;
  }
  if (password !== confirmPw) return "Passwords do not match";
  return null;
}

/** Strong random password for Auth signUp only; replaced immediately with the student's choice via RPC. */
export function generateRegistrationSignUpPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `EzyReg_${hex}!9ZzAa1`;
}

function isAlreadyRegisteredAuthError(err: { message?: string; code?: string }): boolean {
  const low = String(err.message || "").toLowerCase();
  return (
    low.includes("already registered") ||
    low.includes("already exists") ||
    err.code === "user_already_exists"
  );
}

export function isWeakPasswordAuthError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message || "").toLowerCase();
  const code = String((err as { code?: string })?.code || "").toLowerCase();
  return (
    code === "weak_password" ||
    msg.includes("weak") ||
    msg.includes("easy to guess") ||
    msg.includes("known to be weak") ||
    msg.includes("leaked") ||
    msg.includes("not strong enough") ||
    msg.includes("password strength") ||
    msg.includes("too common") ||
    msg.includes("pwned") ||
    msg.includes("compromised")
  );
}

function isPasswordPolicyMessage(msg: string): boolean {
  const low = msg.toLowerCase();
  // Our RPC validation — show the real message, not the generic registration error.
  if (low.includes("at least 5 characters") || low.includes("at least 8 characters")) {
    return false;
  }
  if (low.includes("registration password setup is missing")) {
    return false;
  }
  return (
    isWeakPasswordAuthError({ message: msg }) ||
    (low.includes("password") &&
      (low.includes("strength") ||
        low.includes("easy to guess") ||
        low.includes("known to be weak") ||
        low.includes("leaked") ||
        low.includes("too common") ||
        low.includes("pwned") ||
        low.includes("compromised") ||
        low.includes("policy")))
  );
}

/** Never surface Supabase "weak password" / strength API messages to users. */
export function userFacingPasswordError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err || "");
  if (
    isWeakPasswordAuthError(err) ||
    isPasswordPolicyMessage(msg) ||
    /registration window expired/i.test(msg)
  ) {
    return `Password must be at least ${REGISTRATION_PASSWORD_MIN_LENGTH} characters.`;
  }
  if (/at least \d+ character/i.test(msg)) return msg;
  if (/do not match/i.test(msg)) return msg;
  if (/not signed in/i.test(msg)) return msg;
  return msg.trim() || "Could not update password. Please try again.";
}

export function registrationFailureMessage(
  err: unknown,
  opts?: { paymentCaptured?: boolean }
): string {
  if (opts?.paymentCaptured) {
    return PAYMENT_CAPTURED_SETUP_ERROR;
  }
  if (isWeakPasswordAuthError(err) || (err instanceof Error && isPasswordPolicyMessage(err.message))) {
    return GENERIC_REGISTRATION_ERROR;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return GENERIC_REGISTRATION_ERROR;
}

/** Set login password via RPC (bypasses Supabase Auth weak-password checks). */
export async function setLoginPasswordViaRpc(
  client: SupabaseClient,
  plainPassword: string
): Promise<void> {
  const p = plainPassword.trim();
  if (p.length < REGISTRATION_PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${REGISTRATION_PASSWORD_MIN_LENGTH} characters`);
  }

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user?.id || !user.email) {
    throw new Error("Not signed in");
  }

  await applyStudentRegistrationPassword(client, user.id, user.email, p);
}

/** Staff/admin lead transfer must apply passwords on the logged-in portal client (not ephemeral auth). */
export async function pickDirectoryPasswordApplyClient(
  authClient: SupabaseClient,
  directoryClient: SupabaseClient
): Promise<SupabaseClient> {
  const { data: canManage, error } = await directoryClient.rpc(
    "caller_can_manage_student_directory"
  );
  if (!error && canManage === true) {
    return directoryClient;
  }
  return authClient;
}

async function findAuthUserIdByEmail(
  client: SupabaseClient,
  email: string
): Promise<string | undefined> {
  const normalizedEmail = email.trim().toLowerCase();

  const { data: prof } = await client
    .from("profiles")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (prof?.id) return prof.id;

  const { data: rpcId, error: rpcErr } = await client.rpc("get_user_id_by_email", {
    email_text: normalizedEmail,
  });
  if (!rpcErr && rpcId) return String(rpcId);

  return undefined;
}

export async function applyStudentRegistrationPassword(
  client: SupabaseClient,
  userId: string,
  email: string,
  plainPassword: string
): Promise<void> {
  const { error } = await client.rpc("apply_student_registration_password", {
    p_user_id: userId,
    p_email: email.trim().toLowerCase(),
    p_plain: plainPassword.trim(),
  });

  if (error) {
    const msg = String(error.message || "");
    if (error.code === "PGRST202" || msg.toLowerCase().includes("could not find")) {
      throw new Error(
        "Registration password setup is missing. Run supabase/migrations/20260531120000_registration_simple_password.sql in Supabase SQL."
      );
    }
    if (/registration window expired/i.test(msg)) {
      throw new Error(
        "Could not update this student's password for directory transfer. Run supabase/hotfix_lead_transfer_student_directory.sql in Supabase, then retry."
      );
    }
    throw new Error(userFacingPasswordError(error));
  }
}

export async function signUpStudentWithChosenPassword(
  authClient: SupabaseClient,
  directoryClient: SupabaseClient,
  opts: {
    email: string;
    password: string;
    fullName: string;
    /** Extra fields on auth user metadata (e.g. role: "cybercafe"). */
    userMetadata?: Record<string, unknown>;
  }
): Promise<{ userId: string }> {
  const normalizedEmail = opts.email.trim().toLowerCase();
  const plainPassword = opts.password.trim();

  const signUpMeta = {
    full_name: opts.fullName,
    ...(opts.userMetadata || {}),
  };

  const passwordClient = await pickDirectoryPasswordApplyClient(authClient, directoryClient);

  let { data, error: authError } = await authClient.auth.signUp({
    email: normalizedEmail,
    password: generateRegistrationSignUpPassword(),
    options: buildAuthSignUpOptions(signUpMeta),
  });

  if (authError && isWeakPasswordAuthError(authError)) {
    const retry = await authClient.auth.signUp({
      email: normalizedEmail,
      password: generateRegistrationSignUpPassword(),
      options: buildAuthSignUpOptions(signUpMeta),
    });
    data = retry.data;
    authError = retry.error;
  }

  if (authError) {
    if (isAlreadyRegisteredAuthError(authError)) {
      const existingId = await findAuthUserIdByEmail(directoryClient, normalizedEmail);
      if (!existingId) {
        throw new Error(
          "This email is already registered but the account could not be linked. Contact support."
        );
      }
      await applyStudentRegistrationPassword(
        passwordClient,
        existingId,
        normalizedEmail,
        plainPassword
      );
      return { userId: existingId };
    }
    if (isWeakPasswordAuthError(authError) || isPasswordPolicyMessage(authError.message || "")) {
      throw new Error(GENERIC_REGISTRATION_ERROR);
    }
    throw authError;
  }

  const userId = data.user?.id;
  if (!userId) {
    throw new Error(
      "Signup did not return a user id. In Supabase Auth, turn off email confirmation for signups or confirm the account, then retry."
    );
  }

  // Supabase may return success with no identities when the email already exists (anti-enumeration).
  const identities = data.user?.identities;
  if (Array.isArray(identities) && identities.length === 0) {
    const existingId = await findAuthUserIdByEmail(directoryClient, normalizedEmail);
    if (!existingId) {
      throw new Error(
        "This email is already registered but the account could not be linked. Contact support."
      );
    }
    await applyStudentRegistrationPassword(
      passwordClient,
      existingId,
      normalizedEmail,
      plainPassword
    );
    return { userId: existingId };
  }

  await applyStudentRegistrationPassword(
    passwordClient,
    userId,
    normalizedEmail,
    plainPassword
  );

  if (!data.session?.access_token) {
    const signIn = await signInStudentWithPassword(authClient, normalizedEmail, plainPassword);
    if (!signIn.ok) {
      throw signIn.error;
    }
  }

  return { userId };
}
