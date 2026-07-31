-- Bulk set ONE shared password for all students (auth + students.metadata).
-- Run in Supabase SQL Editor: run STEP 1, then STEP 2, then STEP 3 (one step at a time if it times out).
--
-- >>> Edit the password in STEP 2 before running <<<

-- =============================================================================
-- STEP 1 — Auth password helpers (safe to re-run)
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.ensure_auth_email_identity(p_user_id uuid, p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, auth
AS $$
DECLARE
  v_email text := lower(trim(p_email));
BEGIN
  IF p_user_id IS NULL OR v_email = '' THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.identities i
    WHERE i.user_id = p_user_id AND i.provider = 'email'
  ) THEN
    BEGIN
      INSERT INTO auth.identities (
        id, provider_id, user_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      )
      VALUES (
        gen_random_uuid(),
        p_user_id::text,
        p_user_id,
        jsonb_build_object(
          'sub', p_user_id::text,
          'email', v_email,
          'email_verified', true,
          'phone_verified', false
        ),
        'email',
        now(), now(), now()
      );
    EXCEPTION
      WHEN unique_violation THEN
        NULL;
    END;
  END IF;

  UPDATE auth.users
  SET
    raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._set_auth_user_password_internal(
  p_user_id uuid,
  p_email text,
  p_plain text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, auth
AS $$
DECLARE
  v_plain text := trim(p_plain);
  v_email text := lower(trim(p_email));
BEGIN
  IF p_user_id IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'User id and email required';
  END IF;
  IF v_plain IS NULL OR length(v_plain) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;

  UPDATE auth.users
  SET
    encrypted_password = extensions.crypt(v_plain::text, extensions.gen_salt('bf'::text)),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
  WHERE id = p_user_id;

  PERFORM public.ensure_auth_email_identity(p_user_id, v_email);

  UPDATE public.students
  SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('password', v_plain)
  WHERE id = p_user_id
     OR lower(trim(email)) = v_email;
END;
$$;

-- =============================================================================
-- STEP 2 — Fast bulk update (same bcrypt hash for shared password; run alone)
-- Change v_pass before running.
-- =============================================================================
DO $$
DECLARE
  v_pass text := 'EzyIntern@2026';
  v_salt text;
  v_hash text;
  v_auth_by_id int;
  v_auth_by_email int;
  v_students int;
BEGIN
  SET LOCAL statement_timeout = '600s';

  IF v_pass IS NULL OR length(trim(v_pass)) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;

  v_salt := extensions.gen_salt('bf'::text);
  v_hash := extensions.crypt(trim(v_pass)::text, v_salt);

  UPDATE public.students
  SET metadata = COALESCE(metadata, '{}'::jsonb)
    || jsonb_build_object('password', trim(v_pass))
  WHERE coalesce(trim(email), '') <> '';
  GET DIAGNOSTICS v_students = ROW_COUNT;

  UPDATE auth.users u
  SET
    encrypted_password = v_hash,
    email_confirmed_at = COALESCE(u.email_confirmed_at, now()),
    updated_at = now()
  FROM public.students s
  WHERE s.id = u.id
    AND coalesce(trim(s.email), '') <> '';
  GET DIAGNOSTICS v_auth_by_id = ROW_COUNT;

  UPDATE auth.users u
  SET
    encrypted_password = v_hash,
    email_confirmed_at = COALESCE(u.email_confirmed_at, now()),
    updated_at = now()
  FROM public.students s
  WHERE lower(trim(s.email)) = lower(trim(u.email))
    AND coalesce(trim(s.email), '') <> ''
    AND u.encrypted_password IS DISTINCT FROM v_hash;
  GET DIAGNOSTICS v_auth_by_email = ROW_COUNT;

  RAISE NOTICE 'STEP 2 done: students_metadata=%, auth_matched_by_id=%, auth_matched_by_email=%',
    v_students, v_auth_by_id, v_auth_by_email;
END $$;

-- =============================================================================
-- STEP 3 — Repair stragglers (per-row; run if STEP 2 notice shows low auth counts)
-- =============================================================================
DO $$
DECLARE
  v_pass text := 'EzyIntern@2026';
  r record;
  v_uid uuid;
  v_ok int := 0;
  v_skip int := 0;
  v_fail int := 0;
BEGIN
  SET LOCAL statement_timeout = '600s';

  FOR r IN
    SELECT s.id AS student_id, lower(trim(s.email)) AS email
    FROM public.students s
    WHERE coalesce(trim(s.email), '') <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM auth.users u
        WHERE lower(trim(u.email)) = lower(trim(s.email))
          AND u.encrypted_password IS NOT NULL
      )
  LOOP
    SELECT u.id INTO v_uid
    FROM auth.users u
    WHERE lower(trim(u.email)) = r.email
    LIMIT 1;

    IF v_uid IS NULL THEN
      v_skip := v_skip + 1;
      CONTINUE;
    END IF;

    BEGIN
      PERFORM public._set_auth_user_password_internal(v_uid, r.email, v_pass);
      v_ok := v_ok + 1;
    EXCEPTION
      WHEN OTHERS THEN
        v_fail := v_fail + 1;
        RAISE WARNING 'STEP 3 failed %: %', r.email, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'STEP 3 done: repaired=%, no_auth_user=%, failed=%', v_ok, v_skip, v_fail;
