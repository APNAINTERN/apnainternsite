-- Recover students who PAID but were never saved to public.students (enrollment failed after payment).
--
-- Data sources (best → fallback):
--   1. public.payment_orders  (metadata JSON = full registration form + password)
--   2. public.payment_success (email, name, Razorpay payment_id)
--
-- Run prerequisites once if not already applied:
--   hotfix_student_paid_enrollment_check.sql
--   hotfix_student_auth_login.sql
--   hotfix_complete_student_registration_safe_reg_id.sql
--
-- Adjust the IST window below for "yesterday" or any incident window.

-- =============================================================================
-- STEP 1 — PREVIEW: paid in payment_orders but NO student row
-- =============================================================================
SELECT
  po.order_id,
  po.payment_id,
  po.status AS order_status,
  po.amount / 100.0 AS amount_inr,
  lower(trim(coalesce(po.metadata->>'email', po.user_email))) AS email,
  coalesce(
    nullif(trim(po.metadata->>'fullName'), ''),
    nullif(trim(po.metadata->>'full_name'), ''),
    'Student'
  ) AS full_name,
  coalesce(
    nullif(trim(po.metadata->>'contact_number'), ''),
    nullif(trim(po.metadata->>'contact'), ''),
    nullif(trim(po.user_phone), '')
  ) AS phone,
  po.created_at AT TIME ZONE 'Asia/Kolkata' AS paid_ist,
  EXISTS (
    SELECT 1 FROM auth.users u
    WHERE lower(trim(u.email)) = lower(trim(coalesce(po.metadata->>'email', po.user_email)))
  ) AS has_auth,
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE lower(trim(s.email)) = lower(trim(coalesce(po.metadata->>'email', po.user_email)))
  ) AS has_student
FROM public.payment_orders po
WHERE (
    po.status = 'success'
    OR (po.payment_id IS NOT NULL AND trim(po.payment_id) ~* '^pay_')
  )
  AND coalesce(po.metadata->>'email', po.user_email) IS NOT NULL
  AND trim(coalesce(po.metadata->>'email', po.user_email)) <> ''
  AND (po.created_at AT TIME ZONE 'Asia/Kolkata') >= timestamptz '2026-05-31 00:00:00+05:30'
  AND (po.created_at AT TIME ZONE 'Asia/Kolkata') <  timestamptz '2026-06-02 00:00:00+05:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.students s
    WHERE lower(trim(s.email)) = lower(trim(coalesce(po.metadata->>'email', po.user_email)))
  )
ORDER BY po.created_at;

-- =============================================================================
-- STEP 2 — PREVIEW: payment_success (Razorpay) but NO student row
-- =============================================================================
SELECT
  ps.payment_id,
  ps.email,
  ps.full_name,
  ps.amount_paise / 100.0 AS amount_inr,
  ps.status,
  ps.created_at AT TIME ZONE 'Asia/Kolkata' AS logged_ist,
  EXISTS (SELECT 1 FROM public.students s WHERE lower(trim(s.email)) = lower(trim(ps.email))) AS has_student
FROM public.payment_success ps
WHERE ps.payment_id ~* '^pay_[a-z0-9]'
  AND lower(coalesce(ps.status, 'success')) = 'success'
  AND ps.email IS NOT NULL
  AND trim(ps.email) <> ''
  AND (ps.created_at AT TIME ZONE 'Asia/Kolkata') >= timestamptz '2026-05-31 00:00:00+05:30'
  AND (ps.created_at AT TIME ZONE 'Asia/Kolkata') <  timestamptz '2026-06-02 00:00:00+05:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.students s WHERE lower(trim(s.email)) = lower(trim(ps.email))
  )
ORDER BY ps.created_at;

-- =============================================================================
-- STEP 3 — RECOVER from payment_orders (creates auth + profile + student + payment_success)
-- Default password if metadata has none: EzyRecover@2026 (students can change on dashboard / forgot password)
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
DECLARE
  r record;
  v_uid uuid;
  v_email text;
  v_name text;
  v_phone text;
  v_password text;
  v_pay_id text;
  v_amount bigint;
  v_reg text;
  v_meta jsonb;
  v_student jsonb;
  v_profile jsonb;
  v_fixed int := 0;
  v_skipped int := 0;
  -- <<< CHANGE DATES FOR YOUR INCIDENT WINDOW (IST) >>>
  v_from timestamptz := timestamptz '2026-05-31 00:00:00+05:30';
  v_to   timestamptz := timestamptz '2026-06-02 00:00:00+05:30';
