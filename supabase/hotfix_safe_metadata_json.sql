-- Safe JSON parse for RDS students.metadata (often CSV-mangled / double-encoded text).
-- Fixes referral portal create: invalid input syntax for type json

CREATE OR REPLACE FUNCTION public.safe_text_to_jsonb(p_raw text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text;
  j jsonb;
BEGIN
  IF p_raw IS NULL OR btrim(p_raw) = '' OR lower(btrim(p_raw)) IN ('null', 'undefined') THEN
    RETURN '{}'::jsonb;
  END IF;

  BEGIN
    RETURN p_raw::jsonb;
  EXCEPTION WHEN others THEN
    NULL;
  END;

  -- One layer of CSV quote-doubling repair: "" → "
  v := replace(btrim(p_raw), '""', '"');
  BEGIN
    j := v::jsonb;
    IF jsonb_typeof(j) = 'string' THEN
      BEGIN
        RETURN (j #>> '{}')::jsonb;
      EXCEPTION WHEN others THEN
        RETURN '{}'::jsonb;
      END;
    END IF;
    RETURN j;
  EXCEPTION WHEN others THEN
    RETURN '{}'::jsonb;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.safe_text_to_jsonb(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.safe_text_to_jsonb(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_reset_user_password(target_user_id UUID, new_pass TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, auth
AS $$
DECLARE
  v_meta jsonb;
  v_raw text;
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

  -- Best-effort directory password copy. Never fail (or wipe) on mangled metadata.
  BEGIN
    SELECT metadata::text INTO v_raw
    FROM public.students
    WHERE id::text = target_user_id::text
    LIMIT 1;

    IF FOUND THEN
      v_meta := public.safe_text_to_jsonb(v_raw);
      -- If metadata is non-empty garbage we cannot parse, leave it untouched.
      IF v_meta = '{}'::jsonb
         AND v_raw IS NOT NULL
         AND btrim(v_raw) <> ''
         AND btrim(v_raw) <> '{}'
         AND left(btrim(v_raw), 1) NOT IN ('{', '[') THEN
        NULL;
      ELSE
        UPDATE public.students
        SET metadata = (v_meta || jsonb_build_object('password', new_pass::text))
        WHERE id::text = target_user_id::text;
      END IF;
    END IF;
  EXCEPTION WHEN others THEN
    NULL;
  END;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_user_password(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(UUID, TEXT) TO authenticated;

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
  SET metadata = (
    public.safe_text_to_jsonb(metadata::text)
    || jsonb_build_object('password', v_plain)
  )
  WHERE id::text = auth.uid()::text;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_student_directory_password(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_student_directory_password(TEXT) TO authenticated;

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

  BEGIN
    UPDATE public.students
    SET metadata = (
      public.safe_text_to_jsonb(metadata::text)
      || jsonb_build_object('password', v_pass)
    )
    WHERE id::text = v_user_id::text;
  EXCEPTION WHEN others THEN
    NULL;
  END;

  DELETE FROM public.password_resets WHERE lower(trim(email)) = v_email;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_user_password(text, text, text) TO anon, authenticated;
