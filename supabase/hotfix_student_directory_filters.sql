-- Fix student directory filters (domain / university / college / mode).
-- Run in Supabase SQL Editor after hotfix_admin_student_directory_performance.sql
-- and/or hotfix_internship_mode_filtering.sql.

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
      NULLIF(trim(s.metadata->>'internship_mode'), ''),
      NULLIF(trim(s.metadata->>'internshipMode'), '')
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.student_matches_directory_filters(
  s public.students,
  p_domain text,
  p_university text,
  p_college text,
  p_mode text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_domain text := NULLIF(trim(p_domain), '');
  v_university text := NULLIF(trim(p_university), '');
  v_college text := NULLIF(trim(p_college), '');
  v_mode text := NULLIF(trim(p_mode), '');
BEGIN
  IF v_domain IS NOT NULL AND lower(v_domain) <> 'all' THEN
    IF NOT (
      trim(COALESCE(s.internship_domain, '')) = v_domain
      OR trim(COALESCE(s.course, '')) = v_domain
      OR trim(COALESCE(s.metadata->>'internship_domain', '')) = v_domain
      OR trim(COALESCE(s.metadata->>'course', '')) = v_domain
    ) THEN
      RETURN false;
    END IF;
  END IF;

  IF v_college IS NOT NULL AND lower(v_college) <> 'all' THEN
    IF trim(COALESCE(s.college_name, '')) <> v_college THEN
      RETURN false;
    END IF;
  END IF;

  IF v_university IS NOT NULL AND lower(v_university) <> 'all' THEN
    IF NOT (
      trim(COALESCE(s.university_name, '')) = v_university
      OR EXISTS (
        SELECT 1
        FROM public.colleges c
        JOIN public.universities u ON u.id = c.university_id
        WHERE trim(u.name) = v_university
          AND trim(c.name) = trim(COALESCE(s.college_name, ''))
      )
    ) THEN
      RETURN false;
    END IF;
  END IF;

  IF v_mode IS NOT NULL AND lower(v_mode) <> 'all' THEN
    IF public.student_record_internship_mode(s) <> v_mode THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_count_students_directory(text, text, text, text, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.admin_count_students_directory(text, text, text, text, timestamptz, timestamptz, text);

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
    AND public.student_matches_directory_filters(s, p_domain, p_university, p_college, p_mode)
    AND (p_start IS NULL OR s.created_at >= p_start)
    AND (p_end IS NULL OR s.created_at <= p_end)
  );
END;
$$;

DROP FUNCTION IF EXISTS public.admin_list_students_directory(integer, integer, text, text, text, text, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.admin_list_students_directory(integer, integer, text, text, text, text, timestamptz, timestamptz, text);

CREATE OR REPLACE FUNCTION public.admin_list_students_directory(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL,
  p_domain text DEFAULT NULL,
  p_university text DEFAULT NULL,
  p_college text DEFAULT NULL,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL,
  p_mode text DEFAULT NULL
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
  AND public.student_matches_directory_filters(s, p_domain, p_university, p_college, p_mode)
  AND (p_start IS NULL OR s.created_at >= p_start)
  AND (p_end IS NULL OR s.created_at <= p_end)
  ORDER BY s.created_at DESC NULLS LAST, s.id DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.student_matches_directory_filters(public.students, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_count_students_directory(text, text, text, text, timestamptz, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_students_directory(integer, integer, text, text, text, text, timestamptz, timestamptz, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_count_students_directory(text, text, text, text, timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_students_directory(integer, integer, text, text, text, text, timestamptz, timestamptz, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