END $$;

-- =============================================================================
-- STEP 4 — Verify counts (read-only)
-- =============================================================================
SELECT count(*) AS total_students_with_email
FROM public.students
WHERE coalesce(trim(email), '') <> '';

SELECT count(*) AS students_with_auth_same_email
FROM public.students s
WHERE coalesce(trim(s.email), '') <> ''
  AND EXISTS (
    SELECT 1 FROM auth.users u
    WHERE lower(trim(u.email)) = lower(trim(s.email))
  );

SELECT count(*) AS students_without_auth_user
FROM public.students s
WHERE coalesce(trim(s.email), '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE lower(trim(u.email)) = lower(trim(s.email))
  );

-- =============================================================================
-- STEP 5 — Create auth accounts for students with NO auth user (e.g. the 38 rows)
-- Use same v_pass as STEP 2. Run after STEP 2 succeeded.
-- =============================================================================
DO $$
DECLARE
  v_pass text := 'EzyIntern@2026';
  r record;
  v_hash text;
  v_created int := 0;
  v_skip int := 0;
  v_fail int := 0;
BEGIN
  SET LOCAL statement_timeout = '600s';

  IF v_pass IS NULL OR length(trim(v_pass)) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;

  v_hash := extensions.crypt(trim(v_pass)::text, extensions.gen_salt('bf'::text));

  FOR r IN
    SELECT
      s.id AS student_id,
      lower(trim(s.email)) AS email,
      coalesce(nullif(trim(s.full_name), ''), 'Student') AS full_name,
      nullif(trim(s.contact_number), '') AS phone
    FROM public.students s
    WHERE coalesce(trim(s.email), '') <> ''
      AND NOT EXISTS (
        SELECT 1 FROM auth.users u
        WHERE lower(trim(u.email)) = lower(trim(s.email))
      )
  LOOP
    IF EXISTS (SELECT 1 FROM auth.users u WHERE u.id = r.student_id) THEN
      v_skip := v_skip + 1;
      CONTINUE;
    END IF;

    BEGIN
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, recovery_token,
        email_change_token_new, email_change
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        r.student_id,
        'authenticated',
        'authenticated',
        r.email,
        v_hash,
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', r.full_name),
        now(), now(), '', '', '', ''
      );

      INSERT INTO auth.identities (
        id, provider_id, user_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        r.student_id::text,
        r.student_id,
        jsonb_build_object(
          'sub', r.student_id::text,
          'email', r.email,
          'email_verified', true,
          'phone_verified', false
        ),
        'email',
        now(), now(), now()
      );

      INSERT INTO public.user_roles (user_id, role)
      VALUES (r.student_id, 'student'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;

      INSERT INTO public.profiles (id, full_name, email, contact_number)
      VALUES (r.student_id, r.full_name, r.email, r.phone)
      ON CONFLICT (id) DO UPDATE SET
        full_name = excluded.full_name,
        email = excluded.email,
        contact_number = coalesce(excluded.contact_number, public.profiles.contact_number);

      UPDATE public.students
      SET
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('password', trim(v_pass)),
        status = coalesce(nullif(trim(status), ''), 'Active')
      WHERE id = r.student_id;

      v_created := v_created + 1;
    EXCEPTION
      WHEN OTHERS THEN
        v_fail := v_fail + 1;
        RAISE WARNING 'STEP 5 failed % (%): %', r.email, r.student_id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'STEP 5 done: auth_created=%, skipped_id_exists=%, failed=%',
    v_created, v_skip, v_fail;
END $$;

-- Re-run STEP 4 count — students_without_auth_user should be 0
SELECT count(*) AS students_without_auth_user_after_step5
FROM public.students s
WHERE coalesce(trim(s.email), '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE lower(trim(u.email)) = lower(trim(s.email))
  );

-- Optional: list any still missing
SELECT s.email, s.id, s.full_name, s.created_at
FROM public.students s
WHERE coalesce(trim(s.email), '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE lower(trim(u.email)) = lower(trim(s.email))
  )
ORDER BY s.created_at
LIMIT 50;
