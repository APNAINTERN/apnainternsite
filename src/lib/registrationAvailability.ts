import type { SupabaseClient } from '@supabase/supabase-js';

export type RegistrationAvailabilityResult = {
  available: boolean;
  emailTaken: boolean;
  phoneTaken: boolean;
  message: string;
  reason?: string;
};

function parseRpcRow(data: unknown): RegistrationAvailabilityResult {
  const row = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return {
    available: row.available === true,
    emailTaken: row.email_taken === true,
    phoneTaken: row.phone_taken === true,
    message: String(row.message || '').trim(),
    reason: row.reason ? String(row.reason) : undefined,
  };
}

const MIGRATION_HINT =
  'Run supabase/migrations/20260525120000_registration_unique_email_phone.sql in Supabase SQL Editor.';

/** Server-side check (service role) before creating a payment order or enrolling. */
export async function assertStudentRegistrationAvailableServer(
  supabase: SupabaseClient,
  email: string,
  phone: string
): Promise<void> {
  const result = await checkStudentRegistrationAvailable(supabase, email, phone);
  if (!result.available) {
    throw new Error(result.message || 'This email or mobile number is already registered.');
  }
}

/** Client or server: returns whether email + phone can be used for a new student registration. */
export async function checkStudentRegistrationAvailable(
  supabase: SupabaseClient,
  email: string,
  phone: string
): Promise<RegistrationAvailabilityResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const digits = phone.replace(/\D/g, '');
  const phoneForRpc = digits.length >= 10 ? digits.slice(-10) : phone.trim();

  const { data, error } = await supabase.rpc('check_student_registration_available', {
    p_email: normalizedEmail,
    p_phone: phoneForRpc,
  });

  if (error) {
    const msg = error.message || '';
    if (/check_student_registration_available|does not exist|42883|PGRST202/i.test(msg)) {
      return {
        available: false,
        emailTaken: false,
        phoneTaken: false,
        message: `Registration validation is not set up on the database yet. ${MIGRATION_HINT}`,
        reason: 'migration',
      };
    }
    return {
      available: false,
      emailTaken: false,
      phoneTaken: false,
      message: msg || 'Could not verify email and mobile number.',
      reason: 'error',
    };
  }

  return parseRpcRow(data);
}

export function registrationFieldErrors(
  result: RegistrationAvailabilityResult
): { email?: string; phone?: string } {
  if (result.available) return {};
  const out: { email?: string; phone?: string } = {};
  if (result.emailTaken) {
    out.email = 'This email is already registered. Sign in or use a different email.';
  }
  if (result.phoneTaken) {
    out.phone = 'This mobile number is already registered. Sign in or use a different number.';
  }
  if (!out.email && !out.phone && result.message) {
    out.email = result.message;
  }
  return out;
}
