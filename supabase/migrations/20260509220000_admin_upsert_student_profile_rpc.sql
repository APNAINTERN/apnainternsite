-- Student-directory edits must sync auth.users-linked profiles without relying on client RLS for INSERT/UPDATE on other users' rows.

CREATE OR REPLACE FUNCTION public.admin_upsert_student_profile(
  p_id uuid,
  p_full_name text,
  p_email text,
  p_contact_number text DEFAULT '',
  p_gender text DEFAULT '',
  p_parent_name text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin'::public.app_role, 'super_admin'::public.app_role, 'staff'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO public.profiles (
    id,
    full_name,
    email,
    contact_number,
    gender,
    parent_name
  )
  VALUES (
    p_id,
    COALESCE(NULLIF(trim(p_full_name), ''), 'Student'),
    lower(trim(p_email)),
    COALESCE(p_contact_number, ''),
    COALESCE(p_gender, ''),
    COALESCE(p_parent_name, '')
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    contact_number = EXCLUDED.contact_number,
    gender = EXCLUDED.gender,
    parent_name = EXCLUDED.parent_name;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_student_profile(uuid, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_student_profile(uuid, text, text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.admin_upsert_student_profile IS 'Lets admins/staff upsert learner profiles without permissive profiles RLS on every environment.';
