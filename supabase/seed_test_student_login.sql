-- ============================================================================
-- One-off test student + Auth user (Lovable / Supabase SQL editor)
-- ============================================================================
-- DEV / QA seed — change v_password / v_email if you need a different test account.
-- students.id = profiles.id = auth.users.id

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
DECLARE
  v_email    CONSTANT TEXT := 'sandhyanaik3249+77@gmail.com';
  v_password CONSTANT TEXT := 'San@123';
  v_name     CONSTANT TEXT := 'Test Student Sann';
  v_phone    CONSTANT TEXT := '9999999999';
  v_uid      UUID;
  v_year     INT := EXTRACT(YEAR FROM NOW())::INT;
  v_next_seq BIGINT;
  v_reg      TEXT;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(v_email);

  IF v_uid IS NULL THEN
    v_uid := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_uid,
      'authenticated',
      'authenticated',
      v_email,
      extensions.crypt(v_password::text, extensions.gen_salt('bf'::text)),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_name),
      NOW(),
      NOW(),
      '',
      '',
      '',
      ''
    );

    -- Email provider row (required for signInWithPassword on hosted Supabase)
    INSERT INTO auth.identities (
      id,
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      v_uid::text,
      v_uid,
      jsonb_build_object(
        'sub', v_uid::text,
        'email', v_email,
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      NOW(),
      NOW(),
      NOW()
    );
  ELSE
    UPDATE auth.users
    SET
      encrypted_password = extensions.crypt(v_password::text, extensions.gen_salt('bf'::text)),
      email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      updated_at = NOW()
    WHERE id = v_uid;
  END IF;

  SELECT COALESCE(MAX(CAST(NULLIF(split_part(registration_id, '/', 4), '') AS INTEGER)), 10000) + 1
  INTO v_next_seq
  FROM public.students
  WHERE registration_id ~ ('^EZY/' || v_year::TEXT || '/INT/[0-9]+$');

  IF v_next_seq IS NULL THEN
    v_next_seq := 10001;
  END IF;

  v_reg := format('EZY/%s/INT/%s', v_year, v_next_seq);

  INSERT INTO public.profiles (id, full_name, email, contact_number, gender, parent_name)
  VALUES (v_uid, v_name, v_email, v_phone, 'Other', 'Test Parent')
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    contact_number = EXCLUDED.contact_number;

  INSERT INTO public.students (
    id,
    email,
    full_name,
    gender,
    parent_name,
    contact_number,
    university_name,
    college_name,
    course,
    internship_domain,
    degree,
    department,
    class_semester,
    academic_session,
    roll_number,
    emergency_name,
    emergency_contact,
    emergency_relation,
    status,
    registration_id,
    metadata
  )
  VALUES (
    v_uid,
    v_email,
    v_name,
    'Other',
    'Test Parent',
    v_phone,
    'Test University',
    'Test College',
    'Internship',
    'Internship',
    'BTech',
    'CSE',
    'Sem 6',
    format('%s-%s', v_year, (v_year + 1)),
    'TEST-ROLL-001',
    'Emergency Contact',
    '8888888888',
    'Parent',
    'Active',
    v_reg,
    '{"source":"seed_test_student_login.sql"}'::jsonb
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    status = 'Active',
    registration_id = COALESCE(public.students.registration_id, EXCLUDED.registration_id),
    metadata = COALESCE(public.students.metadata, '{}'::jsonb) || EXCLUDED.metadata;

  RAISE NOTICE 'Done. user_id=% email=% reg=%', v_uid, v_email, v_reg;
END $$;

COMMIT;
