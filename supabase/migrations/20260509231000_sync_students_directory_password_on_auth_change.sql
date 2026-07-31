-- Mirror login password into public.students (directory copy) whenever auth password changes,
-- so Admin "Resend credentials" matches what actually works in Supabase Auth.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.admin_reset_user_password(target_user_id UUID, new_pass TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, auth
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin'::public.app_role, 'admin'::public.app_role, 'staff'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE auth.users
  SET
    encrypted_password = extensions.crypt(new_pass::text, extensions.gen_salt('bf'::text)),
    updated_at = now()
  WHERE id = target_user_id;

  UPDATE public.students
  SET
    password = new_pass,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('password', new_pass::text)
  WHERE id = target_user_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_user_password(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(UUID, TEXT) TO authenticated;

-- Forgot-password OTP flow (same directory sync).
CREATE OR REPLACE FUNCTION public.reset_user_password(p_email TEXT, p_otp TEXT, p_new_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_otp_valid BOOLEAN;
BEGIN
  SELECT TRUE INTO v_otp_valid
  FROM public.password_resets
  WHERE lower(email) = lower(p_email)
    AND otp = p_otp
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_otp_valid IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(p_email);

  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE auth.users
  SET
    encrypted_password = extensions.crypt(p_new_password::text, extensions.gen_salt('bf'::text)),
    updated_at = now()
  WHERE id = v_user_id;

  UPDATE public.students
  SET
    password = p_new_password,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('password', p_new_password::text)
  WHERE id = v_user_id;

  DELETE FROM public.password_resets WHERE lower(email) = lower(p_email);

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_user_password(TEXT, TEXT, TEXT) TO anon, authenticated;
