-- Bypass RLS for student self-registration and staff/admin enrollment when JWT is present.

CREATE OR REPLACE FUNCTION public.upsert_student_directory_row(p_row jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := NULLIF(trim(p_row->>'id'), '')::uuid;
  v_staff boolean := false;
  v_reg text;
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Student id required';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_staff := EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN (
        'admin'::public.app_role,
        'super_admin'::public.app_role,
        'staff'::public.app_role
      )
  );

  IF auth.uid() IS DISTINCT FROM v_id AND NOT v_staff THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN public.complete_student_registration(p_row, NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_student_directory_row(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_student_directory_row(jsonb) TO anon, authenticated;
