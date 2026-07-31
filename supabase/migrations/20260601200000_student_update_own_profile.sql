-- Student dashboard Edit Profile (never changes registration_id on update).

-- Empty registration_id breaks UNIQUE — normalize and dedupe NULL slots.
UPDATE public.students
SET registration_id = NULL
WHERE registration_id IS NOT NULL AND trim(registration_id) = '';

UPDATE public.students s
SET registration_id = 'EZY/PENDING/' || upper(replace(s.id::text, '-', ''))
WHERE s.registration_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.students o
    WHERE o.registration_id IS NULL
      AND o.id <> s.id
  );

CREATE OR REPLACE FUNCTION public.student_update_own_profile(p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_id uuid := auth.uid();
  v_email text := lower(trim(COALESCE(p_row->>'email', '')));
  v_meta jsonb := COALESCE(p_row->'metadata', '{}'::jsonb) - 'registration_id';
  v_reg text;
  v_legacy public.students%ROWTYPE;
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_email = '' THEN
    SELECT lower(trim(u.email)) INTO v_email
    FROM auth.users u
    WHERE u.id = v_id;
  END IF;

  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Student email required';
  END IF;

  SELECT NULLIF(trim(s.registration_id), '')
  INTO v_reg
  FROM public.students s
  WHERE s.id = v_id;

  IF v_reg IS NULL THEN
    v_reg := 'EZY/PENDING/' || upper(replace(v_id::text, '-', ''));
    WHILE EXISTS (
      SELECT 1 FROM public.students s WHERE s.registration_id = v_reg AND s.id <> v_id
    ) LOOP
      v_reg := v_reg || 'X';
    END LOOP;
  END IF;

  IF EXISTS (SELECT 1 FROM public.students s WHERE s.id = v_id) THEN
    UPDATE public.students
    SET
      email = v_email,
      full_name = COALESCE(NULLIF(trim(p_row->>'full_name'), ''), full_name),
      gender = COALESCE(NULLIF(trim(p_row->>'gender'), ''), gender),
      parent_name = COALESCE(NULLIF(trim(p_row->>'parent_name'), ''), parent_name),
      contact_number = COALESCE(NULLIF(trim(p_row->>'contact_number'), ''), contact_number),
      university_name = CASE
        WHEN p_row ? 'university_name' THEN NULLIF(trim(p_row->>'university_name'), '')
        ELSE university_name
      END,
      college_name = CASE
        WHEN p_row ? 'college_name' THEN NULLIF(trim(p_row->>'college_name'), '')
        ELSE college_name
      END,
      degree = CASE WHEN p_row ? 'degree' THEN NULLIF(trim(p_row->>'degree'), '') ELSE degree END,
      department = CASE
        WHEN p_row ? 'department' THEN NULLIF(trim(p_row->>'department'), '')
        ELSE department
      END,
      academic_session = CASE
        WHEN p_row ? 'academic_session' THEN NULLIF(trim(p_row->>'academic_session'), '')
        ELSE academic_session
      END,
      class_semester = CASE
        WHEN p_row ? 'class_semester' THEN NULLIF(trim(p_row->>'class_semester'), '')
        ELSE class_semester
      END,
      roll_number = CASE
        WHEN p_row ? 'roll_number' THEN NULLIF(trim(p_row->>'roll_number'), '')
        ELSE roll_number
      END,
      course = CASE WHEN p_row ? 'course' THEN NULLIF(trim(p_row->>'course'), '') ELSE course END,
      internship_domain = CASE
        WHEN p_row ? 'internship_domain' OR p_row ? 'course' THEN NULLIF(trim(COALESCE(p_row->>'internship_domain', p_row->>'course')), '')
        ELSE internship_domain
      END,
      internship_duration = COALESCE(NULLIF(trim(p_row->>'internship_duration'), ''), internship_duration),
      joining_date = COALESCE(NULLIF(trim(p_row->>'joining_date'), ''), joining_date),
      completion_date = COALESCE(NULLIF(trim(p_row->>'completion_date'), ''), completion_date),
      emergency_name = COALESCE(NULLIF(trim(p_row->>'emergency_name'), ''), emergency_name),
      emergency_contact = COALESCE(NULLIF(trim(p_row->>'emergency_contact'), ''), emergency_contact),
      emergency_relation = COALESCE(NULLIF(trim(p_row->>'emergency_relation'), ''), emergency_relation),
      status = COALESCE(NULLIF(trim(p_row->>'status'), ''), status, 'Active'),
      metadata = COALESCE(metadata, '{}'::jsonb) || v_meta
    WHERE id = v_id;

    RETURN jsonb_build_object('id', v_id::text, 'email', v_email);
  END IF;

  SELECT s.*
  INTO v_legacy
  FROM public.students s
  WHERE lower(trim(s.email)) = v_email
    AND s.id <> v_id
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF FOUND
    AND NULLIF(trim(v_legacy.registration_id), '') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.registration_id = trim(v_legacy.registration_id)
        AND s.id <> v_id
    ) THEN
    v_reg := trim(v_legacy.registration_id);
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
    degree,
    department,
    academic_session,
    class_semester,
    roll_number,
    course,
    internship_domain,
    internship_duration,
    joining_date,
    completion_date,
    emergency_name,
    emergency_contact,
    emergency_relation,
    status,
    registration_id,
    metadata
  )
  VALUES (
    v_id,
    v_email,
    COALESCE(NULLIF(trim(p_row->>'full_name'), ''), CASE WHEN FOUND THEN v_legacy.full_name END),
    COALESCE(NULLIF(trim(p_row->>'gender'), ''), CASE WHEN FOUND THEN v_legacy.gender END),
    COALESCE(NULLIF(trim(p_row->>'parent_name'), ''), CASE WHEN FOUND THEN v_legacy.parent_name END),
    COALESCE(NULLIF(trim(p_row->>'contact_number'), ''), CASE WHEN FOUND THEN v_legacy.contact_number END),
    COALESCE(NULLIF(trim(p_row->>'university_name'), ''), CASE WHEN FOUND THEN v_legacy.university_name END),
    COALESCE(NULLIF(trim(p_row->>'college_name'), ''), CASE WHEN FOUND THEN v_legacy.college_name END),
    COALESCE(NULLIF(trim(p_row->>'degree'), ''), CASE WHEN FOUND THEN v_legacy.degree END),
    COALESCE(NULLIF(trim(p_row->>'department'), ''), CASE WHEN FOUND THEN v_legacy.department END),
    COALESCE(NULLIF(trim(p_row->>'academic_session'), ''), CASE WHEN FOUND THEN v_legacy.academic_session END),
    COALESCE(NULLIF(trim(p_row->>'class_semester'), ''), CASE WHEN FOUND THEN v_legacy.class_semester END),
    COALESCE(NULLIF(trim(p_row->>'roll_number'), ''), CASE WHEN FOUND THEN v_legacy.roll_number END),
    COALESCE(NULLIF(trim(p_row->>'course'), ''), CASE WHEN FOUND THEN v_legacy.course END),
    COALESCE(
      NULLIF(trim(COALESCE(p_row->>'internship_domain', p_row->>'course')), ''),
      CASE WHEN FOUND THEN v_legacy.internship_domain END
    ),
    COALESCE(NULLIF(trim(p_row->>'internship_duration'), ''), CASE WHEN FOUND THEN v_legacy.internship_duration END),
    COALESCE(NULLIF(trim(p_row->>'joining_date'), ''), CASE WHEN FOUND THEN v_legacy.joining_date END),
    COALESCE(NULLIF(trim(p_row->>'completion_date'), ''), CASE WHEN FOUND THEN v_legacy.completion_date END),
    COALESCE(NULLIF(trim(p_row->>'emergency_name'), ''), CASE WHEN FOUND THEN v_legacy.emergency_name END),
    COALESCE(NULLIF(trim(p_row->>'emergency_contact'), ''), CASE WHEN FOUND THEN v_legacy.emergency_contact END),
    COALESCE(NULLIF(trim(p_row->>'emergency_relation'), ''), CASE WHEN FOUND THEN v_legacy.emergency_relation END),
    COALESCE(NULLIF(trim(p_row->>'status'), ''), CASE WHEN FOUND THEN v_legacy.status END, 'Active'),
    v_reg,
    (CASE WHEN FOUND THEN COALESCE(v_legacy.metadata, '{}'::jsonb) ELSE '{}'::jsonb END) || v_meta
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.students.full_name),
    gender = COALESCE(NULLIF(EXCLUDED.gender, ''), public.students.gender),
    parent_name = COALESCE(NULLIF(EXCLUDED.parent_name, ''), public.students.parent_name),
    contact_number = COALESCE(NULLIF(EXCLUDED.contact_number, ''), public.students.contact_number),
    university_name = CASE
      WHEN p_row ? 'university_name' THEN COALESCE(NULLIF(EXCLUDED.university_name, ''), public.students.university_name)
      ELSE public.students.university_name
    END,
    college_name = CASE
      WHEN p_row ? 'college_name' THEN COALESCE(NULLIF(EXCLUDED.college_name, ''), public.students.college_name)
      ELSE public.students.college_name
    END,
    degree = CASE
      WHEN p_row ? 'degree' THEN COALESCE(NULLIF(EXCLUDED.degree, ''), public.students.degree)
      ELSE public.students.degree
    END,
    department = CASE
      WHEN p_row ? 'department' THEN COALESCE(NULLIF(EXCLUDED.department, ''), public.students.department)
      ELSE public.students.department
    END,
    academic_session = CASE
      WHEN p_row ? 'academic_session' THEN COALESCE(NULLIF(EXCLUDED.academic_session, ''), public.students.academic_session)
      ELSE public.students.academic_session
    END,
    class_semester = CASE
      WHEN p_row ? 'class_semester' THEN COALESCE(NULLIF(EXCLUDED.class_semester, ''), public.students.class_semester)
      ELSE public.students.class_semester
    END,
    roll_number = CASE
      WHEN p_row ? 'roll_number' THEN COALESCE(NULLIF(EXCLUDED.roll_number, ''), public.students.roll_number)
      ELSE public.students.roll_number
    END,
    course = CASE
      WHEN p_row ? 'course' OR p_row ? 'internship_domain' THEN COALESCE(NULLIF(EXCLUDED.course, ''), public.students.course)
      ELSE public.students.course
    END,
    internship_domain = CASE
      WHEN p_row ? 'internship_domain' OR p_row ? 'course' THEN COALESCE(NULLIF(EXCLUDED.internship_domain, ''), public.students.internship_domain)
      ELSE public.students.internship_domain
    END,
    internship_duration = COALESCE(NULLIF(EXCLUDED.internship_duration, ''), public.students.internship_duration),
    joining_date = COALESCE(NULLIF(EXCLUDED.joining_date, ''), public.students.joining_date),
    completion_date = COALESCE(NULLIF(EXCLUDED.completion_date, ''), public.students.completion_date),
    emergency_name = COALESCE(NULLIF(EXCLUDED.emergency_name, ''), public.students.emergency_name),
    emergency_contact = COALESCE(NULLIF(EXCLUDED.emergency_contact, ''), public.students.emergency_contact),
    emergency_relation = COALESCE(NULLIF(EXCLUDED.emergency_relation, ''), public.students.emergency_relation),
    status = COALESCE(NULLIF(EXCLUDED.status, ''), public.students.status, 'Active'),
    metadata = COALESCE(public.students.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb);

  RETURN jsonb_build_object('id', v_id::text, 'email', v_email);
