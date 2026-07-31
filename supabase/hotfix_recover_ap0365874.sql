-- Recover ap0365874@gmail.com — paid (Razorpay pay_SvyG4pDF98lWGb, ₹600) but cannot log in.
-- Run in Supabase SQL Editor after:
--   hotfix_student_paid_enrollment_check.sql
--   hotfix_student_auth_login.sql
--   hotfix_pending_registration_id.sql (optional, for proper EZY/2026/INT/ id)
--
-- Default login password if none in payment_orders.metadata: EzyRecover@2026
-- Tell the student to change it after first login (Forgot password / profile).

-- STEP 1 — Diagnose (run first)
SELECT
  'ap0365874@gmail.com'::text AS email,
  EXISTS (SELECT 1 FROM auth.users u WHERE lower(trim(u.email)) = 'ap0365874@gmail.com') AS has_auth,
  (SELECT u.id FROM auth.users u WHERE lower(trim(u.email)) = 'ap0365874@gmail.com' LIMIT 1) AS auth_id,
  EXISTS (SELECT 1 FROM public.students s WHERE lower(trim(s.email)) = 'ap0365874@gmail.com') AS has_student,
  (SELECT s.id FROM public.students s WHERE lower(trim(s.email)) = 'ap0365874@gmail.com' LIMIT 1) AS student_id,
  EXISTS (
    SELECT 1 FROM public.payment_success ps
    WHERE lower(trim(ps.email)) = 'ap0365874@gmail.com' AND ps.payment_id ~* '^pay_'
  ) AS has_payment_success,
  (SELECT public.student_has_paid_enrollment(u.id)
   FROM auth.users u WHERE lower(trim(u.email)) = 'ap0365874@gmail.com' LIMIT 1) AS paid_on_auth_id,
  (SELECT public.student_has_paid_enrollment(s.id)
   FROM public.students s WHERE lower(trim(s.email)) = 'ap0365874@gmail.com' LIMIT 1) AS paid_on_student_id;

SELECT po.payment_id, po.status, po.amount, po.user_phone, po.created_at,
       po.metadata->>'fullName' AS meta_name,
       po.metadata->>'password' AS meta_password
FROM public.payment_orders po
WHERE lower(trim(coalesce(po.metadata->>'email', po.user_email, ''))) = 'ap0365874@gmail.com'
ORDER BY po.created_at DESC
LIMIT 3;

-- STEP 2 — Recover (run entire block)
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
DECLARE
  v_email text := 'ap0365874@gmail.com';
  v_password text := 'EzyRecover@2026';
  v_name text := 'Student';
  v_phone text := '6204439322';
  v_pay_id text := 'pay_SvyG4pDF98lWGb';
  v_amount bigint := 60000;
  v_uid uuid;
  v_auth_id uuid;
  v_reg text;
  v_meta jsonb;
  v_po record;
