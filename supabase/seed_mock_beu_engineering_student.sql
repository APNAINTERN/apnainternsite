-- ============================================================================
-- Mock BEU engineering student for Engineering Directory preview
-- Run in Supabase SQL Editor (Dashboard → SQL → New query → Run)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
DECLARE
  v_email    CONSTANT TEXT := 'arjun.kumar.mock@beu-demo.ezyintern.in';
  v_password CONSTANT TEXT := 'Mock@12345';
  v_name     CONSTANT TEXT := 'Arjun Kumar (Mock BEU)';
  v_phone    CONSTANT TEXT := '9876543210';
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
  VALUES (v_uid, v_name, v_email, v_phone, 'Male', 'Rajesh Kumar')
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
    'Male',
    'Rajesh Kumar',
    v_phone,
    'Bihar Engineering University (BEU)',
    'Government Engineering College, Patna',
    'Web Development',
    'Web Development',
    'B.Tech',
    'B.Tech',
    'Semester 6',
    '2025-2026',
    'BEU-CSE-2024-1042',
    'Rajesh Kumar',
    '9876543211',
    'Father',
    'Active',
    v_reg,
    jsonb_build_object(
      'source', 'seed_mock_beu_engineering_student.sql',
      'subject', 'Computer Science & Engineering',
      'department', 'B.Tech',
      'specialization', 'Artificial Intelligence',
      'section_type', 'Weeks',
      'section_duration', '6 Weeks',
      'internship_mode', 'Online',
      'internship_domain', 'Web Development',
      'password', v_password
    )
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    university_name = EXCLUDED.university_name,
    college_name = EXCLUDED.college_name,
    course = EXCLUDED.course,
    internship_domain = EXCLUDED.internship_domain,
    department = EXCLUDED.department,
    status = 'Active',
    registration_id = COALESCE(public.students.registration_id, EXCLUDED.registration_id),
    metadata = COALESCE(public.students.metadata, '{}'::jsonb) || EXCLUDED.metadata;

  INSERT INTO public.beu_details (
    student_id,
    college,
    course,
    branch_subject,
    specialization,
    section_type,
    section_duration,
    academic_session,
    registration_number,
    internship_domain,
    mode,
    updated_at
  )
  VALUES (
    v_uid,
    'Government Engineering College, Patna',
    'B.Tech',
    'Computer Science & Engineering',
    'Artificial Intelligence',
    'Weeks',
    '6 Weeks',
    '2025-2026',
    'BEU-CSE-2024-1042',
    'Web Development',
    'Online',
    NOW()
  )
  ON CONFLICT (student_id) DO UPDATE SET
    college = EXCLUDED.college,
    course = EXCLUDED.course,
    branch_subject = EXCLUDED.branch_subject,
    specialization = EXCLUDED.specialization,
    section_type = EXCLUDED.section_type,
    section_duration = EXCLUDED.section_duration,
    academic_session = EXCLUDED.academic_session,
    registration_number = EXCLUDED.registration_number,
    internship_domain = EXCLUDED.internship_domain,
    mode = EXCLUDED.mode,
    updated_at = NOW();

  RAISE NOTICE 'Mock BEU student ready. user_id=% email=% reg=% password=%', v_uid, v_email, v_reg, v_password;
END $$;

COMMIT;
