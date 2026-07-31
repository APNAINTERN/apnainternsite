-- Admin-only: resolve auth.users.id by email when provisioning promoter portals for
-- existing referral partners whose email already has an Auth account (e.g. student).

CREATE OR REPLACE FUNCTION public.resolve_auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_ok boolean := EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin'::public.app_role, 'super_admin'::public.app_role, 'staff'::public.app_role)
  );
  v_uid uuid;
BEGIN
  IF NOT v_ok THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  IF p_email IS NULL OR trim(p_email) = '' THEN
    RETURN NULL;
  END IF;

  SELECT u.id INTO v_uid
  FROM auth.users u
  WHERE lower(trim(u.email)) = lower(trim(p_email))
  LIMIT 1;

  RETURN v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_auth_user_id_by_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_auth_user_id_by_email(text) TO authenticated;
