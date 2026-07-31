-- Public registration: one email and one mobile number per student account.
-- Callable with anon key before payment / signup.

CREATE OR REPLACE FUNCTION public.check_student_registration_available(
  p_email text,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_tail text := public.normalize_phone_tail(p_phone);
  v_email_taken boolean := false;
  v_phone_taken boolean := false;
BEGIN
  IF v_email = '' THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'invalid',
      'message', 'Enter a valid email address.'
    );
  END IF;

  IF v_tail IS NULL THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'invalid',
      'message', 'Enter a valid 10-digit mobile number.'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.students s
    WHERE lower(trim(s.email)) = v_email
  ) THEN
    v_email_taken := true;
  ELSIF EXISTS (
    SELECT 1 FROM auth.users u
    WHERE lower(trim(u.email)) = v_email
  ) THEN
    v_email_taken := true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.students s
    WHERE public.normalize_phone_tail(s.contact_number) = v_tail
  ) THEN
    v_phone_taken := true;
  ELSIF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE public.normalize_phone_tail(p.contact_number) = v_tail
      AND p.email IS NOT NULL
      AND lower(trim(p.email)) <> v_email
  ) THEN
    v_phone_taken := true;
  ELSIF EXISTS (
    SELECT 1 FROM public.referral_partners rp
    WHERE public.normalize_phone_tail(rp.contact_number) = v_tail
      AND rp.email IS NOT NULL
      AND lower(trim(rp.email)) <> v_email
  ) THEN
    v_phone_taken := true;
  END IF;

  IF v_email_taken AND v_phone_taken THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'both',
      'email_taken', true,
      'phone_taken', true,
      'message',
        'This email and mobile number are already registered. Use the sign-in page if you already have an account, or use a different email and phone for a new registration.'
    );
  END IF;

  IF v_email_taken THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'email',
      'email_taken', true,
      'phone_taken', false,
      'message',
        'This email is already registered. Sign in with this email or use a different email address to create a new account.'
    );
  END IF;

  IF v_phone_taken THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'phone',
      'email_taken', false,
      'phone_taken', true,
      'message',
        'This mobile number is already linked to another account. Sign in with the email for that number, or use a different mobile number.'
    );
  END IF;

  RETURN jsonb_build_object(
    'available', true,
    'email_taken', false,
    'phone_taken', false,
    'message', ''
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_student_registration_available(text, text) TO anon, authenticated, service_role;
