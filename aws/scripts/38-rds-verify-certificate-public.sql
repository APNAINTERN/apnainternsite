-- Public certificate verification for home /verify page (RDS-adapted).
-- students.id + metadata are text; certificates.user_id is uuid.

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
  v_meta jsonb := '{}'::jsonb;
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
    LEFT JOIN public.academic_info ai ON ai.user_id::text = s.id
    WHERE (
      lower(trim(coalesce(s.full_name, ''))) = lower(v_name)
      OR lower(trim(coalesce(s.full_name, ''))) LIKE '%' || lower(v_name) || '%'
    )
    AND (
      lower(trim(coalesce(s.roll_number, ''))) = lower(v_roll)
      OR lower(trim(coalesce(s.registration_id, ''))) = lower(v_roll)
      OR lower(trim(coalesce(ai.roll_number, ''))) = lower(v_roll)
    )
    ORDER BY s.created_at DESC NULLS LAST
    LIMIT 1;

    IF FOUND THEN
      SELECT c.*
      INTO v_cert
      FROM public.certificates c
      WHERE c.user_id::text = v_student.id
      ORDER BY c.issue_date DESC, c.created_at DESC
      LIMIT 1;
    END IF;
  ELSIF v_query IS NOT NULL THEN
    SELECT c.*
    INTO v_cert
    FROM public.certificates c
    WHERE lower(trim(c.certificate_id)) = lower(v_query)
    LIMIT 1;

    IF NOT FOUND THEN
      SELECT s.*
      INTO v_student
      FROM public.students s
      WHERE lower(trim(coalesce(s.email, ''))) = lower(v_query)
         OR trim(coalesce(s.contact_number, '')) = v_query
         OR lower(trim(coalesce(s.registration_id, ''))) = lower(v_query)
      ORDER BY s.created_at DESC NULLS LAST
      LIMIT 1;

      IF FOUND THEN
        SELECT c.*
        INTO v_cert
        FROM public.certificates c
        WHERE c.user_id::text = v_student.id
           OR lower(trim(c.certificate_id)) = lower(trim(coalesce(v_student.registration_id, '')))
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
    WHERE s.id = v_cert.user_id::text
    LIMIT 1;
  END IF;

  IF v_student.id IS NOT NULL THEN
    v_meta := public.safe_text_to_jsonb(v_student.metadata);

    SELECT ai.roll_number
    INTO v_academic_roll
    FROM public.academic_info ai
    WHERE ai.user_id::text = v_student.id
    LIMIT 1;

    BEGIN
      SELECT count(*)::integer
      INTO v_attendance_days
      FROM public.attendance a
      WHERE a.student_id::text = v_student.id;
    EXCEPTION WHEN others THEN
      v_attendance_days := 0;
    END;

    BEGIN
      SELECT max(
        (sub.score::numeric / greatest(1, coalesce(asg.total_marks, 1)::numeric)) * 100
      )
      INTO v_best_marks
      FROM public.assignment_submissions sub
      JOIN public.assignments asg ON asg.id = sub.assignment_id
      WHERE sub.student_id::text = v_student.id
        AND sub.grading_status = 'graded';
    EXCEPTION WHEN others THEN
      v_best_marks := NULL;
    END;
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
          v_meta
        ),
        'registration_id', v_student.registration_id,
        'college_name', v_student.college_name,
        'university_name', v_student.university_name,
        'academic_session', v_student.academic_session,
        'degree', v_student.degree,
        'course', v_student.course,
        'internship_domain', v_student.internship_domain,
        'internship_mode', coalesce(
          nullif(trim(v_meta->>'internship_mode'), ''),
          nullif(trim(v_meta->>'internshipMode'), ''),
          'Online'
        ),
        'metadata', v_meta
      )
    END,
    'attendance_days', coalesce(v_attendance_days, 0),
    'best_marks_percent', v_best_marks
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_certificate_public(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_certificate_public(text, text, text) TO anon, authenticated;