EXCEPTION
  WHEN unique_violation THEN
    IF SQLERRM LIKE '%students_registration_id_key%' THEN
      UPDATE public.students
      SET
        email = v_email,
        full_name = COALESCE(NULLIF(trim(p_row->>'full_name'), ''), full_name),
        gender = COALESCE(NULLIF(trim(p_row->>'gender'), ''), gender),
        parent_name = COALESCE(NULLIF(trim(p_row->>'parent_name'), ''), parent_name),
        contact_number = COALESCE(NULLIF(trim(p_row->>'contact_number'), ''), contact_number),
        university_name = CASE
          WHEN p_row ? 'university_name' THEN NULLIF(trim(p_row->>'university_name'), '')
          ELSE university_name
        END,
        college_name = CASE
          WHEN p_row ? 'college_name' THEN NULLIF(trim(p_row->>'college_name'), '')
          ELSE college_name
        END,
        degree = CASE WHEN p_row ? 'degree' THEN NULLIF(trim(p_row->>'degree'), '') ELSE degree END,
        department = CASE
          WHEN p_row ? 'department' THEN NULLIF(trim(p_row->>'department'), '')
          ELSE department
        END,
        academic_session = CASE
          WHEN p_row ? 'academic_session' THEN NULLIF(trim(p_row->>'academic_session'), '')
          ELSE academic_session
        END,
        class_semester = CASE
          WHEN p_row ? 'class_semester' THEN NULLIF(trim(p_row->>'class_semester'), '')
          ELSE class_semester
        END,
        roll_number = CASE
          WHEN p_row ? 'roll_number' THEN NULLIF(trim(p_row->>'roll_number'), '')
          ELSE roll_number
        END,
        course = CASE WHEN p_row ? 'course' THEN NULLIF(trim(p_row->>'course'), '') ELSE course END,
        internship_domain = CASE
          WHEN p_row ? 'internship_domain' OR p_row ? 'course' THEN NULLIF(trim(COALESCE(p_row->>'internship_domain', p_row->>'course')), '')
          ELSE internship_domain
        END,
        internship_duration = COALESCE(NULLIF(trim(p_row->>'internship_duration'), ''), internship_duration),
        joining_date = COALESCE(NULLIF(trim(p_row->>'joining_date'), ''), joining_date),
        completion_date = COALESCE(NULLIF(trim(p_row->>'completion_date'), ''), completion_date),
        emergency_name = COALESCE(NULLIF(trim(p_row->>'emergency_name'), ''), emergency_name),
        emergency_contact = COALESCE(NULLIF(trim(p_row->>'emergency_contact'), ''), emergency_contact),
        emergency_relation = COALESCE(NULLIF(trim(p_row->>'emergency_relation'), ''), emergency_relation),
        status = COALESCE(NULLIF(trim(p_row->>'status'), ''), status, 'Active'),
        metadata = COALESCE(metadata, '{}'::jsonb) || v_meta
      WHERE id = v_id;

      RETURN jsonb_build_object('id', v_id::text, 'email', v_email);
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.student_update_own_profile(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_update_own_profile(jsonb) TO authenticated;
