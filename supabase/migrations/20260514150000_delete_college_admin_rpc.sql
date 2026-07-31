-- Allow admins to revoke college portal access (DB + role). Auth user remains;
-- student role is restored so the account is not left with zero roles.

CREATE OR REPLACE FUNCTION public.delete_college_admin(target_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean := EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  );
BEGIN
  IF NOT v_ok THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'target_user_id is required' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.college_admin_assignments WHERE user_id = target_user_id;

  DELETE FROM public.user_roles
  WHERE user_id = target_user_id
    AND role = 'college_admin'::public.app_role;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'student'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_college_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_college_admin(uuid) TO authenticated;
