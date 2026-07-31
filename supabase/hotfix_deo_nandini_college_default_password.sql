-- Deo Nandini Degree College (BNMU): set shared login password 123456 for all students.
-- Safe to re-run. Does not change other colleges.
--
-- Run STEP 1 first (helpers), then STEP 2 (bulk update).

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.is_bnmu_university_name(p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    lower(trim(p_name)) ~ 'bnmu|bhupendra\s*narayan\s*mandal',
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_deo_nandini_bnmu_college_name(p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    lower(trim(p_name)) ~ 'deo\s*nandin|deo\s*nandani|deo\s*nadani|dev\s*nandin|dev\s*nandini',
    false
  );
$$;

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

-- STEP 2 — Bulk set password 123456 for Deo Nandini BNMU students only
DO $$
DECLARE
  v_pass text := '123456';
  v_salt text;
  v_hash text;
  v_students int;
  v_auth int;
BEGIN
  SET LOCAL statement_timeout = '600s';

  v_salt := extensions.gen_salt('bf'::text);
  v_hash := extensions.crypt(trim(v_pass)::text, v_salt);

  UPDATE public.students s
  SET metadata = COALESCE(s.metadata, '{}'::jsonb) || jsonb_build_object('password', v_pass)
  WHERE public.is_bnmu_university_name(s.university_name)
    AND public.is_deo_nandini_bnmu_college_name(s.college_name)
    AND coalesce(trim(s.email), '') <> '';
  GET DIAGNOSTICS v_students = ROW_COUNT;

  UPDATE auth.users u
  SET
    encrypted_password = v_hash,
    email_confirmed_at = COALESCE(u.email_confirmed_at, now()),
    updated_at = now()
  FROM public.students s
  WHERE s.id = u.id
    AND public.is_bnmu_university_name(s.university_name)
    AND public.is_deo_nandini_bnmu_college_name(s.college_name)
    AND coalesce(trim(s.email), '') <> '';
  GET DIAGNOSTICS v_auth = ROW_COUNT;

  RAISE NOTICE 'Deo Nandini BNMU: students_metadata=%, auth_by_id=%', v_students, v_auth;
END $$;

-- STEP 3 — Repair auth matched by email only
DO $$
DECLARE
  v_pass text := '123456';
  r record;
  v_uid uuid;
  v_ok int := 0;
BEGIN
  SET LOCAL statement_timeout = '600s';

  FOR r IN
    SELECT s.id AS student_id, lower(trim(s.email)) AS email
    FROM public.students s
    WHERE public.is_bnmu_university_name(s.university_name)
      AND public.is_deo_nandini_bnmu_college_name(s.college_name)
      AND coalesce(trim(s.email), '') <> ''
  LOOP
    SELECT u.id INTO v_uid
    FROM auth.users u
    WHERE lower(trim(u.email)) = r.email
    LIMIT 1;

    IF v_uid IS NULL THEN
      CONTINUE;
    END IF;

    BEGIN
      PERFORM public._set_auth_user_password_internal(v_uid, r.email, v_pass);
      v_ok := v_ok + 1;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Deo Nandini password failed %: %', r.email, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'Deo Nandini BNMU: repaired=%', v_ok;
END $$;

-- Preview matched students
SELECT id, full_name, email, college_name, university_name
FROM public.students
WHERE public.is_bnmu_university_name(university_name)
  AND public.is_deo_nandini_bnmu_college_name(college_name)
ORDER BY created_at DESC
LIMIT 50;
