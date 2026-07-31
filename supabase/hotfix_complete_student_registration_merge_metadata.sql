-- Merge metadata on student directory upsert (do not wipe keys when re-syncing after payment).

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
  v_email text := trim(p_student->>'email');
  v_reg text;
  v_meta jsonb := COALESCE(p_student->'metadata', '{}'::jsonb);
BEGIN
  PERFORM public.assert_can_write_student_directory(v_id, v_email);

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
    lower(trim(p_student->>'email')),
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
    NULLIF(trim(p_student->>'registration_id'), ''),
    v_meta
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.students.full_name),
    registration_id = COALESCE(EXCLUDED.registration_id, public.students.registration_id),
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
END;
$$;
