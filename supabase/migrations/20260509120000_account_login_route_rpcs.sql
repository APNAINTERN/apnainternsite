-- Pre-login routing: block portal accounts on /login and student-only on /admin/login
-- without creating an auth session. Run via Supabase migrations or SQL editor.

CREATE OR REPLACE FUNCTION public.account_requires_admin_login(check_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE lower(trim(u.email)) = lower(trim(check_email))
      AND (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = u.id
            AND ur.role IN (
              'admin'::public.app_role,
              'super_admin'::public.app_role,
              'staff'::public.app_role
            )
        )
        OR EXISTS (SELECT 1 FROM public.cybercafe_profiles c WHERE c.id = u.id)
        OR COALESCE((u.raw_user_meta_data ->> 'is_staff')::boolean, false) = true
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.account_is_student_only(check_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE lower(trim(u.email)) = lower(trim(check_email))
      AND NOT (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = u.id
            AND ur.role IN (
              'admin'::public.app_role,
              'super_admin'::public.app_role,
              'staff'::public.app_role
            )
        )
        OR EXISTS (SELECT 1 FROM public.cybercafe_profiles c WHERE c.id = u.id)
        OR COALESCE((u.raw_user_meta_data ->> 'is_staff')::boolean, false) = true
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.account_requires_admin_login(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_is_student_only(text) TO anon, authenticated;
