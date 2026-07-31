-- Full recovery for 4 May-31 paid students when SQL shows auth_id but student_id NULL.
-- Auth exists from registration; students row + payment_success never saved.
-- Run entire file in Supabase SQL Editor (postgres). Prerequisites:
--   hotfix_student_paid_enrollment_check.sql, hotfix_student_auth_login.sql
-- Optional: hotfix_complete_student_registration_safe_reg_id.sql (for allocate_next_registration_id)

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
  v_reg text;
  v_meta jsonb;
  v_po record;
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
      v_amount := greatest(coalesce(v_po.amount, 50000), 100);
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

    SELECT s.id INTO v_uid
    FROM public.students s
    WHERE lower(trim(s.email)) = v_email
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_uid IS NULL THEN
      SELECT u.id INTO v_uid
      FROM auth.users u
      WHERE lower(trim(u.email)) = v_email
      ORDER BY u.created_at DESC
      LIMIT 1;
    END IF;

    IF v_uid IS NULL THEN
      v_uid := gen_random_uuid();
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
    END IF;

    BEGIN
      v_reg := public.allocate_next_registration_id(extract(year FROM now())::integer);
    EXCEPTION
      WHEN undefined_function THEN
        v_reg := 'EZY/' || extract(year FROM now())::text || '/INT/' || replace(substr(gen_random_uuid()::text, 1, 8), '-', '');
    END;

    INSERT INTO public.students (
      id, email, full_name, gender, parent_name, contact_number,
      university_name, college_name, course, internship_domain,
      degree, department, class_semester, academic_session, roll_number,
      status, registration_id, metadata
    )
    VALUES (
      v_uid,
      v_email,
      v_name,
      coalesce(nullif(trim(v_meta->>'gender'), ''), 'Other'),
      coalesce(nullif(trim(v_meta->>'parentName'), ''), nullif(trim(v_meta->>'parent_name'), ''), ''),
      v_phone,
      coalesce(nullif(trim(v_meta->>'university_name'), ''), nullif(trim(v_meta->>'university'), ''), ''),
      coalesce(nullif(trim(v_meta->>'college_name'), ''), nullif(trim(v_meta->>'college'), ''), ''),
      coalesce(nullif(trim(v_meta->>'course'), ''), 'Internship'),
      coalesce(nullif(trim(v_meta->>'course'), ''), 'Internship'),
      coalesce(nullif(trim(v_meta->>'degree'), ''), ''),
      coalesce(nullif(trim(v_meta->>'department'), ''), ''),
      coalesce(nullif(trim(v_meta->>'classSem'), ''), nullif(trim(v_meta->>'semester'), ''), ''),
      coalesce(nullif(trim(v_meta->>'session'), ''), nullif(trim(v_meta->>'academic_session'), ''), ''),
      coalesce(nullif(trim(v_meta->>'rollNo'), ''), nullif(trim(v_meta->>'roll_number'), ''), ''),
      'Active',
      v_reg,
      v_meta || jsonb_build_object('password', v_password, 'source', 'hotfix_four_may31_full_recovery')
    )
    ON CONFLICT (id) DO UPDATE SET
      email = excluded.email,
      full_name = coalesce(nullif(excluded.full_name, ''), public.students.full_name),
      contact_number = coalesce(nullif(excluded.contact_number, ''), public.students.contact_number),
      status = 'Active',
      metadata = coalesce(public.students.metadata, '{}'::jsonb) || excluded.metadata;

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

    UPDATE public.payment_orders
    SET status = 'success', payment_id = coalesce(nullif(trim(payment_id), ''), v_pay_id), updated_at = now()
    WHERE lower(trim(coalesce(metadata->>'email', user_email, ''))) = v_email;

    RAISE NOTICE '% uid=% student=% paid=%',
      v_email,
      v_uid,
      EXISTS (SELECT 1 FROM public.students s WHERE s.id = v_uid),
      public.student_has_paid_enrollment(v_uid);
  END LOOP;
END $$;

-- Must show student_id = auth_id and paid_on_auth_id = true
SELECT
  e.email,
  s.id AS student_id,
  u.id AS auth_id,
  (s.id IS NOT NULL AND u.id IS NOT NULL AND s.id = u.id) AS ids_match,
  public.student_has_paid_enrollment(coalesce(s.id, u.id)) AS paid_ok
FROM (VALUES
  ('anishamahto2003@gmail.com'),
  ('suhanijha200@gmail.com'),
  ('karmvatikumarimdb@gmail.com'),
  ('mdehshan434@gmail.com')
) AS e(email)
LEFT JOIN public.students s ON lower(trim(s.email)) = lower(trim(e.email))
LEFT JOIN auth.users u ON lower(trim(u.email)) = lower(trim(e.email));

COMMIT;
