-- GRANT permissions to fix the "Student details not showing" issue
-- This ensures the has_role function can be executed by authenticated admins
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO service_role;

-- Re-apply RLS policies for students table to ensure visibility for admins
DROP POLICY IF EXISTS "Admins view all students" ON public.students;
CREATE POLICY "Admins view all students" ON public.students 
FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- Re-apply RLS policies for user_roles table (has_role depends on this)
DROP POLICY IF EXISTS "Admins view all roles" ON public.user_roles;
CREATE POLICY "Admins view all roles" ON public.user_roles 
FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- Grant select on all tables to authenticated users (RLS will still filter results)
GRANT SELECT ON public.students TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
