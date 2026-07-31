-- Fix: Upgrade admin_create_minimal_student_registration to accept all academic params
-- sent by the frontend (p_registration_source, p_university_name, p_college_name,
-- p_course, p_degree, p_department, p_subject).
-- The old 6-param version is dropped first so CREATE OR REPLACE works cleanly.

DROP FUNCTION IF EXISTS public.admin_create_minimal_student_registration(text, text, text, text, text, bigint);

CREATE OR REPLACE FUNCTION public.admin_create_minimal_student_registration(
  p_email               text,
  p_password            text,
  p_phone               text,
  p_full_name           text     DEFAULT NULL,
  p_payment_id          text     DEFAULT NULL,
  p_amount_paise        bigint   DEFAULT NULL,
  p_registration_source text     DEFAULT NULL,
  p_university_name     text     DEFAULT NULL,
  p_college_name        text     DEFAULT NULL,
  p_course              text     DEFAULT NULL,
  p_degree              text     DEFAULT NULL,
  p_department          text     DEFAULT NULL,
  p_subject             text     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, auth
AS $$
DECLARE
  v_email     text   := lower(trim(p_email));
  v_password  text   := trim(p_password);
  v_phone     text   := nullif(trim(p_phone), '');
  v_name      text   := coalesce(nullif(trim(p_full_name), ''), 'Student');
  v_uni       text   := nullif(trim(coalesce(p_university_name, '')), '');
  v_college   text   := nullif(trim(coalesce(p_college_name,   '')), '');
  v_course    text   := nullif(trim(coalesce(p_course,         '')), '');
  v_degree    text   := nullif(trim(coalesce(p_degree,         '')), '');
  v_dept      text   := nullif(trim(coalesce(p_department,     '')), '');
  v_subject   text   := nullif(trim(coalesce(p_subject,        '')), '');
  v_src       text   := coalesce(nullif(trim(p_registration_source), ''), 'admin_add_registration');
  v_pay_id    text;
  v_amount    bigint;
  v_uid       uuid;
  v_auth_id   uuid;
  v_reg       text;
  v_meta      jsonb;
  v_po        record;
BEGIN
  IF NOT public.caller_can_manage_student_directory() THEN
    RAISE EXCEPTION 'Access denied: admin or staff only';
  END IF;

  IF v_email = '' OR v_email NOT LIKE '%@%' THEN
    RAISE EXCEPTION 'Valid email required';
  END IF;

  IF v_password IS NULL OR length(v_password) < 5 THEN
    RAISE EXCEPTION 'Password must be at least 5 characters';
  END IF;

  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'Phone number required';
  END IF;

  -- Try to find a matching payment order for this email
  SELECT
    po.payment_id,
    greatest(coalesce(po.amount, 0), 100) AS amount,
    coalesce(po.metadata, '{}'::jsonb)    AS metadata
  INTO v_po
  FROM public.payment_orders po
  WHERE lower(trim(coalesce(po.metadata->>'email', po.user_email, ''))) = v_email
    AND (po.status = 'success' OR po.payment_id ~* '^pay_')
  ORDER BY po.created_at DESC
  LIMIT 1;

  v_pay_id := nullif(trim(p_payment_id), '');
  IF v_pay_id IS NULL AND v_po.payment_id IS NOT NULL AND trim(v_po.payment_id) ~* '^pay_' THEN
    v_pay_id := trim(v_po.payment_id);
  END IF;
  IF v_pay_id IS NULL THEN
    v_pay_id := 'pay_admin_manual_' || replace(gen_random_uuid()::text, '-', '');
  END IF;

  v_amount := coalesce(p_amount_paise, v_po.amount, 50000);
  v_amount := greatest(v_amount, 100);

  -- Carry forward metadata from payment order if available
  IF v_po.metadata IS NOT NULL THEN
    v_meta := v_po.metadata;
    v_name := coalesce(
      nullif(trim(v_meta->>'fullName'),   ''),
      nullif(trim(v_meta->>'full_name'),  ''),
      v_name
    );
    v_phone := coalesce(
      nullif(trim(v_meta->>'contact_number'), ''),
      nullif(trim(v_meta->>'contact'),        ''),
      v_phone
    );
  ELSE
    v_meta := '{}'::jsonb;
  END IF;

  -- Check for existing student / auth records
  SELECT s.id INTO v_uid
  FROM public.students s
  WHERE lower(trim(s.email)) = v_email
  ORDER BY s.created_at DESC
  LIMIT 1;

  SELECT u.id INTO v_auth_id
  FROM auth.users u
  WHERE lower(trim(u.email)) = v_email
  ORDER BY u.created_at DESC
  LIMIT 1;

  -- Reconcile orphan auth account
  IF v_uid IS NOT NULL AND v_auth_id IS NOT NULL AND v_uid <> v_auth_id THEN
    DELETE FROM auth.sessions      WHERE user_id = v_auth_id;
    DELETE FROM auth.refresh_tokens WHERE user_id = v_auth_id;
    DELETE FROM auth.identities    WHERE user_id = v_auth_id;
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

  -- Create auth user if not exists
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

  -- Allocate registration ID
  BEGIN
    v_reg := public.allocate_next_registration_id(extract(year FROM now())::integer);
  EXCEPTION WHEN undefined_function THEN
    v_reg := 'EZY/' || extract(year FROM now())::text || '/INT/' || replace(substr(gen_random_uuid()::text, 1, 8), '-', '');
  END;

  -- Insert / upsert student row with all academic fields.
  -- RDS stores students.id / students.metadata as text — cast accordingly.
  INSERT INTO public.students (
    id, email, full_name, gender, contact_number,
    university_name, college_name, course, internship_domain,
    status, registration_id, metadata
  ) VALUES (
    v_uid::text, v_email, v_name, 'Other', v_phone,
    coalesce(v_uni,     ''),
    coalesce(v_college, ''),
    coalesce(v_course,  'Internship'),
    coalesce(v_degree,  'Internship'),
    'Active', v_reg,
    (
      v_meta || jsonb_build_object(
        'password',              v_password,
        'source',                v_src,
        'created_by',            auth.uid()::text,
        'razorpay_payment_id',   v_pay_id,
        'department',            v_dept,
        'subject',               v_subject
      )
    )::text
  )
  ON CONFLICT (id) DO UPDATE SET
    email           = excluded.email,
    full_name       = coalesce(nullif(excluded.full_name, ''), public.students.full_name),
    contact_number  = coalesce(nullif(excluded.contact_number, ''), public.students.contact_number),
    university_name = coalesce(nullif(excluded.university_name, ''), public.students.university_name),
    college_name    = coalesce(nullif(excluded.college_name, ''), public.students.college_name),
    course          = coalesce(nullif(excluded.course, ''), public.students.course),
    internship_domain = coalesce(nullif(excluded.internship_domain, ''), public.students.internship_domain),
    status          = 'Active',
    registration_id = CASE
      WHEN trim(coalesce(public.students.registration_id, '')) ~* '^EZY/PENDING/' THEN excluded.registration_id
      WHEN public.students.registration_id IS NULL OR trim(public.students.registration_id) = '' THEN excluded.registration_id
      ELSE public.students.registration_id
    END,
    metadata = (
      coalesce(public.safe_text_to_jsonb(public.students.metadata::text), '{}'::jsonb)
      || coalesce(public.safe_text_to_jsonb(excluded.metadata::text), '{}'::jsonb)
    )::text;

  -- Upsert profile
  INSERT INTO public.profiles (id, full_name, email, contact_number)
  VALUES (v_uid, v_name, v_email, v_phone)
  ON CONFLICT (id) DO UPDATE SET
    full_name      = excluded.full_name,
    email          = excluded.email,
    contact_number = excluded.contact_number;

  -- Assign student role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'student')
  ON CONFLICT DO NOTHING;

  -- Log payment success
  PERFORM public.ensure_payment_success_log(jsonb_build_object(
    'user_id',      v_uid::text,
    'payment_id',   v_pay_id,
    'amount_paise', v_amount,
    'email',        v_email,
    'full_name',    v_name,
    'status',       'success'
  ));

  UPDATE public.payment_success SET user_id = v_uid WHERE lower(trim(email)) = v_email;

  UPDATE public.payment_orders
  SET status     = 'success',
      payment_id = coalesce(nullif(trim(payment_id), ''), v_pay_id),
      updated_at = now()
  WHERE lower(trim(coalesce(metadata->>'email', user_email, ''))) = v_email;

  -- Try ensuring registration ID (no-op if function missing)
  BEGIN
    PERFORM public.ensure_student_registration_id(v_uid);
  EXCEPTION
    WHEN undefined_function THEN NULL;
  END;

  SELECT registration_id INTO v_reg FROM public.students WHERE id = v_uid::text;

  RETURN jsonb_build_object(
    'ok',              true,
    'user_id',         v_uid::text,
    'email',           v_email,
    'registration_id', v_reg,
    'payment_id',      v_pay_id,
    'paid',            public.student_has_paid_enrollment(v_uid)
  );
END;
$$;

-- Revoke public access, grant to authenticated only
REVOKE ALL ON FUNCTION public.admin_create_minimal_student_registration(
  text, text, text, text, text, bigint, text, text, text, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_minimal_student_registration(
  text, text, text, text, text, bigint, text, text, text, text, text, text, text
) TO authenticated;