BEGIN
  FOR r IN
    SELECT po.*
    FROM public.payment_orders po
    WHERE (
        po.status = 'success'
        OR (po.payment_id IS NOT NULL AND trim(po.payment_id) ~* '^pay_')
      )
      AND coalesce(po.metadata->>'email', po.user_email) IS NOT NULL
      AND trim(coalesce(po.metadata->>'email', po.user_email)) <> ''
      AND po.created_at >= v_from
      AND po.created_at < v_to
      AND NOT EXISTS (
        SELECT 1 FROM public.students s
        WHERE lower(trim(s.email)) = lower(trim(coalesce(po.metadata->>'email', po.user_email)))
      )
    ORDER BY po.created_at
  LOOP
    v_meta := coalesce(r.metadata, '{}'::jsonb);
    v_email := lower(trim(coalesce(v_meta->>'email', r.user_email)));
    v_name := coalesce(
      nullif(trim(v_meta->>'fullName'), ''),
      nullif(trim(v_meta->>'full_name'), ''),
      'Student'
    );
    v_phone := coalesce(
      nullif(trim(v_meta->>'contact_number'), ''),
      nullif(trim(v_meta->>'contact'), ''),
      nullif(trim(r.user_phone), '')
    );
    v_password := nullif(trim(v_meta->>'password'), '');
    IF v_password IS NULL OR length(v_password) < 5 THEN
      v_password := 'EzyRecover@2026';
    END IF;

    v_pay_id := nullif(trim(r.payment_id), '');
    IF v_pay_id IS NULL OR v_pay_id !~* '^pay_' THEN
      v_pay_id := 'pay_admin_recover_' || replace(gen_random_uuid()::text, '-', '');
    END IF;
    v_amount := greatest(coalesce(r.amount, 0), 100);

    SELECT u.id INTO v_uid FROM auth.users u WHERE lower(trim(u.email)) = v_email;

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
      PERFORM public._set_auth_user_password_internal(v_uid, v_email, v_password);
    END IF;

    v_student := jsonb_build_object(
      'id', v_uid::text,
      'email', v_email,
      'full_name', v_name,
      'gender', coalesce(nullif(trim(v_meta->>'gender'), ''), 'Other'),
      'parent_name', coalesce(nullif(trim(v_meta->>'parentName'), ''), nullif(trim(v_meta->>'parent_name'), ''), ''),
      'contact_number', v_phone,
      'university_name', coalesce(nullif(trim(v_meta->>'university_name'), ''), nullif(trim(v_meta->>'university'), ''), ''),
      'college_name', coalesce(nullif(trim(v_meta->>'college_name'), ''), nullif(trim(v_meta->>'college'), ''), ''),
      'course', coalesce(nullif(trim(v_meta->>'course'), ''), 'Internship'),
      'internship_domain', coalesce(nullif(trim(v_meta->>'course'), ''), 'Internship'),
      'degree', coalesce(nullif(trim(v_meta->>'degree'), ''), ''),
      'department', coalesce(nullif(trim(v_meta->>'department'), ''), ''),
      'class_semester', coalesce(nullif(trim(v_meta->>'classSem'), ''), nullif(trim(v_meta->>'semester'), ''), nullif(trim(v_meta->>'class_semester'), ''), ''),
      'academic_session', coalesce(nullif(trim(v_meta->>'session'), ''), nullif(trim(v_meta->>'academic_session'), ''), ''),
      'roll_number', coalesce(nullif(trim(v_meta->>'rollNo'), ''), nullif(trim(v_meta->>'roll_number'), ''), ''),
      'emergency_name', coalesce(nullif(trim(v_meta->>'emName'), ''), nullif(trim(v_meta->>'emergency_name'), ''), ''),
      'emergency_contact', coalesce(nullif(trim(v_meta->>'emPhone'), ''), nullif(trim(v_meta->>'emergency_contact'), ''), ''),
      'emergency_relation', coalesce(nullif(trim(v_meta->>'emRel'), ''), nullif(trim(v_meta->>'emergency_relation'), ''), ''),
      'status', 'Active',
      'cybercafe_shop_name', nullif(trim(v_meta->>'cybercafe_shop_name'), ''),
      'cybercafe_email', nullif(trim(v_meta->>'cybercafe_email'), ''),
      'referral_code', nullif(trim(v_meta->>'referral_code'), ''),
      'metadata', v_meta || jsonb_build_object('password', v_password, 'source', 'hotfix_recover_paid_students_missing_directory')
    );

    v_profile := jsonb_build_object(
      'id', v_uid::text,
      'full_name', v_name,
      'email', v_email,
      'contact_number', v_phone,
      'gender', coalesce(nullif(trim(v_meta->>'gender'), ''), 'Other'),
      'parent_name', coalesce(nullif(trim(v_meta->>'parentName'), ''), nullif(trim(v_meta->>'parent_name'), ''), '')
    );

    BEGIN
      v_reg := public.complete_student_registration(v_student, v_profile);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'complete_student_registration failed for %: %', v_email, SQLERRM;
        v_skipped := v_skipped + 1;
        CONTINUE;
    END;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_uid, 'student')
    ON CONFLICT DO NOTHING;

    PERFORM public.ensure_payment_success_log(jsonb_build_object(
      'user_id', v_uid::text,
      'payment_id', v_pay_id,
      'amount_paise', v_amount,
      'email', v_email,
      'full_name', v_name,
      'college_name', coalesce(nullif(trim(v_meta->>'college_name'), ''), nullif(trim(v_meta->>'college'), ''), ''),
      'status', 'success'
    ));

    UPDATE public.payment_orders
    SET status = 'success', payment_id = coalesce(payment_id, v_pay_id), updated_at = now()
    WHERE order_id = r.order_id;

    v_fixed := v_fixed + 1;
  END LOOP;

  RAISE NOTICE 'Recovered from payment_orders: % ok, % skipped', v_fixed, v_skipped;
