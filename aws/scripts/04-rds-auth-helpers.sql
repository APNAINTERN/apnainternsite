-- RDS gap-fill part 4: auth helpers required by admin/student RPCs (assert_may_admin_list_students, RLS).

CREATE OR REPLACE FUNCTION public.auth_is_referral_partner_scoped_only(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _uid
      AND ur.role = 'referral_partner'::public.app_role
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur2
    WHERE ur2.user_id = _uid
      AND ur2.role IN (
        'admin'::public.app_role,
        'super_admin'::public.app_role,
        'staff'::public.app_role,
        'college_admin'::public.app_role
      )
  );
$$;

REVOKE ALL ON FUNCTION public.auth_is_referral_partner_scoped_only(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_referral_partner_scoped_only(uuid) TO anon, authenticated;
