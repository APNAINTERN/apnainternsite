-- Fix complete_student_registration: explicit jsonb columns (no jsonb_populate_record).

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
    full_name = EXCLUDED.full_name,
    registration_id = COALESCE(EXCLUDED.registration_id, public.students.registration_id),
    gender = EXCLUDED.gender,
    parent_name = EXCLUDED.parent_name,
    contact_number = EXCLUDED.contact_number,
    university_name = EXCLUDED.university_name,
    college_name = EXCLUDED.college_name,
    course = EXCLUDED.course,
    internship_domain = EXCLUDED.internship_domain,
    degree = EXCLUDED.degree,
    department = EXCLUDED.department,
    class_semester = EXCLUDED.class_semester,
    academic_session = EXCLUDED.academic_session,
    roll_number = EXCLUDED.roll_number,
    emergency_name = EXCLUDED.emergency_name,
    emergency_contact = EXCLUDED.emergency_contact,
    emergency_relation = EXCLUDED.emergency_relation,
    status = EXCLUDED.status,
    cybercafe_shop_name = EXCLUDED.cybercafe_shop_name,
    cybercafe_email = EXCLUDED.cybercafe_email,
    referral_code = EXCLUDED.referral_code,
    metadata = EXCLUDED.metadata;

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
      full_name = EXCLUDED.full_name,
      email = EXCLUDED.email,
      contact_number = EXCLUDED.contact_number,
      gender = EXCLUDED.gender,
      parent_name = EXCLUDED.parent_name;
  END IF;

  SELECT registration_id INTO v_reg FROM public.students WHERE id = v_id;
  RETURN v_reg;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_student_directory_row(p_row jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN public.complete_student_registration(p_row, NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_student_registration(jsonb, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_student_directory_row(jsonb) TO anon, authenticated;
