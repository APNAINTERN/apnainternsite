import type { ServerDbLike } from './rdsAdapter';
import crypto from 'crypto';

export const REGISTRATION_PASSWORD_MIN_LENGTH = 5;

export function generateRegistrationSignUpPassword(): string {
  return `EzyReg_${crypto.randomBytes(24).toString('hex')}!9ZzAa1`;
}

function isWeakPasswordAuthError(err: { message?: string; code?: string }): boolean {
  const msg = String(err.message || '').toLowerCase();
  const code = String(err.code || '').toLowerCase();
  return (
    code === 'weak_password' ||
    msg.includes('weak') ||
    msg.includes('password strength') ||
    msg.includes('easy to guess') ||
    msg.includes('known to be weak') ||
    msg.includes('leaked') ||
    msg.includes('too common')
  );
}

function isAlreadyRegisteredAuthError(err: { message?: string; code?: string }): boolean {
  const low = String(err.message || '').toLowerCase();
  return (
    low.includes('already registered') ||
    low.includes('already exists') ||
    err.code === 'user_already_exists'
  );
}

export async function applyStudentRegistrationPassword(
  supabase: ServerDbLike,
  userId: string,
  email: string,
  plainPassword: string
): Promise<void> {
  const plain = plainPassword.trim();
  if (plain.length < REGISTRATION_PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${REGISTRATION_PASSWORD_MIN_LENGTH} characters`);
  }

  const { error } = await supabase.rpc('apply_student_registration_password', {
    p_user_id: userId,
    p_email: email.trim().toLowerCase(),
    p_plain: plain,
  });

  if (error) {
    const msg = String(error.message || '');
    if (error.code === 'PGRST202' || msg.toLowerCase().includes('could not find')) {
      throw new Error(
        'Registration password setup is missing. Apply apply_student_registration_password on RDS.'
      );
    }
    throw error;
  }
}

/**
 * Admin API: create auth user with a temporary strong password, then set the student's chosen password via RPC.
 */
export async function createStudentAuthWithChosenPassword(
  supabase: ServerDbLike,
  opts: { email: string; password: string; fullName?: string }
): Promise<{ userId: string; created: boolean }> {
  const normalizedEmail = opts.email.trim().toLowerCase();
  const plain = opts.password.trim();
  if (plain.length < REGISTRATION_PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${REGISTRATION_PASSWORD_MIN_LENGTH} characters`);
  }

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password: generateRegistrationSignUpPassword(),
    email_confirm: true,
    user_metadata: { full_name: String(opts.fullName || '') },
  });

  if (authError) {
    if (!isAlreadyRegisteredAuthError(authError)) {
      if (isWeakPasswordAuthError(authError)) {
        throw new Error('Account setup failed after payment. Contact support with your email.');
      }
      throw authError;
    }

    const { data: prof } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    const userId = prof?.id;
    if (!userId) {
      throw new Error('User is registered in Auth but profile was not found.');
    }

    await applyStudentRegistrationPassword(supabase, userId, normalizedEmail, plain);
    return { userId, created: false };
  }

  const userId = authData?.user?.id;
  if (!userId) {
    throw new Error('Could not resolve user id after auth creation');
  }

  await applyStudentRegistrationPassword(supabase, userId, normalizedEmail, plain);
  return { userId, created: true };
}
