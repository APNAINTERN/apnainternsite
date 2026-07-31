import type { SupabaseClient } from '@supabase/supabase-js';

export type ResolveLoginResult =
  | { ok: true; email: string; usedPhone: boolean; usedRegistrationId: boolean }
  | { ok: false; message: string };

/** Indian mobile: 10 digits, 0 + 10, or 91 + 10 */
export function looksLikePhoneNumber(raw: string): boolean {
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return true;
  if (d.length === 11 && d.startsWith('0')) return true;
  if (d.length === 12 && d.startsWith('91')) return true;
  return false;
}

/**
 * Resolve sign-in identifier to a normalized auth email.
 * Accepts email, Indian mobile, Apna Intern registration ID (EZY/…), or college roll number.
 */
export async function resolveLoginIdentifier(
  supabase: SupabaseClient,
  rawInput: string
): Promise<ResolveLoginResult> {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      ok: false,
      message: 'Please enter your email, phone number, or registration / roll number.',
    };
  }

  const usedPhone = !trimmed.includes('@') && looksLikePhoneNumber(trimmed);
  const usedRegistrationId = !trimmed.includes('@') && !usedPhone;

  if (usedPhone) {
    const digitsOnly = trimmed.replace(/\D/g, '');
    const tail =
      digitsOnly.length >= 10 ? digitsOnly.slice(-10) : digitsOnly;
    if (tail.length < 10) {
      return {
        ok: false,
        message: 'Enter a valid 10-digit mobile number, registration number, or email.',
      };
    }
  }

  const { data, error } = await supabase.rpc('resolve_login_email', { p_identifier: trimmed });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('registration') || msg.includes('roll number')) {
      return { ok: false, message: msg };
    }
    if (msg.includes('Multiple accounts') || error.code === 'P0001') {
      return {
        ok: false,
        message: usedPhone
          ? 'Multiple accounts use this phone number. Please sign in with your email address instead.'
          : 'Multiple accounts match this registration number. Contact support.',
      };
    }
    if (msg.includes('could not find') || error.code === 'PGRST202') {
      return {
        ok: false,
        message:
          'Login lookup is not set up on the database yet. Run supabase/hotfix_resolve_login_profile_email.sql in Supabase SQL.',
      };
    }
    return { ok: false, message: msg || 'Could not resolve login identifier.' };
  }

  const email = String(data || '')
    .trim()
    .toLowerCase();
  if (!email) {
    if (usedRegistrationId) {
      return {
        ok: false,
        message: 'No account found with this registration or roll number.',
      };
    }
    return {
      ok: false,
      message: usedPhone
        ? 'No account found with this phone number.'
        : 'No account found with this email address.',
    };
  }

  return { ok: true, email, usedPhone, usedRegistrationId };
}
