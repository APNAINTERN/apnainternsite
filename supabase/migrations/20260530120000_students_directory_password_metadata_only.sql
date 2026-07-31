-- students.password column removed for security; directory credential copy lives in metadata.password only.
-- Also refreshes forgot-password RPCs (OTP reset) and admin password reset helpers.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.students DROP COLUMN IF EXISTS password;

CREATE OR REPLACE FUNCTION public.sync_student_directory_password(p_plain TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plain TEXT := trim(p_plain);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_plain IS NULL OR length(v_plain) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;

  UPDATE public.students
  SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('password', v_plain)
  WHERE id = auth.uid();
END;
$$;

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
  SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('password', new_pass::text)
  WHERE id = target_user_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_user_password(p_identifier text, p_otp text, p_new_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_email text;
  v_otp text := trim(p_otp);
  v_pass text := trim(p_new_password);
BEGIN
  v_email := public.resolve_login_email(p_identifier);
  IF v_email IS NULL OR v_otp = '' OR v_pass IS NULL OR length(v_pass) < 6 THEN
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
    encrypted_password = extensions.crypt(v_pass::text, extensions.gen_salt('bf'::text)),
    updated_at = now()
  WHERE id = v_user_id;

  UPDATE public.students
  SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('password', v_pass)
  WHERE id = v_user_id;

  DELETE FROM public.password_resets WHERE lower(trim(email)) = v_email;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_student_directory_password(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_student_directory_password(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_reset_user_password(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_user_password(text, text, text) TO anon, authenticated;

-- Ensure verify OTP RPC exists (used by Login forgot-password step 2).
CREATE OR REPLACE FUNCTION public.verify_password_reset_otp(p_identifier text, p_otp text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text;
BEGIN
  v_email := public.resolve_login_email(p_identifier);
  IF v_email IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.password_resets
    WHERE lower(trim(email)) = v_email
      AND trim(otp) = trim(p_otp)
      AND expires_at > now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_password_reset_otp(text, text) TO anon, authenticated;
