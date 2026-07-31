-- =============================================
-- COMPLETE FIX FOR ADMIN PANEL DATA VISIBILITY
-- Run this ENTIRE script in Supabase SQL Editor
-- =============================================

-- 1. Grant has_role function to authenticated users (required for RLS policies to work)
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO service_role;

-- 2. Fix students table - ensure admins can read all students
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view all students" ON public.students;
DROP POLICY IF EXISTS "Admins update all students" ON public.students;
DROP POLICY IF EXISTS "Admins delete students" ON public.students;

CREATE POLICY "Admins view all students" ON public.students 
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Admins update all students" ON public.students 
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Admins delete students" ON public.students 
  FOR DELETE USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Students view own record" ON public.students 
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Students insert own record" ON public.students 
  FOR INSERT WITH CHECK (auth.uid() = id);

-- 3. Fix user_roles table RLS so admin can read roles
DROP POLICY IF EXISTS "Admins view all roles" ON public.user_roles;
CREATE POLICY "Admins view all roles" ON public.user_roles 
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'super_admin') OR
    auth.uid() = user_id
  );

-- 4. Fix cybercafe_profiles table RLS
ALTER TABLE public.cybercafe_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage cybercafe profiles" ON public.cybercafe_profiles;
DROP POLICY IF EXISTS "Cybercafe can view own profile" ON public.cybercafe_profiles;
DROP POLICY IF EXISTS "Cybercafe can update own profile" ON public.cybercafe_profiles;
DROP POLICY IF EXISTS "Cybercafe can insert own profile" ON public.cybercafe_profiles;

CREATE POLICY "Admins manage cybercafe profiles" ON public.cybercafe_profiles 
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Cybercafe can view own profile" ON public.cybercafe_profiles 
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Cybercafe can update own profile" ON public.cybercafe_profiles 
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Cybercafe can insert own profile" ON public.cybercafe_profiles 
  FOR INSERT WITH CHECK (auth.uid() = id);

-- 5. Grant table permissions to authenticated users
GRANT SELECT ON public.students TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.cybercafe_profiles TO authenticated;
GRANT SELECT ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO authenticated;
