-- Phone-or-email login: resolve 10-digit numbers to auth email (students, profiles, referral partners).
-- Must DROP old functions first: parameter renamed p_email → p_identifier (Postgres 42P13 otherwise).

DROP FUNCTION IF EXISTS public.auth_email_registered_for_reset(text);
DROP FUNCTION IF EXISTS public.verify_password_reset_otp(text, text);
DROP FUNCTION IF EXISTS public.reset_user_password(text, text, text);

CREATE OR REPLACE FUNCTION public.normalize_phone_tail(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN length(d) >= 10 THEN right(d, 10)
    ELSE NULL
  END
  FROM (
    SELECT regexp_replace(COALESCE(p_raw, ''), '\D', '', 'g') AS d
  ) x;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_phone_tail(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.resolve_login_email(p_identifier text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_raw text := trim(COALESCE(p_identifier, ''));
  v_tail text;
  v_emails text[];
BEGIN
  IF v_raw = '' THEN
    RETURN NULL;
  END IF;

  IF position('@' in v_raw) > 0 THEN
    RETURN lower(v_raw);
  END IF;

  v_tail := public.normalize_phone_tail(v_raw);
  IF v_tail IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT array_agg(DISTINCT e ORDER BY e)
  INTO v_emails
  FROM (
    SELECT lower(trim(s.email)) AS e
    FROM public.students s
    WHERE s.email IS NOT NULL
      AND trim(s.email) <> ''
      AND public.normalize_phone_tail(s.contact_number) = v_tail
    UNION
    SELECT lower(trim(p.email)) AS e
    FROM public.profiles p
    WHERE p.email IS NOT NULL
      AND trim(p.email) <> ''
      AND public.normalize_phone_tail(p.contact_number) = v_tail
    UNION
    SELECT lower(trim(rp.email)) AS e
    FROM public.referral_partners rp
    WHERE rp.email IS NOT NULL
      AND trim(rp.email) <> ''
      AND public.normalize_phone_tail(rp.contact_number) = v_tail
  ) matches;

  IF v_emails IS NULL OR array_length(v_emails, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  IF array_length(v_emails, 1) > 1 THEN
    RAISE EXCEPTION 'Multiple accounts are linked to this phone number. Please sign in with your email address instead.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_emails[1];
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO anon, authenticated;

-- Forgot password: accept email or phone
CREATE OR REPLACE FUNCTION public.auth_email_registered_for_reset(p_identifier text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_email text;
BEGIN
  v_email := public.resolve_login_email(p_identifier);
  IF v_email IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM auth.users WHERE lower(trim(email)) = v_email
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_password_reset_otp(p_identifier text, p_otp text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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
BEGIN
  v_email := public.resolve_login_email(p_identifier);
  IF v_email IS NULL OR v_otp = '' OR p_new_password IS NULL OR length(trim(p_new_password)) < 6 THEN
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

GRANT EXECUTE ON FUNCTION public.auth_email_registered_for_reset(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_password_reset_otp(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_user_password(text, text, text) TO anon, authenticated;
