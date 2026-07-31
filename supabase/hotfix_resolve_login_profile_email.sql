-- Login with profile email + repair auth/student email mismatches.
-- Run in Supabase SQL Editor after hotfix_student_profile_email_sync.sql.

CREATE OR REPLACE FUNCTION public._apply_auth_login_email_internal(p_user_id uuid, p_new_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, auth
AS $$
DECLARE
  v_new text := lower(trim(COALESCE(p_new_email, '')));
  v_old text;
BEGIN
  IF p_user_id IS NULL OR v_new = '' OR position('@' in v_new) = 0 THEN
    RETURN;
  END IF;

  SELECT lower(trim(u.email))
  INTO v_old
  FROM auth.users u
  WHERE u.id = p_user_id;

  IF v_old IS NULL THEN
    RETURN;
  END IF;

  IF v_old = v_new THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE lower(trim(u.email)) = v_new
      AND u.id <> p_user_id
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.students s
    WHERE lower(trim(s.email)) = v_new
      AND s.id <> p_user_id
  ) THEN
    RETURN;
  END IF;

  UPDATE auth.users
  SET
    email = v_new,
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    email_change = '',
    email_change_token_new = '',
    updated_at = now()
  WHERE id = p_user_id;

  UPDATE auth.identities
  SET
    identity_data = COALESCE(identity_data, '{}'::jsonb)
      || jsonb_build_object('email', v_new, 'email_verified', true),
    updated_at = now()
  WHERE user_id = p_user_id
    AND provider = 'email';

  PERFORM public.ensure_auth_email_identity(p_user_id, v_new);

  UPDATE public.profiles
  SET email = v_new, updated_at = now()
  WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_login_email(p_identifier text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_raw text := trim(COALESCE(p_identifier, ''));
  v_email text;
  v_digits text;
  v_tail text;
  v_emails text[];
  v_auth_email text;
BEGIN
  IF v_raw = '' THEN
    RETURN NULL;
  END IF;

  -- Email: map profile/directory email to the auth login email when they differ.
  IF position('@' in v_raw) > 0 THEN
    v_email := lower(v_raw);

    SELECT lower(trim(u.email))
    INTO v_auth_email
    FROM auth.users u
    WHERE lower(trim(u.email)) = v_email
    LIMIT 1;

    IF v_auth_email IS NOT NULL THEN
      RETURN v_auth_email;
    END IF;

    SELECT lower(trim(u.email))
    INTO v_auth_email
    FROM public.students s
    JOIN auth.users u ON u.id = s.id
    WHERE lower(trim(s.email)) = v_email
    LIMIT 1;

    IF v_auth_email IS NOT NULL THEN
      RETURN v_auth_email;
    END IF;

    SELECT lower(trim(u.email))
    INTO v_auth_email
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE lower(trim(p.email)) = v_email
    LIMIT 1;

    IF v_auth_email IS NOT NULL THEN
      RETURN v_auth_email;
    END IF;

    SELECT lower(trim(u.email))
    INTO v_auth_email
    FROM public.students s
    JOIN auth.users u ON u.id = s.id
    WHERE lower(trim(COALESCE(s.metadata->>'email', ''))) = v_email
    LIMIT 1;

    IF v_auth_email IS NOT NULL THEN
      RETURN v_auth_email;
    END IF;

    RETURN v_email;
  END IF;

  -- Registration ID, roll number, or metadata roll (before phone)
  SELECT array_agg(DISTINCT e ORDER BY e)
  INTO v_emails
  FROM (
    SELECT lower(trim(s.email)) AS e
    FROM public.students s
    WHERE s.email IS NOT NULL
      AND trim(s.email) <> ''
      AND (
        lower(trim(s.registration_id)) = lower(v_raw)
        OR trim(s.roll_number) = v_raw
        OR trim(COALESCE(s.metadata->>'rollNo', '')) = v_raw
        OR trim(COALESCE(s.metadata->>'roll_number', '')) = v_raw
        OR trim(COALESCE(s.metadata->>'registration_id', '')) = v_raw
      )
  ) reg_matches;

  IF v_emails IS NOT NULL AND array_length(v_emails, 1) = 1 THEN
    SELECT lower(trim(u.email))
    INTO v_auth_email
    FROM public.students s
    JOIN auth.users u ON u.id = s.id
    WHERE lower(trim(s.email)) = v_emails[1]
    LIMIT 1;
    RETURN COALESCE(v_auth_email, v_emails[1]);
  END IF;

  IF v_emails IS NOT NULL AND array_length(v_emails, 1) > 1 THEN
    RAISE EXCEPTION 'Multiple accounts match this registration or roll number. Contact support.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Phone
  v_digits := regexp_replace(v_raw, '\D', '', 'g');
  IF length(v_digits) = 10
     OR (length(v_digits) = 11 AND left(v_digits, 1) = '0')
     OR (length(v_digits) = 12 AND left(v_digits, 2) = '91') THEN
    v_tail := public.normalize_phone_tail(v_raw);
    IF v_tail IS NOT NULL THEN
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
      ) phone_matches;

      IF v_emails IS NULL OR array_length(v_emails, 1) IS NULL THEN
        RETURN NULL;
      END IF;

      IF array_length(v_emails, 1) > 1 THEN
        RAISE EXCEPTION 'Multiple accounts are linked to this phone number. Please sign in with your email address instead.'
          USING ERRCODE = 'P0001';
      END IF;

      SELECT lower(trim(u.email))
      INTO v_auth_email
      FROM public.students s
      JOIN auth.users u ON u.id = s.id
      WHERE lower(trim(s.email)) = v_emails[1]
      LIMIT 1;

      RETURN COALESCE(v_auth_email, v_emails[1]);
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.repair_student_auth_login(
  p_email text,
  p_plain text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, auth
AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_plain text := trim(p_plain);
  v_uid uuid;
  v_meta_pw text;
BEGIN
  IF v_email = '' OR v_plain = '' OR length(v_plain) < 5 THEN
    RETURN FALSE;
  END IF;

  SELECT u.id INTO v_uid
  FROM auth.users u
  WHERE lower(trim(u.email)) = v_email
  LIMIT 1;

  IF v_uid IS NULL THEN
    SELECT s.id INTO v_uid
    FROM public.students s
    WHERE lower(trim(s.email)) = v_email
    LIMIT 1;
  END IF;

  IF v_uid IS NULL THEN
    SELECT p.id INTO v_uid
    FROM public.profiles p
    WHERE lower(trim(p.email)) = v_email
    LIMIT 1;
  END IF;

  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT NULLIF(trim(s.metadata->>'password'), '') INTO v_meta_pw
  FROM public.students s
  WHERE (
      lower(trim(s.email)) = v_email
      OR s.id = v_uid
    )
    AND NULLIF(trim(s.metadata->>'password'), '') = v_plain
  ORDER BY (s.id = v_uid) DESC, s.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_meta_pw IS NULL THEN
    SELECT NULLIF(trim(po.metadata->>'password'), '') INTO v_meta_pw
    FROM public.payment_orders po
    WHERE (
        lower(trim(COALESCE(po.user_email, po.metadata->>'email', ''))) = v_email
        OR lower(trim(COALESCE(po.user_email, po.metadata->>'email', ''))) IN (
          SELECT lower(trim(s.email))
          FROM public.students s
          WHERE s.id = v_uid
        )
      )
      AND po.status = 'success'
      AND NULLIF(trim(po.metadata->>'password'), '') = v_plain
    ORDER BY po.updated_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_meta_pw IS NULL OR v_meta_pw <> v_plain THEN
    RETURN FALSE;
  END IF;

  PERFORM public._set_auth_user_password_internal(
    v_uid,
    COALESCE(
      (SELECT lower(trim(u.email)) FROM auth.users u WHERE u.id = v_uid),
      v_email
    ),
    v_plain
  );
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

-- One-time repair: align auth login email with students.profile email when safe.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT s.id, lower(trim(s.email)) AS profile_email
    FROM public.students s
    JOIN auth.users u ON u.id = s.id
    WHERE position('@' in s.email) > 0
      AND lower(trim(s.email)) <> lower(trim(u.email))
      AND NOT EXISTS (
        SELECT 1
        FROM auth.users u2
        WHERE lower(trim(u2.email)) = lower(trim(s.email))
          AND u2.id <> s.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.students s2
        WHERE lower(trim(s2.email)) = lower(trim(s.email))
          AND s2.id <> s.id
      )
  LOOP
    PERFORM public._apply_auth_login_email_internal(r.id, r.profile_email);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repair_student_auth_login(text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
