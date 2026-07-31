-- Fix when student row EXISTS but auth.users.id ≠ students.id.
-- If student_id is NULL in verify, use hotfix_four_may31_full_recovery.sql instead.
-- Run in Supabase SQL Editor after hotfix_student_auth_login.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
DECLARE
  r record;
  v_student_id uuid;
  v_auth_id uuid;
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

    SELECT s.id INTO v_student_id
    FROM public.students s
    WHERE lower(trim(s.email)) = v_email
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_student_id IS NULL THEN
      RAISE WARNING 'No students row for %', v_email;
      CONTINUE;
    END IF;

    SELECT u.id INTO v_auth_id
    FROM auth.users u
    WHERE lower(trim(u.email)) = v_email
    ORDER BY (u.id = v_student_id) DESC, u.created_at DESC
    LIMIT 1;

  -- Remove orphan Auth (same email, wrong id) so sign-in uses students.id
    IF v_auth_id IS NOT NULL AND v_auth_id <> v_student_id THEN
      RAISE NOTICE '% removing orphan auth % (student id %)', v_email, v_auth_id, v_student_id;

      DELETE FROM auth.sessions WHERE user_id = v_auth_id;
      DELETE FROM auth.refresh_tokens WHERE user_id = v_auth_id;
      DELETE FROM auth.identities WHERE user_id = v_auth_id;

      DELETE FROM public.user_roles ur1
      WHERE ur1.user_id = v_auth_id
        AND NOT EXISTS (
          SELECT 1 FROM public.user_roles ur2
          WHERE ur2.user_id = v_student_id AND ur2.role = ur1.role
        );
      DELETE FROM public.profiles WHERE id = v_auth_id AND EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = v_student_id
      );
      UPDATE public.payment_success SET user_id = v_student_id
      WHERE user_id = v_auth_id;

      DELETE FROM auth.users WHERE id = v_auth_id;
      v_auth_id := NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_student_id) THEN
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, recovery_token,
        email_change_token_new, email_change
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_student_id, 'authenticated', 'authenticated', v_email,
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
        gen_random_uuid(), v_student_id::text, v_student_id,
        jsonb_build_object('sub', v_student_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
        'email', now(), now(), now()
      );
    ELSE
      UPDATE auth.users
      SET email = v_email, email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
      WHERE id = v_student_id;
      PERFORM public._set_auth_user_password_internal(v_student_id, v_email, v_password);
    END IF;

    UPDATE public.students
    SET
      email = v_email,
      full_name = coalesce(nullif(trim(full_name), ''), v_name),
      contact_number = coalesce(nullif(trim(contact_number), ''), v_phone),
      status = 'Active',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('password', v_password, 'source', 'hotfix_align_auth_student_id')
    WHERE id = v_student_id;

    INSERT INTO public.profiles (id, full_name, email, contact_number)
    VALUES (v_student_id, v_name, v_email, v_phone)
    ON CONFLICT (id) DO UPDATE SET
      full_name = excluded.full_name,
      email = excluded.email,
      contact_number = excluded.contact_number;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_student_id, 'student')
    ON CONFLICT DO NOTHING;

    PERFORM public.ensure_payment_success_log(jsonb_build_object(
      'user_id', v_student_id::text,
      'payment_id', v_pay_id,
      'amount_paise', v_amount,
      'email', v_email,
      'full_name', v_name,
      'status', 'success'
    ));

    UPDATE public.payment_success SET user_id = v_student_id
    WHERE lower(trim(email)) = v_email;

    RAISE NOTICE '% student_id=% auth_match=% paid=%',
      v_email,
      v_student_id,
      EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_student_id AND lower(trim(u.email)) = v_email),
      public.student_has_paid_enrollment(v_student_id);
  END LOOP;
END $$;

-- Diagnose: ids must match for login + dashboard
SELECT
  e.email,
  s.id AS student_id,
  u.id AS auth_id,
  (s.id = u.id) AS ids_match,
  public.student_has_paid_enrollment(s.id) AS paid_on_student_id,
  CASE WHEN u.id IS NOT NULL THEN public.student_has_paid_enrollment(u.id) ELSE false END AS paid_on_auth_id
FROM (VALUES
  ('anishamahto2003@gmail.com'),
  ('suhanijha200@gmail.com'),
  ('karmvatikumarimdb@gmail.com'),
  ('mdehshan434@gmail.com')
) AS e(email)
LEFT JOIN public.students s ON lower(trim(s.email)) = lower(trim(e.email))
LEFT JOIN auth.users u ON lower(trim(u.email)) = lower(trim(e.email));

COMMIT;
