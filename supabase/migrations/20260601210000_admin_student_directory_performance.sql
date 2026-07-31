-- Fix student directory timeout (57014): bypass heavy RLS for admin/staff paginated list.

CREATE OR REPLACE FUNCTION public.assert_may_admin_list_students()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF public.auth_is_referral_partner_scoped_only(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN (
        'admin'::public.app_role,
        'super_admin'::public.app_role,
        'staff'::public.app_role
      )
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_count_students_directory(
  p_search text DEFAULT NULL,
  p_domain text DEFAULT NULL,
  p_university text DEFAULT NULL,
  p_college text DEFAULT NULL,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL
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
    AND (p_domain IS NULL OR p_domain = '' OR p_domain = 'all' OR s.internship_domain = p_domain)
    AND (p_university IS NULL OR p_university = '' OR p_university = 'all' OR s.university_name = p_university)
    AND (p_college IS NULL OR p_college = '' OR p_college = 'all' OR s.college_name = p_college)
    AND (p_start IS NULL OR s.created_at >= p_start)
    AND (p_end IS NULL OR s.created_at <= p_end)
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
  AND (p_start IS NULL OR s.created_at >= p_start)
  AND (p_end IS NULL OR s.created_at <= p_end)
  ORDER BY s.created_at DESC NULLS LAST, s.id DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_students_light()
RETURNS TABLE (
  id uuid,
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
    s.id,
    s.full_name,
    s.email,
    s.college_name,
    s.university_name,
    s.created_at,
    s.status,
    s.internship_domain,
    s.registration_id
  FROM public.students s
  ORDER BY s.created_at DESC NULLS LAST, s.id DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_site_visit_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '8s'
AS $$
DECLARE
  v_since timestamptz := now() - interval '90 days';
BEGIN
  PERFORM public.assert_may_admin_list_students();

  RETURN jsonb_build_object(
    'total_visits', (
      SELECT count(*)::bigint
      FROM public.site_visits
      WHERE created_at >= v_since
    ),
    'unique_visitors', (
      SELECT count(DISTINCT visitor_id)::bigint
      FROM public.site_visits
      WHERE created_at >= v_since
        AND visitor_id IS NOT NULL
        AND trim(visitor_id) <> ''
    )
  );
END;
$$;

CREATE INDEX IF NOT EXISTS idx_students_created_at_id_desc
  ON public.students (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_site_visits_created_at
  ON public.site_visits (created_at DESC);

REVOKE ALL ON FUNCTION public.assert_may_admin_list_students() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_count_students_directory(text, text, text, text, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_students_directory(integer, integer, text, text, text, text, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_students_light() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_site_visit_stats() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_count_students_directory(text, text, text, text, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_students_directory(integer, integer, text, text, text, text, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_students_light() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_site_visit_stats() TO authenticated;