BEGIN
  SELECT
    po.payment_id,
    greatest(coalesce(po.amount, 0), 100) AS amount,
    coalesce(po.metadata, '{}'::jsonb) AS metadata
  INTO v_po
  FROM public.payment_orders po
  WHERE lower(trim(coalesce(po.metadata->>'email', po.user_email, ''))) = v_email
    AND (po.status = 'success' OR po.payment_id ~* '^pay_')
  ORDER BY po.created_at DESC
  LIMIT 1;

  IF v_po.payment_id IS NOT NULL AND trim(v_po.payment_id) ~* '^pay_' THEN
    v_pay_id := trim(v_po.payment_id);
    v_amount := greatest(coalesce(v_po.amount, 60000), 100);
    v_meta := v_po.metadata;
  ELSE
    v_meta := '{}'::jsonb;
  END IF;

  v_name := coalesce(
    nullif(trim(v_meta->>'fullName'), ''),
    nullif(trim(v_meta->>'full_name'), ''),
    v_name
  );
  v_phone := coalesce(
    nullif(trim(v_meta->>'contact_number'), ''),
    nullif(trim(v_meta->>'contact'), ''),
    nullif(trim(regexp_replace(coalesce(v_meta->>'phone', ''), '\D', '', 'g')), ''),
    v_phone
  );
  v_password := coalesce(nullif(trim(v_meta->>'password'), ''), v_password);

  SELECT s.id INTO v_uid FROM public.students s
  WHERE lower(trim(s.email)) = v_email ORDER BY s.created_at DESC LIMIT 1;

  SELECT u.id INTO v_auth_id FROM auth.users u
  WHERE lower(trim(u.email)) = v_email ORDER BY u.created_at DESC LIMIT 1;

  IF v_uid IS NOT NULL AND v_auth_id IS NOT NULL AND v_uid <> v_auth_id THEN
    DELETE FROM auth.sessions WHERE user_id = v_auth_id;
    DELETE FROM auth.refresh_tokens WHERE user_id = v_auth_id;
    DELETE FROM auth.identities WHERE user_id = v_auth_id;
    DELETE FROM public.user_roles ur1
    WHERE ur1.user_id = v_auth_id
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur2
        WHERE ur2.user_id = v_uid AND ur2.role = ur1.role
      );
    UPDATE public.payment_success SET user_id = v_uid WHERE user_id = v_auth_id;
    DELETE FROM auth.users WHERE id = v_auth_id;
    v_auth_id := NULL;
  END IF;

  IF v_uid IS NULL THEN
    v_uid := coalesce(v_auth_id, gen_random_uuid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_uid) THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_uid, 'authenticated', 'authenticated', v_email,
      extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_name),
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (
      id, provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_uid::text, v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now()
    );
  ELSE
    PERFORM public._set_auth_user_password_internal(v_uid, v_email, v_password);
  END IF;

  BEGIN
    v_reg := public.allocate_next_registration_id(2026);
  EXCEPTION WHEN undefined_function THEN
    v_reg := 'EZY/2026/INT/' || replace(substr(gen_random_uuid()::text, 1, 8), '-', '');
  END;

  INSERT INTO public.students (
    id, email, full_name, gender, contact_number,
    university_name, college_name, course, internship_domain,
    status, registration_id, metadata
  ) VALUES (
    v_uid, v_email, v_name, 'Other', v_phone,
    '', '', 'Internship', 'Internship',
    'Active', v_reg,
    v_meta || jsonb_build_object(
      'password', v_password,
      'source', 'hotfix_recover_ap0365874',
      'razorpay_payment_id', v_pay_id
    )
  )
  ON CONFLICT (id) DO UPDATE SET
    email = excluded.email,
    full_name = coalesce(nullif(excluded.full_name, ''), public.students.full_name),
    contact_number = coalesce(nullif(excluded.contact_number, ''), public.students.contact_number),
    status = 'Active',
    registration_id = CASE
      WHEN trim(public.students.registration_id) ~* '^EZY/PENDING/' THEN excluded.registration_id
      WHEN public.students.registration_id IS NULL OR trim(public.students.registration_id) = '' THEN excluded.registration_id
      ELSE public.students.registration_id
    END,
    metadata = coalesce(public.students.metadata, '{}'::jsonb) || excluded.metadata;

  INSERT INTO public.profiles (id, full_name, email, contact_number)
  VALUES (v_uid, v_name, v_email, v_phone)
  ON CONFLICT (id) DO UPDATE SET
    full_name = excluded.full_name, email = excluded.email, contact_number = excluded.contact_number;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'student') ON CONFLICT DO NOTHING;

  PERFORM public.ensure_payment_success_log(jsonb_build_object(
    'user_id', v_uid::text,
    'payment_id', v_pay_id,
    'amount_paise', v_amount,
    'email', v_email,
    'full_name', v_name,
    'status', 'success'
  ));

  UPDATE public.payment_success SET user_id = v_uid WHERE lower(trim(email)) = v_email;

  BEGIN
    PERFORM public.ensure_student_registration_id(v_uid);
  EXCEPTION
    WHEN undefined_function THEN NULL;
  END;

  RAISE NOTICE '% uid=% paid=% reg=%',
    v_email, v_uid, public.student_has_paid_enrollment(v_uid),
    (SELECT registration_id FROM public.students WHERE id = v_uid);
END $$;

-- STEP 3 — Verify (all should be true / matching)
SELECT
  s.id AS student_id,
  u.id AS auth_id,
  (s.id = u.id) AS ids_match,
  s.registration_id,
  public.student_has_paid_enrollment(s.id) AS paid_ok
FROM public.students s
JOIN auth.users u ON lower(trim(u.email)) = lower(trim(s.email))
WHERE lower(trim(s.email)) = 'ap0365874@gmail.com';

COMMIT;
