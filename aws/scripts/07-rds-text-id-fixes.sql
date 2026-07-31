-- RDS gap-fill part 7: text student ids (CSV import), site_visits, notification + assignment RPC fixes.

CREATE TABLE IF NOT EXISTS public.site_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id TEXT NOT NULL,
  page_path TEXT,
  referrer TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_visits_created_at
  ON public.site_visits (created_at DESC);

-- ─── Light student list (students.id is text on RDS CSV import) ───────────────
DROP FUNCTION IF EXISTS public.admin_list_students_light();

CREATE OR REPLACE FUNCTION public.admin_list_students_light()
RETURNS TABLE (
  id text,
  full_name text,
  email text,
  college_name text,
  university_name text,
  created_at timestamptz,
  status text,
  internship_domain text,
  registration_id text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_may_admin_list_students();

  RETURN QUERY
  SELECT
    s.id::text,
    s.full_name,
    s.email,
    s.college_name,
    s.university_name,
    public.student_created_at_ts(s),
    s.status,
    s.internship_domain,
    s.registration_id
  FROM public.students s
  ORDER BY public.student_created_at_ts(s) DESC NULLS LAST, s.id DESC;
END;
$$;

-- ─── Attendance counts (join text student id ↔ uuid attendance.student_id) ───
DROP FUNCTION IF EXISTS public.admin_get_attendance_counts();

CREATE OR REPLACE FUNCTION public.admin_get_attendance_counts()
RETURNS TABLE(student_id text, day_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $$
BEGIN
  PERFORM public.assert_may_admin_list_students();

  RETURN QUERY
  WITH distinct_days AS (
    SELECT DISTINCT
      a.student_id::text AS sid,
      (a.marked_at AT TIME ZONE 'Asia/Kolkata')::date AS ist_date
    FROM public.attendance a
    WHERE a.marked_at IS NOT NULL
  )
  SELECT d.sid, COUNT(*)::bigint
  FROM distinct_days d
  JOIN public.students s ON s.id = d.sid
  WHERE
    CASE
      WHEN lower(trim(coalesce(s.university_name, ''))) ~ 'bnmu|bhupendra\s*narayan\s*mandal'
        THEN d.ist_date BETWEEN DATE '2026-05-23' AND DATE '2026-06-21'
      WHEN lower(trim(coalesce(s.university_name, ''))) ~ 'lnmu|lalit\s*narayan|mithila'
        THEN d.ist_date BETWEEN DATE '2026-06-01' AND DATE '2026-06-20'
      ELSE TRUE
    END
  GROUP BY d.sid;
END;
$$;

-- ─── Student unread notifications ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.student_unread_notification_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::bigint
  FROM public.notification_deliveries d
  JOIN public.notifications n ON n.id = d.notification_id
  WHERE d.user_id::text = auth.uid()::text
    AND d.read_at IS NULL
    AND n.status = 'published';
$$;

-- Helper: jsonb / text → text[] for assignment target columns on RDS
CREATE OR REPLACE FUNCTION public.rds_jsonb_to_text_array(p_val jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_val IS NULL OR p_val = 'null'::jsonb THEN NULL::text[]
    WHEN jsonb_typeof(p_val) = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(p_val))
    ELSE ARRAY[trim(both '"' from p_val::text)]
  END;
$$;

CREATE OR REPLACE FUNCTION public.rds_text_to_text_array(p_val text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_val IS NULL OR trim(p_val) = '' THEN NULL::text[]
    WHEN left(trim(p_val), 1) = '[' THEN public.rds_jsonb_to_text_array(p_val::jsonb)
    ELSE ARRAY[p_val]
  END;
$$;

CREATE OR REPLACE FUNCTION public.student_matches_class_targets(
  p_student_id uuid,
  p_target_universities text[],
  p_target_colleges text[],
  p_target_domains text[],
  p_domain_id uuid,
  p_target_modes text[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student public.students%ROWTYPE;
  v_domain_name text;
  v_college_names text[];
BEGIN
  IF public.class_targets_are_universal(
    p_target_universities, p_target_colleges, p_target_domains, p_target_modes, p_domain_id
  ) THEN
    RETURN true;
  END IF;

  SELECT * INTO v_student FROM public.students s WHERE s.id = p_student_id::text;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_target_modes IS NOT NULL AND cardinality(p_target_modes) > 0 THEN
    IF NOT (public.student_record_internship_mode(v_student) = ANY (p_target_modes)) THEN
      RETURN false;
    END IF;
  END IF;

  IF p_target_domains IS NOT NULL AND cardinality(p_target_domains) > 0 THEN
    IF NOT (
      COALESCE(v_student.internship_domain, '') = ANY (p_target_domains)
      OR COALESCE(v_student.course, '') = ANY (p_target_domains)
    ) THEN
      RETURN false;
    END IF;
  ELSIF p_domain_id IS NOT NULL THEN
    SELECT d.name INTO v_domain_name
    FROM public.internship_domains d
    WHERE d.id = p_domain_id;
    IF v_domain_name IS NOT NULL
      AND COALESCE(v_student.internship_domain, v_student.course, '') <> v_domain_name THEN
      RETURN false;
    END IF;
  END IF;

  IF p_target_colleges IS NOT NULL AND cardinality(p_target_colleges) > 0 THEN
    IF NOT (COALESCE(v_student.college_name, '') = ANY (p_target_colleges)) THEN
      RETURN false;
    END IF;
  END IF;

  IF p_target_universities IS NOT NULL AND cardinality(p_target_universities) > 0 THEN
    SELECT array_agg(c.name)
    INTO v_college_names
    FROM public.colleges c
    JOIN public.universities u ON u.id = c.university_id
    WHERE u.name = ANY (p_target_universities);

    IF NOT (
      COALESCE(v_student.university_name, '') = ANY (p_target_universities)
      OR (
        v_college_names IS NOT NULL
        AND COALESCE(v_student.college_name, '') = ANY (v_college_names)
      )
    ) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

-- ─── Assignments list (jsonb target columns + text student ids) ───────────────
CREATE OR REPLACE FUNCTION public.list_assignments_for_student()
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  duration_minutes integer,
  total_marks integer,
  passing_marks integer,
  due_at timestamptz,
  created_at timestamptz,
  has_submission boolean,
  submission_score integer,
  submission_passed boolean,
  grading_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := auth.uid()::text;
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.title,
    a.description,
    a.duration_minutes::integer,
    a.total_marks::integer,
    a.passing_marks::integer,
    a.due_at,
    a.created_at,
    (s.id IS NOT NULL) AS has_submission,
    s.score::integer AS submission_score,
    s.is_passed AS submission_passed,
    COALESCE(s.grading_status, 'graded')::text AS grading_status
  FROM public.assignments a
  LEFT JOIN public.assignment_submissions s
    ON s.assignment_id = a.id AND s.student_id::text = v_uid
  WHERE a.is_active = true
    AND (
      public.class_targets_are_universal(
        public.rds_jsonb_to_text_array(a.target_universities),
        public.rds_text_to_text_array(a.target_colleges),
        public.rds_jsonb_to_text_array(a.target_domains),
        public.rds_text_to_text_array(a.target_modes),
        NULL
      )
      OR public.student_matches_class_targets(
        auth.uid(),
        public.rds_jsonb_to_text_array(a.target_universities),
        public.rds_text_to_text_array(a.target_colleges),
        public.rds_jsonb_to_text_array(a.target_domains),
        NULL::uuid,
        public.rds_text_to_text_array(a.target_modes)
      )
      OR (
        a.target_universities IS NULL
        AND a.target_colleges IS NULL
        AND a.target_domains IS NULL
      )
    )
  ORDER BY a.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.student_matches_class_targets(uuid, text[], text[], text[], uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_students_light() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_attendance_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_unread_notification_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_assignments_for_student() TO authenticated;
