import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function assertStudentRegistrationAvailableServer(
  supabase: SupabaseClient,
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

  const row = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  if (row.available !== true) {
    throw new Error(
      String(row.message || '').trim() ||
        'This email or mobile number is already registered.'
    );
  }
}
