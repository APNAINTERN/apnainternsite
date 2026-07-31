-- Forgot password: staff/admin + students (trim OTP, ensure anon can insert OTP rows)
-- Run in Lovable SQL editor if not applied via migration sync.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DROP POLICY IF EXISTS "Service role manages password resets" ON public.password_resets;
DROP POLICY IF EXISTS "Anyone can request password reset" ON public.password_resets;
CREATE POLICY "Anyone can request password reset"
  ON public.password_resets
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public cannot view OTPs" ON public.password_resets;
CREATE POLICY "Public cannot view OTPs"
  ON public.password_resets
  FOR SELECT
  USING (false);

-- Pre-check before sending OTP (any auth user: student, staff, admin)
CREATE OR REPLACE FUNCTION public.auth_email_registered_for_reset(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE lower(trim(email)) = lower(trim(p_email))
  );
$$;

GRANT EXECUTE ON FUNCTION public.auth_email_registered_for_reset(text) TO anon, authenticated;

-- Verify OTP before showing new-password step (browser cannot read password_resets)
CREATE OR REPLACE FUNCTION public.verify_password_reset_otp(p_email text, p_otp text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.password_resets
    WHERE lower(trim(email)) = lower(trim(p_email))
      AND trim(otp) = trim(p_otp)
      AND expires_at > now()
  );
$$;

GRANT EXECUTE ON FUNCTION public.verify_password_reset_otp(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.reset_user_password(p_email text, p_otp text, p_new_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_email text := lower(trim(p_email));
  v_otp text := trim(p_otp);
BEGIN
  IF v_email = '' OR v_otp = '' OR p_new_password IS NULL OR length(trim(p_new_password)) < 6 THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.password_resets
    WHERE lower(trim(email)) = v_email
      AND trim(otp) = v_otp
      AND expires_at > now()
  ) THEN
    RETURN FALSE;
  END IF;

  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(trim(email)) = v_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE auth.users
  SET
    encrypted_password = extensions.crypt(trim(p_new_password)::text, extensions.gen_salt('bf'::text)),
    updated_at = now()
  WHERE id = v_user_id;

  UPDATE public.students
  SET
    password = trim(p_new_password),
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('password', trim(p_new_password)::text)
  WHERE id = v_user_id;

  DELETE FROM public.password_resets WHERE lower(trim(email)) = v_email;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_user_password(text, text, text) TO anon, authenticated;

-- Referral-only guard (no-op if already created in 20260516120000)
CREATE OR REPLACE FUNCTION public.auth_is_referral_partner_scoped_only(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _uid AND ur.role = 'referral_partner'::public.app_role
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur2
    WHERE ur2.user_id = _uid
      AND ur2.role IN (
        'admin'::public.app_role,
        'super_admin'::public.app_role,
        'staff'::public.app_role,
        'college_admin'::public.app_role
      )
  );
$$;

-- Staff RLS: ensure staff can read students (idempotent if already applied)
DROP POLICY IF EXISTS "Admins view all students" ON public.students;
CREATE POLICY "Admins view all students"
  ON public.students
  FOR SELECT
  USING (
    NOT public.auth_is_referral_partner_scoped_only(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN (
          'admin'::public.app_role,
          'super_admin'::public.app_role,
          'staff'::public.app_role
        )
    )
  );
