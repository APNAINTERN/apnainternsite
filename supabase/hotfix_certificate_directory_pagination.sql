-- Paginated certificate directory for admin Download & verify (30k+ rows).
-- Run in Supabase SQL editor after admin student directory hotfixes.

CREATE OR REPLACE FUNCTION public.admin_count_certificates_directory(
  p_search text DEFAULT NULL,
  p_universities text[] DEFAULT NULL,
  p_colleges text[] DEFAULT NULL,
  p_domain text DEFAULT NULL,
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
    FROM public.certificates c
    LEFT JOIN public.students s ON s.id = c.user_id
    WHERE (
      v_search IS NULL
      OR c.student_name ILIKE '%' || v_search || '%'
      OR c.certificate_id ILIKE '%' || v_search || '%'
      OR s.full_name ILIKE '%' || v_search || '%'
      OR s.email ILIKE '%' || v_search || '%'
      OR s.registration_id ILIKE '%' || v_search || '%'
      OR s.roll_number ILIKE '%' || v_search || '%'
    )
    AND (
      p_universities IS NULL
      OR cardinality(p_universities) = 0
      OR s.university_name = ANY (p_universities)
    )
    AND (
      p_colleges IS NULL
      OR cardinality(p_colleges) = 0
      OR s.college_name = ANY (p_colleges)
    )
    AND (
      p_domain IS NULL
      OR p_domain = ''
      OR p_domain = 'all'
      OR s.internship_domain = p_domain
      OR s.course = p_domain
    )
    AND (
      v_mode IS NULL
      OR v_mode = 'all'
      OR s.id IS NULL
      OR public.student_record_internship_mode(s) = v_mode
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_certificates_directory(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL,
  p_universities text[] DEFAULT NULL,
  p_colleges text[] DEFAULT NULL,
  p_domain text DEFAULT NULL,
  p_mode text DEFAULT NULL
)
RETURNS SETOF public.certificates
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(trim(p_search), '');
  v_mode text := NULLIF(trim(p_mode), '');
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 50), 500));
  v_offset integer := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
  PERFORM public.assert_may_admin_list_students();

  RETURN QUERY
  SELECT c.*
  FROM public.certificates c
  LEFT JOIN public.students s ON s.id = c.user_id
  WHERE (
    v_search IS NULL
    OR c.student_name ILIKE '%' || v_search || '%'
    OR c.certificate_id ILIKE '%' || v_search || '%'
    OR s.full_name ILIKE '%' || v_search || '%'
    OR s.email ILIKE '%' || v_search || '%'
    OR s.registration_id ILIKE '%' || v_search || '%'
    OR s.roll_number ILIKE '%' || v_search || '%'
  )
  AND (
    p_universities IS NULL
    OR cardinality(p_universities) = 0
    OR s.university_name = ANY (p_universities)
  )
  AND (
    p_colleges IS NULL
    OR cardinality(p_colleges) = 0
    OR s.college_name = ANY (p_colleges)
  )
  AND (
    p_domain IS NULL
    OR p_domain = ''
    OR p_domain = 'all'
    OR s.internship_domain = p_domain
    OR s.course = p_domain
  )
  AND (
    v_mode IS NULL
    OR v_mode = 'all'
    OR s.id IS NULL
    OR public.student_record_internship_mode(s) = v_mode
  )
  ORDER BY c.created_at DESC NULLS LAST, c.id DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_count_certificates_directory(text, text[], text[], text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_certificates_directory(integer, integer, text, text[], text[], text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_count_certificates_directory(text, text[], text[], text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_certificates_directory(integer, integer, text, text[], text[], text, text) TO authenticated;
