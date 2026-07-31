import type { ServerDbLike } from './rdsAdapter';

export type RegistrationAvailabilityResult = {
  available: boolean;
  emailTaken: boolean;
  phoneTaken: boolean;
  message: string;
};

function parseRpcRow(data: unknown): RegistrationAvailabilityResult {
  const row = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return {
    available: row.available === true,
    emailTaken: row.email_taken === true,
    phoneTaken: row.phone_taken === true,
    message: String(row.message || '').trim(),
  };
}

export async function assertStudentRegistrationAvailableServer(
  supabase: ServerDbLike,
  email: string,
  phone: string
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const digits = phone.replace(/\D/g, '');
  const phoneForRpc = digits.length >= 10 ? digits.slice(-10) : phone.trim();

  const { data, error } = await supabase.rpc('check_student_registration_available', {
    p_email: normalizedEmail,
    p_phone: phoneForRpc,
  });

  if (error) {
    throw new Error(error.message || 'Registration validation failed.');
  }

  const result = parseRpcRow(data);
  if (!result.available) {
    throw new Error(
      result.message || 'This email or mobile number is already registered.'
    );
  }
}
