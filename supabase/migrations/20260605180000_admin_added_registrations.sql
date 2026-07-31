-- Added Registrations tab: fast paginated list (avoids RLS + metadata scan timeout 57014).

CREATE INDEX IF NOT EXISTS idx_students_admin_add_registration_created
  ON public.students (created_at DESC, id DESC)
  WHERE (metadata->>'source') = 'admin_add_registration';

CREATE OR REPLACE FUNCTION public.admin_count_added_registrations(p_search text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(trim(p_search), '');
BEGIN
  IF NOT public.caller_can_manage_student_directory() THEN
    RAISE EXCEPTION 'Access denied: admin or staff only';
  END IF;

  RETURN (
    SELECT count(*)::bigint
    FROM public.students s
    WHERE s.metadata->>'source' = 'admin_add_registration'
      AND (
        v_search IS NULL
        OR s.full_name ILIKE '%' || v_search || '%'
        OR s.email ILIKE '%' || v_search || '%'
        OR s.registration_id ILIKE '%' || v_search || '%'
        OR s.contact_number ILIKE '%' || v_search || '%'
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_added_registrations(
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  contact_number text,
  registration_id text,
  status text,
  created_at timestamptz,
  metadata jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(trim(p_search), '');
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 20), 200));
  v_offset integer := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
  IF NOT public.caller_can_manage_student_directory() THEN
    RAISE EXCEPTION 'Access denied: admin or staff only';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.email,
    s.full_name,
    s.contact_number,
    s.registration_id,
    s.status,
    s.created_at,
    s.metadata
  FROM public.students s
  WHERE s.metadata->>'source' = 'admin_add_registration'
    AND (
      v_search IS NULL
      OR s.full_name ILIKE '%' || v_search || '%'
      OR s.email ILIKE '%' || v_search || '%'
      OR s.registration_id ILIKE '%' || v_search || '%'
      OR s.contact_number ILIKE '%' || v_search || '%'
    )
  ORDER BY s.created_at DESC NULLS LAST, s.id DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

ALTER FUNCTION public.admin_count_added_registrations(text) SET statement_timeout = '15s';
ALTER FUNCTION public.admin_list_added_registrations(integer, integer, text) SET statement_timeout = '15s';

REVOKE ALL ON FUNCTION public.admin_count_added_registrations(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_added_registrations(integer, integer, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_count_added_registrations(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_added_registrations(integer, integer, text) TO authenticated;
