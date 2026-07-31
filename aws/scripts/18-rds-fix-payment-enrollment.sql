-- Fix post-payment enrollment on RDS (2026-07-22).
-- 1) payment_success.id had no DEFAULT → ensure_payment_success_log failed (23502)
-- 2) caller_can_manage_student_directory() missing → complete_student_registration
--    and apply_student_registration_password failed

BEGIN;

-- payment_success: restore uuid default + created_at default
ALTER TABLE public.payment_success
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.payment_success
  ALTER COLUMN created_at SET DEFAULT now();

CREATE OR REPLACE FUNCTION public.ensure_payment_success_log(p_row jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_payment_id text := NULLIF(trim(p_row->>'payment_id'), '');
  v_user_id uuid := NULLIF(trim(p_row->>'user_id'), '')::uuid;
  v_email text := lower(trim(COALESCE(p_row->>'email', '')));
  v_amount bigint;
  v_id uuid;
BEGIN
  IF v_payment_id IS NULL OR v_payment_id = '' THEN
    RAISE EXCEPTION 'payment_id required';
  END IF;
  IF v_email = '' THEN
    RAISE EXCEPTION 'email required';
  END IF;

  IF v_user_id IS NULL THEN
    SELECT u.id INTO v_user_id
    FROM auth.users u
    WHERE lower(trim(u.email)) = v_email
    LIMIT 1;
  END IF;

  v_amount := COALESCE((p_row->>'amount_paise')::bigint, 0);
  IF v_amount < 0 THEN
    v_amount := 0;
  END IF;

  SELECT id INTO v_id
  FROM public.payment_success
  WHERE payment_id = v_payment_id
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.payment_success
    SET
      user_id = COALESCE(v_user_id, user_id),
      amount_paise = CASE WHEN v_amount > 0 THEN v_amount ELSE amount_paise END,
      email = v_email,
      full_name = COALESCE(NULLIF(trim(p_row->>'full_name'), ''), full_name),
      college_name = COALESCE(NULLIF(trim(p_row->>'college_name'), ''), college_name),
      status = COALESCE(NULLIF(trim(p_row->>'status'), ''), status, 'success'),
      cybercafe_shop_name = COALESCE(NULLIF(trim(p_row->>'cybercafe_shop_name'), ''), cybercafe_shop_name),
      cybercafe_email = COALESCE(NULLIF(trim(p_row->>'cybercafe_email'), ''), cybercafe_email)
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.payment_success (
    id,
    user_id,
    payment_id,
    amount_paise,
    email,
    full_name,
    college_name,
    status,
    cybercafe_shop_name,
    cybercafe_email,
    created_at
  )
  VALUES (
    gen_random_uuid(),
    v_user_id,
    v_payment_id,
    v_amount,
    v_email,
    COALESCE(NULLIF(trim(p_row->>'full_name'), ''), 'Student'),
    NULLIF(trim(p_row->>'college_name'), ''),
    COALESCE(NULLIF(trim(p_row->>'status'), ''), 'success'),
    NULLIF(trim(p_row->>'cybercafe_shop_name'), ''),
    NULLIF(trim(p_row->>'cybercafe_email'), ''),
    now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_payment_success_log(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_payment_success_log(jsonb) TO anon, authenticated, service_role;

-- Required by assert_can_write / apply_student_registration_password / complete_student_registration
CREATE OR REPLACE FUNCTION public.caller_can_manage_student_directory()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN (
        'admin'::public.app_role,
        'super_admin'::public.app_role,
        'staff'::public.app_role
      )
  );
$$;

REVOKE ALL ON FUNCTION public.caller_can_manage_student_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.caller_can_manage_student_directory() TO anon, authenticated, service_role;

-- RDS students.id/metadata are text (not uuid/jsonb) — rewrite enrollment RPC accordingly
CREATE OR REPLACE FUNCTION public.complete_student_registration(
  p_student jsonb,
  p_profile jsonb DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_id text := NULLIF(trim(p_student->>'id'), '');
  v_email text := lower(trim(p_student->>'email'));
  v_reg text;
  v_requested_reg text := NULLIF(trim(p_student->>'registration_id'), '');
  v_meta jsonb := COALESCE(p_student->'metadata', '{}'::jsonb) - 'registration_id';
  v_meta_text text;
  v_legacy_reg text;
  v_year integer := extract(year FROM now())::integer;
BEGIN
  IF v_id IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Student id and email required';
  END IF;

  PERFORM public.assert_can_write_student_directory(v_id::uuid, v_email);

  SELECT NULLIF(trim(s.registration_id), '')
  INTO v_reg
  FROM public.students s
  WHERE s.id = v_id;

  IF v_reg IS NULL THEN
    IF v_requested_reg IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.students s
        WHERE s.registration_id = v_requested_reg AND s.id <> v_id
      ) THEN
      v_reg := v_requested_reg;
    ELSE
      SELECT NULLIF(trim(s.registration_id), '')
      INTO v_legacy_reg
      FROM public.students s
      WHERE lower(trim(s.email)) = v_email
        AND s.id <> v_id
      ORDER BY s.created_at DESC NULLS LAST
      LIMIT 1;

      IF v_legacy_reg IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.students s
          WHERE s.registration_id = v_legacy_reg AND s.id <> v_id
        ) THEN
        v_reg := v_legacy_reg;
      ELSE
        v_reg := public.allocate_next_registration_id(v_year);
        WHILE EXISTS (
          SELECT 1 FROM public.students s WHERE s.registration_id = v_reg AND s.id <> v_id
        ) LOOP
          v_reg := public.allocate_next_registration_id(v_year);
        END LOOP;
      END IF;
    END IF;
  END IF;

  v_meta_text := v_meta::text;

  INSERT INTO public.students (
    id, email, full_name, gender, parent_name, contact_number,
    university_name, college_name, course, internship_domain, degree,
    department, class_semester, academic_session, roll_number,
    emergency_name, emergency_contact, emergency_relation, status,
    cybercafe_shop_name, cybercafe_email, referral_code, registration_id,
    metadata, created_at
  )
  VALUES (
    v_id,
    v_email,
    NULLIF(trim(p_student->>'full_name'), ''),
    NULLIF(trim(p_student->>'gender'), ''),
    NULLIF(trim(p_student->>'parent_name'), ''),
    NULLIF(trim(p_student->>'contact_number'), ''),
    NULLIF(trim(p_student->>'university_name'), ''),
    NULLIF(trim(p_student->>'college_name'), ''),
    NULLIF(trim(p_student->>'course'), ''),
    NULLIF(trim(COALESCE(p_student->>'internship_domain', p_student->>'course')), ''),
    NULLIF(trim(p_student->>'degree'), ''),
    NULLIF(trim(p_student->>'department'), ''),
    NULLIF(trim(p_student->>'class_semester'), ''),
    NULLIF(trim(p_student->>'academic_session'), ''),
    NULLIF(trim(p_student->>'roll_number'), ''),
    NULLIF(trim(p_student->>'emergency_name'), ''),
    NULLIF(trim(p_student->>'emergency_contact'), ''),
    NULLIF(trim(p_student->>'emergency_relation'), ''),
    COALESCE(NULLIF(trim(p_student->>'status'), ''), 'Active'),
    NULLIF(trim(p_student->>'cybercafe_shop_name'), ''),
    NULLIF(trim(p_student->>'cybercafe_email'), ''),
    NULLIF(trim(p_student->>'referral_code'), ''),
    v_reg,
    v_meta_text,
    now()::text
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.students.full_name),
    gender = COALESCE(NULLIF(EXCLUDED.gender, ''), public.students.gender),
    parent_name = COALESCE(NULLIF(EXCLUDED.parent_name, ''), public.students.parent_name),
    contact_number = COALESCE(NULLIF(EXCLUDED.contact_number, ''), public.students.contact_number),
    university_name = COALESCE(NULLIF(EXCLUDED.university_name, ''), public.students.university_name),
    college_name = COALESCE(NULLIF(EXCLUDED.college_name, ''), public.students.college_name),
    course = COALESCE(NULLIF(EXCLUDED.course, ''), public.students.course),
    internship_domain = COALESCE(NULLIF(EXCLUDED.internship_domain, ''), public.students.internship_domain),
    degree = COALESCE(NULLIF(EXCLUDED.degree, ''), public.students.degree),
    department = COALESCE(NULLIF(EXCLUDED.department, ''), public.students.department),
    class_semester = COALESCE(NULLIF(EXCLUDED.class_semester, ''), public.students.class_semester),
    academic_session = COALESCE(NULLIF(EXCLUDED.academic_session, ''), public.students.academic_session),
    roll_number = COALESCE(NULLIF(EXCLUDED.roll_number, ''), public.students.roll_number),
    emergency_name = COALESCE(NULLIF(EXCLUDED.emergency_name, ''), public.students.emergency_name),
    emergency_contact = COALESCE(NULLIF(EXCLUDED.emergency_contact, ''), public.students.emergency_contact),
    emergency_relation = COALESCE(NULLIF(EXCLUDED.emergency_relation, ''), public.students.emergency_relation),
    status = COALESCE(NULLIF(EXCLUDED.status, ''), public.students.status),
    cybercafe_shop_name = COALESCE(EXCLUDED.cybercafe_shop_name, public.students.cybercafe_shop_name),
    cybercafe_email = COALESCE(EXCLUDED.cybercafe_email, public.students.cybercafe_email),
    referral_code = COALESCE(EXCLUDED.referral_code, public.students.referral_code),
    registration_id = COALESCE(public.students.registration_id, EXCLUDED.registration_id),
    metadata = (
      COALESCE(public.safe_text_to_jsonb(public.students.metadata), '{}'::jsonb)
      || COALESCE(public.safe_text_to_jsonb(EXCLUDED.metadata), '{}'::jsonb)
    )::text;

  IF p_profile IS NOT NULL AND p_profile <> '{}'::jsonb THEN
    INSERT INTO public.profiles (
      id, full_name, email, contact_number, gender, parent_name
    )
    VALUES (
      COALESCE(NULLIF(trim(p_profile->>'id'), '')::uuid, v_id::uuid),
      COALESCE(NULLIF(trim(p_profile->>'full_name'), ''), 'Student'),
      lower(trim(COALESCE(p_profile->>'email', p_student->>'email'))),
      COALESCE(NULLIF(trim(p_profile->>'contact_number'), ''), ''),
      COALESCE(NULLIF(trim(p_profile->>'gender'), ''), ''),
      COALESCE(NULLIF(trim(p_profile->>'parent_name'), ''), '')
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name),
      email = EXCLUDED.email,
      contact_number = COALESCE(NULLIF(EXCLUDED.contact_number, ''), public.profiles.contact_number),
      gender = COALESCE(NULLIF(EXCLUDED.gender, ''), public.profiles.gender),
      parent_name = COALESCE(NULLIF(EXCLUDED.parent_name, ''), public.profiles.parent_name);
  END IF;

  SELECT registration_id INTO v_reg FROM public.students WHERE id = v_id;
  RETURN v_reg;
EXCEPTION
  WHEN unique_violation THEN
    IF SQLERRM LIKE '%students_registration_id_key%' THEN
      UPDATE public.students
      SET
        email = v_email,
        full_name = COALESCE(NULLIF(trim(p_student->>'full_name'), ''), full_name),
        gender = COALESCE(NULLIF(trim(p_student->>'gender'), ''), gender),
        parent_name = COALESCE(NULLIF(trim(p_student->>'parent_name'), ''), parent_name),
        contact_number = COALESCE(NULLIF(trim(p_student->>'contact_number'), ''), contact_number),
        university_name = COALESCE(NULLIF(trim(p_student->>'university_name'), ''), university_name),
        college_name = COALESCE(NULLIF(trim(p_student->>'college_name'), ''), college_name),
        course = COALESCE(NULLIF(trim(p_student->>'course'), ''), course),
        internship_domain = COALESCE(
          NULLIF(trim(COALESCE(p_student->>'internship_domain', p_student->>'course')), ''),
          internship_domain
        ),
        degree = COALESCE(NULLIF(trim(p_student->>'degree'), ''), degree),
        department = COALESCE(NULLIF(trim(p_student->>'department'), ''), department),
        class_semester = COALESCE(NULLIF(trim(p_student->>'class_semester'), ''), class_semester),
        academic_session = COALESCE(NULLIF(trim(p_student->>'academic_session'), ''), academic_session),
        roll_number = COALESCE(NULLIF(trim(p_student->>'roll_number'), ''), roll_number),
        emergency_name = COALESCE(NULLIF(trim(p_student->>'emergency_name'), ''), emergency_name),
        emergency_contact = COALESCE(NULLIF(trim(p_student->>'emergency_contact'), ''), emergency_contact),
        emergency_relation = COALESCE(NULLIF(trim(p_student->>'emergency_relation'), ''), emergency_relation),
        status = COALESCE(NULLIF(trim(p_student->>'status'), ''), status, 'Active'),
        cybercafe_shop_name = COALESCE(NULLIF(trim(p_student->>'cybercafe_shop_name'), ''), cybercafe_shop_name),
        cybercafe_email = COALESCE(NULLIF(trim(p_student->>'cybercafe_email'), ''), cybercafe_email),
        referral_code = COALESCE(NULLIF(trim(p_student->>'referral_code'), ''), referral_code),
        metadata = (
          COALESCE(public.safe_text_to_jsonb(metadata), '{}'::jsonb) || v_meta
        )::text
      WHERE id = v_id;

      SELECT registration_id INTO v_reg FROM public.students WHERE id = v_id;
      RETURN v_reg;
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_student_registration(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_student_registration(jsonb, jsonb) TO anon, authenticated, service_role;

COMMIT;
