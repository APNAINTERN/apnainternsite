-- Run if verify query shows only 2 of 4 functions (missing resolve_login_email / verify_password_reset_otp).

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

GRANT EXECUTE ON FUNCTION public.verify_password_reset_otp(text, text) TO anon, authenticated;

-- Recreate dependent function so it calls resolve_login_email (safe if already exists)
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

GRANT EXECUTE ON FUNCTION public.auth_email_registered_for_reset(text) TO anon, authenticated;
