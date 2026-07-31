-- RDS gap-fill part 5: student directory RPCs (text created_at from CSV import + mode helpers).

CREATE OR REPLACE FUNCTION public.normalize_student_internship_mode(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_raw IS NULL OR trim(p_raw) = '' THEN 'Online'
    WHEN lower(trim(p_raw)) LIKE 'on%' THEN 'Online'
    WHEN lower(trim(p_raw)) LIKE 'off%' THEN 'Offline'
    WHEN lower(trim(p_raw)) LIKE 'hy%' OR lower(trim(p_raw)) LIKE 'bl%' THEN 'Hybrid'
    ELSE initcap(trim(p_raw))
  END;
$$;

CREATE OR REPLACE FUNCTION public.student_record_internship_mode(s public.students)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT public.normalize_student_internship_mode(
    COALESCE(
      NULLIF(trim((s.metadata::jsonb)->>'internship_mode'), ''),
      NULLIF(trim((s.metadata::jsonb)->>'internshipMode'), '')
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.student_created_at_ts(s public.students)
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(trim(s.created_at::text), '')::timestamptz;
$$;

CREATE OR REPLACE FUNCTION public.admin_count_students_directory(
  p_search text DEFAULT NULL,
  p_domain text DEFAULT NULL,
  p_university text DEFAULT NULL,
  p_college text DEFAULT NULL,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL,
  p_mode text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(trim(p_search), '');
  v_mode text := NULLIF(trim(p_mode), '');
BEGIN
  PERFORM public.assert_may_admin_list_students();

  RETURN (
    SELECT count(*)::bigint
    FROM public.students s
    WHERE (
      v_search IS NULL
      OR s.full_name ILIKE '%' || v_search || '%'
      OR s.email ILIKE '%' || v_search || '%'
      OR s.registration_id ILIKE '%' || v_search || '%'
      OR s.contact_number ILIKE '%' || v_search || '%'
      OR s.roll_number ILIKE '%' || v_search || '%'
      OR s.college_name ILIKE '%' || v_search || '%'
      OR s.parent_name ILIKE '%' || v_search || '%'
    )
    AND (p_domain IS NULL OR p_domain = '' OR p_domain = 'all' OR s.internship_domain = p_domain)
    AND (p_university IS NULL OR p_university = '' OR p_university = 'all' OR s.university_name = p_university)
    AND (p_college IS NULL OR p_college = '' OR p_college = 'all' OR s.college_name = p_college)
    AND (v_mode IS NULL OR v_mode = 'all' OR public.student_record_internship_mode(s) = v_mode)
    AND (p_start IS NULL OR public.student_created_at_ts(s) >= p_start)
    AND (p_end IS NULL OR public.student_created_at_ts(s) <= p_end)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_students_directory(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL,
  p_domain text DEFAULT NULL,
  p_university text DEFAULT NULL,
  p_college text DEFAULT NULL,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL
)
RETURNS SETOF public.students
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(trim(p_search), '');
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 50), 500));
  v_offset integer := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
  PERFORM public.assert_may_admin_list_students();

  RETURN QUERY
  SELECT s.*
  FROM public.students s
  WHERE (
    v_search IS NULL
    OR s.full_name ILIKE '%' || v_search || '%'
    OR s.email ILIKE '%' || v_search || '%'
    OR s.registration_id ILIKE '%' || v_search || '%'
    OR s.contact_number ILIKE '%' || v_search || '%'
    OR s.roll_number ILIKE '%' || v_search || '%'
    OR s.college_name ILIKE '%' || v_search || '%'
    OR s.parent_name ILIKE '%' || v_search || '%'
  )
  AND (p_domain IS NULL OR p_domain = '' OR p_domain = 'all' OR s.internship_domain = p_domain)
  AND (p_university IS NULL OR p_university = '' OR p_university = 'all' OR s.university_name = p_university)
  AND (p_college IS NULL OR p_college = '' OR p_college = 'all' OR s.college_name = p_college)
  AND (p_start IS NULL OR public.student_created_at_ts(s) >= p_start)
  AND (p_end IS NULL OR public.student_created_at_ts(s) <= p_end)
  ORDER BY public.student_created_at_ts(s) DESC NULLS LAST, s.id
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_count_students_directory(text, text, text, text, timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_students_directory(integer, integer, text, text, text, text, timestamptz, timestamptz) TO authenticated;
