-- Staff cannot log in / reach /staff-dashboard when "Admins view all roles" on user_roles
-- only uses EXISTS (SELECT 1 FROM user_roles ...). That subquery is subject to RLS, so
-- staff cannot see their own row → empty roles → login blocked or useAuth defaults to student.
--
-- Run in Supabase SQL Editor (safe to re-run).

DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;
CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all roles" ON public.user_roles;
CREATE POLICY "Admins view all roles" ON public.user_roles
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'staff'::public.app_role)
  );

GRANT SELECT ON public.user_roles TO authenticated;