END $$;

-- =============================================================================
-- STEP 4 — RECOVER orphans: payment_success only (no payment_orders row)
-- Minimal row — student can complete profile on dashboard later
-- =============================================================================

DO $$
DECLARE
  r record;
  v_uid uuid;
  v_email text;
  v_name text;
  v_password text := 'EzyRecover@2026';
  v_reg text;
  v_fixed int := 0;
  v_from timestamptz := timestamptz '2026-05-31 00:00:00+05:30';
  v_to   timestamptz := timestamptz '2026-06-02 00:00:00+05:30';
BEGIN
  FOR r IN
    SELECT ps.payment_id, ps.email, ps.full_name, ps.amount_paise
    FROM public.payment_success ps
    WHERE ps.payment_id ~* '^pay_[a-z0-9]'
      AND lower(coalesce(ps.status, 'success')) = 'success'
      AND ps.email IS NOT NULL
      AND trim(ps.email) <> ''
      AND ps.created_at >= v_from
      AND ps.created_at < v_to
      AND NOT EXISTS (SELECT 1 FROM public.students s WHERE lower(trim(s.email)) = lower(trim(ps.email)))
      AND NOT EXISTS (
        SELECT 1 FROM public.payment_orders po
        WHERE lower(trim(coalesce(po.metadata->>'email', po.user_email))) = lower(trim(ps.email))
          AND po.created_at >= v_from AND po.created_at < v_to
      )
    ORDER BY ps.created_at
  LOOP
    v_email := lower(trim(r.email));
    v_name := coalesce(nullif(trim(r.full_name), ''), 'Student');

    SELECT u.id INTO v_uid FROM auth.users u WHERE lower(trim(u.email)) = v_email;
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
        now(), '{"provider":"email","providers":["email"]}'::jsonb,
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

    v_reg := public.allocate_next_registration_id(extract(year from now())::integer);

    INSERT INTO public.profiles (id, full_name, email, contact_number)
    VALUES (v_uid, v_name, v_email, '')
    ON CONFLICT (id) DO UPDATE SET full_name = excluded.full_name, email = excluded.email;

    INSERT INTO public.students (
      id, email, full_name, contact_number, status, registration_id, metadata
    ) VALUES (
      v_uid, v_email, v_name, '', 'Active', v_reg,
      jsonb_build_object('password', v_password, 'source', 'recover_from_payment_success_only')
    )
    ON CONFLICT (id) DO UPDATE SET
      email = excluded.email,
      full_name = excluded.full_name,
      status = 'Active',
      metadata = coalesce(public.students.metadata, '{}'::jsonb) || excluded.metadata;

    INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'student') ON CONFLICT DO NOTHING;

    PERFORM public.ensure_payment_success_log(jsonb_build_object(
      'user_id', v_uid::text,
      'payment_id', r.payment_id,
      'amount_paise', greatest(coalesce(r.amount_paise, 0), 100),
      'email', v_email,
      'full_name', v_name,
      'status', 'success'
    ));

    v_fixed := v_fixed + 1;
  END LOOP;

  RAISE NOTICE 'Recovered from payment_success only: %', v_fixed;
END $$;

COMMIT;

-- =============================================================================
-- STEP 5 — VERIFY after recovery
-- =============================================================================
SELECT
  count(*) FILTER (WHERE public.student_has_paid_enrollment(s.id)) AS dashboard_ok,
  count(*) FILTER (WHERE NOT public.student_has_paid_enrollment(s.id)) AS still_blocked,
  count(*) AS total
FROM public.students s
WHERE s.created_at >= timestamptz '2026-05-31 00:00:00+05:30'
  AND s.created_at < timestamptz '2026-06-02 00:00:00+05:30';

SELECT s.email, s.full_name, s.contact_number, s.registration_id,
       public.student_has_paid_enrollment(s.id) AS dashboard_ok
FROM public.students s
WHERE s.metadata->>'source' LIKE 'recover%'
   OR s.metadata->>'source' = 'hotfix_recover_paid_students_missing_directory'
ORDER BY s.created_at DESC
LIMIT 200;
