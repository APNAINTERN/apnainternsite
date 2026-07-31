-- Lead Hub → Students Directory: staff/admin must not hit "Registration window expired"
-- when the lead email already has an auth account older than 3 hours.

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
GRANT EXECUTE ON FUNCTION public.caller_can_manage_student_directory() TO authenticated;

CREATE OR REPLACE FUNCTION public.assert_can_write_student_directory(p_id uuid, p_email text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_auth_email text;
  v_created timestamptz;
BEGIN
  IF p_id IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Student id and email required';
  END IF;

  IF auth.uid() = p_id THEN
    RETURN;
  END IF;

  IF public.caller_can_manage_student_directory() THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.cybercafe_profiles cp WHERE cp.id = auth.uid()) THEN
    SELECT lower(trim(u.email)), u.created_at
    INTO v_auth_email, v_created
    FROM auth.users u
    WHERE u.id = p_id;

    IF v_auth_email IS NOT NULL
      AND v_auth_email = v_email
      AND (v_created IS NULL OR v_created >= now() - interval '3 hours') THEN
      RETURN;
    END IF;

    RAISE EXCEPTION 'Access denied';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT lower(trim(u.email)), u.created_at
  INTO v_auth_email, v_created
  FROM auth.users u
  WHERE u.id = p_id;

  IF v_auth_email IS NULL THEN
    RAISE EXCEPTION 'Auth account not found';
  END IF;

  IF v_auth_email <> v_email THEN
    RAISE EXCEPTION 'Email does not match auth account';
  END IF;

  IF v_created IS NULL OR v_created < now() - interval '3 hours' THEN
    RAISE EXCEPTION 'Registration window expired; sign in or contact support';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_student_registration_password(
  p_user_id uuid,
  p_email text,
  p_plain text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, auth
AS $$
BEGIN
  IF NOT public.caller_can_manage_student_directory() THEN
    PERFORM public.assert_can_write_student_directory(p_user_id, p_email);
  END IF;
  PERFORM public._set_auth_user_password_internal(p_user_id, p_email, p_plain);
  RETURN TRUE;
END;
$$;

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
  v_id uuid := NULLIF(trim(p_student->>'id'), '')::uuid;
  v_email text := lower(trim(p_student->>'email'));
  v_reg text;
  v_requested_reg text := NULLIF(trim(p_student->>'registration_id'), '');
  v_meta jsonb := COALESCE(p_student->'metadata', '{}'::jsonb) - 'registration_id';
  v_legacy public.students%ROWTYPE;
  v_year integer := extract(year FROM now())::integer;
BEGIN
  IF NOT public.caller_can_manage_student_directory() THEN
    PERFORM public.assert_can_write_student_directory(v_id, v_email);
  END IF;

  SELECT NULLIF(trim(s.registration_id), '')
  INTO v_reg
  FROM public.students s
  WHERE s.id = v_id;

  IF v_reg IS NULL
    OR trim(v_reg) ~* '^EZY/PENDING/'
    OR trim(v_reg) ~* '/INT/PENDING$' THEN
    IF v_requested_reg IS NOT NULL
      AND trim(v_requested_reg) !~* '^EZY/PENDING/'
      AND trim(v_requested_reg) !~* '/INT/PENDING$'
      AND NOT EXISTS (
        SELECT 1 FROM public.students s
        WHERE s.registration_id = v_requested_reg AND s.id <> v_id
      ) THEN
      v_reg := v_requested_reg;
    ELSE
      SELECT s.*
      INTO v_legacy
      FROM public.students s
      WHERE lower(trim(s.email)) = v_email
        AND s.id <> v_id
      ORDER BY s.created_at DESC
      LIMIT 1;

      IF FOUND
        AND NULLIF(trim(v_legacy.registration_id), '') IS NOT NULL
        AND trim(v_legacy.registration_id) !~* '^EZY/PENDING/'
        AND trim(v_legacy.registration_id) !~* '/INT/PENDING$'
        AND NOT EXISTS (
          SELECT 1 FROM public.students s
          WHERE s.registration_id = trim(v_legacy.registration_id)
            AND s.id <> v_id
        ) THEN
        v_reg := trim(v_legacy.registration_id);
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
    cybercafe_shop_name,
    cybercafe_email,
    referral_code,
    registration_id,
    metadata
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
    v_meta
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
    registration_id = COALESCE(
      NULLIF(trim(public.students.registration_id), ''),
      CASE
        WHEN trim(public.students.registration_id) ~* '^EZY/PENDING/'
          OR trim(public.students.registration_id) ~* '/INT/PENDING$'
        THEN EXCLUDED.registration_id
        ELSE public.students.registration_id
      END,
      EXCLUDED.registration_id
    ),
    metadata = COALESCE(public.students.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb);

  IF p_profile IS NOT NULL AND p_profile <> '{}'::jsonb THEN
    INSERT INTO public.profiles (
      id,
      full_name,
      email,
      contact_number,
      gender,
      parent_name
    )
    VALUES (
      COALESCE(NULLIF(trim(p_profile->>'id'), '')::uuid, v_id),
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
      v_reg := public.allocate_next_registration_id(v_year);
      WHILE EXISTS (
        SELECT 1 FROM public.students s WHERE s.registration_id = v_reg AND s.id <> v_id
      ) LOOP
        v_reg := public.allocate_next_registration_id(v_year);
      END LOOP;
      UPDATE public.students SET registration_id = v_reg WHERE id = v_id;
      RETURN v_reg;
    END IF;
    RAISE;
END;
$$;
