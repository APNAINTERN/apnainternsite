-- Recover 3 paid students who cannot log in (May-31 pattern).
-- Run entire file in Supabase SQL Editor after:
--   hotfix_student_paid_enrollment_check.sql
--   hotfix_student_auth_login.sql
--
-- | Email                         | Password        | Phone      | Name            | Razorpay (fallback)   |
-- |-------------------------------|-----------------|------------|-----------------|------------------------|
-- | akshky786@gmail.com           | Sudist@854099   | 7492061953 | AKSHAY KUMAR    | (from payment_orders) |
-- | sumitya857@gmail.com          | EzyRecover@2026 | 6207224785 | SUMIT KUMAR     | pay_Svw7RUw77y6VW4     |
-- | merajkhan9128116670@gmail.com | EzyRecover@2026 | 7324913629 | MD MERAJ UDDIN  | pay_Svxx9XJk1RLYqE     |
--
-- Sumit & Meraj: change EzyRecover@2026 after login if you have their real registration password.

-- STEP 1 — Diagnose
SELECT
  e.email,
  EXISTS (SELECT 1 FROM auth.users u WHERE lower(trim(u.email)) = lower(trim(e.email))) AS has_auth,
  EXISTS (SELECT 1 FROM public.students s WHERE lower(trim(s.email)) = lower(trim(e.email))) AS has_student,
  EXISTS (
    SELECT 1 FROM public.payment_success ps
    WHERE lower(trim(ps.email)) = lower(trim(e.email)) AND ps.payment_id ~* '^pay_'
  ) AS has_payment_success
FROM (VALUES
  ('akshky786@gmail.com'),
  ('sumitya857@gmail.com'),
  ('merajkhan9128116670@gmail.com')
) AS e(email);

-- STEP 2 — Recover
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
DECLARE
  r record;
  v_uid uuid;
  v_auth_id uuid;
  v_email text;
  v_password text;
  v_name text;
  v_phone text;
  v_pay_id text;
  v_amount bigint;
  v_reg text;
  v_meta jsonb;
  v_po record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('akshky786@gmail.com',           'Sudist@854099',   'AKSHAY KUMAR',    '7492061953', 'pay_admin_recover_akshky786', 50000::bigint),
      ('sumitya857@gmail.com',          'EzyRecover@2026', 'SUMIT KUMAR',     '6207224785', 'pay_Svw7RUw77y6VW4',          50000::bigint),
      ('merajkhan9128116670@gmail.com', 'EzyRecover@2026', 'MD MERAJ UDDIN',  '7324913629', 'pay_Svxx9XJk1RLYqE',          60000::bigint)
    ) AS t(email, plain_password, full_name, phone, payment_id, amount_paise)
  LOOP
    v_email := lower(trim(r.email));
    v_password := trim(r.plain_password);
    v_name := trim(r.full_name);
    v_phone := trim(r.phone);
    v_pay_id := trim(r.payment_id);
    v_amount := r.amount_paise;

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
      v_amount := greatest(coalesce(v_po.amount, v_amount), 100);
      v_meta := v_po.metadata;
      v_name := coalesce(
        nullif(trim(v_meta->>'fullName'), ''),
        nullif(trim(v_meta->>'full_name'), ''),
        v_name
      );
      v_phone := coalesce(
        nullif(trim(v_meta->>'contact_number'), ''),
        nullif(trim(v_meta->>'contact'), ''),
        v_phone
      );
      v_password := coalesce(nullif(trim(v_meta->>'password'), ''), v_password);
    ELSE
      v_meta := '{}'::jsonb;
    END IF;

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
        'source', 'hotfix_recover_akshky_sumit_meraj',
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
      full_name = excluded.full_name,
      email = excluded.email,
      contact_number = excluded.contact_number;

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

    UPDATE public.payment_orders
    SET status = 'success',
        payment_id = coalesce(nullif(trim(payment_id), ''), v_pay_id),
        updated_at = now()
    WHERE lower(trim(coalesce(metadata->>'email', user_email, ''))) = v_email;

    BEGIN
      PERFORM public.ensure_student_registration_id(v_uid);
    EXCEPTION
      WHEN undefined_function THEN NULL;
    END;

    RAISE NOTICE '% uid=% ids_match=% paid=% reg=%',
      v_email,
      v_uid,
      (SELECT s.id = u.id FROM public.students s, auth.users u
       WHERE s.id = v_uid AND u.id = v_uid),
      public.student_has_paid_enrollment(v_uid),
      (SELECT registration_id FROM public.students WHERE id = v_uid);
  END LOOP;
END $$;

-- STEP 3 — Verify (ids_match and paid_ok should be true)
SELECT
  e.email,
  s.id AS student_id,
  u.id AS auth_id,
  (s.id IS NOT NULL AND u.id IS NOT NULL AND s.id = u.id) AS ids_match,
  s.registration_id,
  public.student_has_paid_enrollment(coalesce(s.id, u.id)) AS paid_ok
FROM (VALUES
  ('akshky786@gmail.com'),
  ('sumitya857@gmail.com'),
  ('merajkhan9128116670@gmail.com')
) AS e(email)
LEFT JOIN public.students s ON lower(trim(s.email)) = lower(trim(e.email))
LEFT JOIN auth.users u ON lower(trim(u.email)) = lower(trim(e.email));

COMMIT;
