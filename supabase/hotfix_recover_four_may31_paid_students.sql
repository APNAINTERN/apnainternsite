-- Fix 4 May-31 paid students: student row exists but has_auth / payment_success / dashboard_ok were false.
-- Run entire file in Supabase SQL Editor after hotfix_student_paid_enrollment_check.sql + hotfix_student_auth_login.sql
--
-- If verify shows true but login still fails, run hotfix_four_may31_align_auth_to_student_id.sql
-- (auth.users.id must equal public.students.id for the app payment gate).
--
-- Razorpay captured 31 May 2026 — amounts ₹500 (50000 paise)

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
DECLARE
  r record;
  v_uid uuid;
  v_email text;
  v_password text;
  v_name text;
  v_phone text;
  v_pay_id text;
  v_amount bigint := 50000;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('anishamahto2003@gmail.com', '#Anisha@2003',   'ANISHA KUMARI',   '6299818439', 'pay_SvwTt2DB4jPNXE'),
      ('suhanijha200@gmail.com',   'suha@12',        'SUHANI KUMARI',   '9060971462', 'pay_SvuQefSrc0qSQy'),
      ('karmvatikumarimdb@gmail.com', 'Bm@123',      'KARMVATI KUMARI', '8709889551', 'pay_Svw92U9vC8kwKI'),
      ('mdehshan434@gmail.com',    '#Ehshan@2005',   'MD EHSHAN',       '8252485889', 'pay_SvtuBbJ6rPFUny')
    ) AS t(email, plain_password, full_name, phone, payment_id)
  LOOP
    v_email := lower(trim(r.email));
    v_password := trim(r.plain_password);
    v_name := trim(r.full_name);
    v_phone := trim(r.phone);
    v_pay_id := trim(r.payment_id);

    SELECT s.id INTO v_uid
    FROM public.students s
    WHERE lower(trim(s.email)) = v_email
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_uid IS NULL THEN
      RAISE WARNING 'No students row for % — run hotfix_recover_may31_2026_only.sql first', v_email;
      CONTINUE;
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
      UPDATE auth.users
      SET email = v_email, updated_at = now()
      WHERE id = v_uid AND lower(trim(email)) <> v_email;
      PERFORM public._set_auth_user_password_internal(v_uid, v_email, v_password);
    END IF;

    UPDATE public.students
    SET
      email = v_email,
      full_name = coalesce(nullif(trim(full_name), ''), v_name),
      contact_number = coalesce(nullif(trim(contact_number), ''), v_phone),
      status = 'Active',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('password', v_password, 'source', 'hotfix_four_may31_paid')
    WHERE id = v_uid;

    INSERT INTO public.profiles (id, full_name, email, contact_number)
    VALUES (v_uid, v_name, v_email, v_phone)
    ON CONFLICT (id) DO UPDATE SET
      full_name = excluded.full_name,
      email = excluded.email,
      contact_number = excluded.contact_number;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_uid, 'student')
    ON CONFLICT DO NOTHING;

    PERFORM public.ensure_payment_success_log(jsonb_build_object(
      'user_id', v_uid::text,
      'payment_id', v_pay_id,
      'amount_paise', v_amount,
      'email', v_email,
      'full_name', v_name,
      'status', 'success'
    ));

  UPDATE public.payment_success
  SET user_id = v_uid
  WHERE lower(trim(email)) = v_email;

    RAISE NOTICE '% → auth=% paid=% dashboard=%',
      v_email,
      EXISTS (SELECT 1 FROM auth.users WHERE id = v_uid),
      EXISTS (SELECT 1 FROM public.payment_success WHERE payment_id = v_pay_id),
      public.student_has_paid_enrollment(v_uid);
  END LOOP;
END $$;

-- Verify (same check as before)
SELECT
  e.email,
  EXISTS (SELECT 1 FROM auth.users u WHERE lower(trim(u.email)) = e.email) AS has_auth,
  EXISTS (SELECT 1 FROM public.students s WHERE lower(trim(s.email)) = e.email) AS has_student,
  EXISTS (SELECT 1 FROM public.payment_success ps WHERE lower(trim(ps.email)) = e.email AND ps.payment_id ~* '^pay_') AS has_payment_success,
  (SELECT public.student_has_paid_enrollment(s.id) FROM public.students s WHERE lower(trim(s.email)) = e.email LIMIT 1) AS dashboard_ok
FROM (VALUES
  ('anishamahto2003@gmail.com'),
  ('suhanijha200@gmail.com'),
  ('karmvatikumarimdb@gmail.com'),
  ('mdehshan434@gmail.com')
) AS e(email);

COMMIT;
