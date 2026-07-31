-- Public certificate verification: return display-safe student fields for anon users.

CREATE OR REPLACE FUNCTION public.is_ezyintern_registration_id(p_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(trim(p_value), '') ~* '^EZY/[0-9]{4}/INT/'
    OR coalesce(trim(p_value), '') ~* '^EZY/PENDING/'
    OR coalesce(trim(p_value), '') ~* '/INT/PENDING$';
$$;

CREATE OR REPLACE FUNCTION public.pick_university_roll_no(
  p_roll text,
  p_academic_roll text,
  p_meta jsonb
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  candidate text;
  candidates text[];
BEGIN
  candidates := ARRAY[
    p_roll,
    p_academic_roll,
    p_meta->>'rollNo',
    p_meta->>'university_roll',
    p_meta->>'roll_number',
    p_meta->>'universityRollNo'
  ];

  FOREACH candidate IN ARRAY candidates LOOP
    IF coalesce(trim(candidate), '') <> ''
       AND NOT public.is_ezyintern_registration_id(candidate) THEN
      RETURN trim(candidate);
    END IF;
  END LOOP;

  RETURN '';
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_certificate_public(
  p_query text DEFAULT NULL,
  p_student_name text DEFAULT NULL,
  p_roll_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cert public.certificates%ROWTYPE;
  v_student public.students%ROWTYPE;
  v_academic_roll text;
  v_attendance_days integer := 0;
  v_best_marks numeric;
  v_query text := nullif(trim(p_query), '');
  v_name text := nullif(trim(p_student_name), '');
  v_roll text := nullif(trim(p_roll_number), '');
BEGIN
  IF v_name IS NOT NULL AND v_roll IS NOT NULL THEN
    SELECT s.*
    INTO v_student
    FROM public.students s
    LEFT JOIN public.academic_info ai ON ai.user_id = s.id
    WHERE (
      lower(trim(coalesce(s.full_name, ''))) = lower(v_name)
      OR lower(trim(coalesce(s.full_name, ''))) LIKE '%' || lower(v_name) || '%'
    )
    AND (
      lower(trim(coalesce(s.roll_number, ''))) = lower(v_roll)
      OR lower(trim(coalesce(s.registration_id, ''))) = lower(v_roll)
      OR lower(trim(coalesce(ai.roll_number, ''))) = lower(v_roll)
    )
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF FOUND THEN
      SELECT c.*
      INTO v_cert
      FROM public.certificates c
      WHERE c.user_id = v_student.id
      ORDER BY c.issue_date DESC, c.created_at DESC
      LIMIT 1;
    END IF;
  ELSIF v_query IS NOT NULL THEN
    SELECT c.*
    INTO v_cert
    FROM public.certificates c
    WHERE c.certificate_id = v_query
    LIMIT 1;

    IF NOT FOUND THEN
      SELECT s.*
      INTO v_student
      FROM public.students s
      WHERE lower(trim(coalesce(s.email, ''))) = lower(v_query)
         OR trim(coalesce(s.contact_number, '')) = v_query
      ORDER BY s.created_at DESC
      LIMIT 1;

      IF FOUND THEN
        SELECT c.*
        INTO v_cert
        FROM public.certificates c
        WHERE c.user_id = v_student.id
        ORDER BY c.issue_date DESC, c.created_at DESC
        LIMIT 1;
      END IF;
    END IF;
  ELSE
    RETURN jsonb_build_object('found', false);
  END IF;

  IF v_cert.id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  IF v_student.id IS NULL AND v_cert.user_id IS NOT NULL THEN
    SELECT s.*
    INTO v_student
    FROM public.students s
    WHERE s.id = v_cert.user_id
    LIMIT 1;
  END IF;

  IF v_student.id IS NOT NULL THEN
    SELECT ai.roll_number
    INTO v_academic_roll
    FROM public.academic_info ai
    WHERE ai.user_id = v_student.id
    LIMIT 1;

    SELECT count(*)::integer
    INTO v_attendance_days
    FROM public.attendance a
    WHERE a.student_id = v_student.id;

    SELECT max(
      (sub.score::numeric / greatest(1, coalesce(asg.total_marks, 1)::numeric)) * 100
    )
    INTO v_best_marks
    FROM public.assignment_submissions sub
    JOIN public.assignments asg ON asg.id = sub.assignment_id
    WHERE sub.student_id = v_student.id
      AND sub.grading_status = 'graded';
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'cert', jsonb_build_object(
      'id', v_cert.id,
      'certificate_id', v_cert.certificate_id,
      'student_name', v_cert.student_name,
      'internship_name', v_cert.internship_name,
      'duration', v_cert.duration,
      'display_overrides', coalesce(v_cert.display_overrides, '{}'::jsonb),
      'status', v_cert.status,
      'issue_date', v_cert.issue_date,
      'created_at', v_cert.created_at,
      'user_id', v_cert.user_id
    ),
    'student', CASE
      WHEN v_student.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', v_student.id,
        'full_name', v_student.full_name,
        'parent_name', v_student.parent_name,
        'roll_number', public.pick_university_roll_no(
          v_student.roll_number,
          v_academic_roll,
          coalesce(v_student.metadata, '{}'::jsonb)
        ),
        'registration_id', v_student.registration_id,
        'college_name', v_student.college_name,
        'university_name', v_student.university_name,
        'academic_session', v_student.academic_session,
        'degree', v_student.degree,
        'course', v_student.course,
        'internship_domain', v_student.internship_domain,
        'internship_mode', coalesce(
          nullif(trim(v_student.metadata->>'internship_mode'), ''),
          nullif(trim(v_student.metadata->>'internshipMode'), ''),
          'Online'
        ),
        'metadata', coalesce(v_student.metadata, '{}'::jsonb)
      )
    END,
    'attendance_days', coalesce(v_attendance_days, 0),
    'best_marks_percent', v_best_marks
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_certificate_public(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_certificate_public(text, text, text) TO anon, authenticated;
