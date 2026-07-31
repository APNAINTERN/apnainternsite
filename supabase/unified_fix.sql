-- ========================================================
-- UNIFIED FIX SCRIPT FOR EZYINTERN PORTAL
-- Run this ENTIRE script in Supabase SQL Editor
-- ========================================================

-- 1. Create missing tables
CREATE TABLE IF NOT EXISTS public.user_security (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  security_pin TEXT NOT NULL CHECK (security_pin ~ '^[0-9]{4}$'),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_permissions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  can_manage_students BOOLEAN DEFAULT true,
  can_manage_classes BOOLEAN DEFAULT true,
  can_manage_certificates BOOLEAN DEFAULT true,
  can_manage_institutions BOOLEAN DEFAULT true,
  can_view_payments BOOLEAN DEFAULT true,
  can_manage_leads BOOLEAN DEFAULT true,
  can_manage_notifications BOOLEAN DEFAULT true,
  can_manage_assignments BOOLEAN DEFAULT true,
  can_manage_communications BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Ensure 'students' table has all necessary columns
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS emergency_name TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact TEXT,
ADD COLUMN IF NOT EXISTS emergency_relation TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB,
ADD COLUMN IF NOT EXISTS registration_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active',
ADD COLUMN IF NOT EXISTS gender TEXT,
ADD COLUMN IF NOT EXISTS parent_name TEXT,
ADD COLUMN IF NOT EXISTS internship_domain TEXT,
ADD COLUMN IF NOT EXISTS college_name TEXT,
ADD COLUMN IF NOT EXISTS university_name TEXT,
ADD COLUMN IF NOT EXISTS degree TEXT,
ADD COLUMN IF NOT EXISTS department TEXT,
ADD COLUMN IF NOT EXISTS class_semester TEXT,
ADD COLUMN IF NOT EXISTS academic_session TEXT,
ADD COLUMN IF NOT EXISTS roll_number TEXT,
ADD COLUMN IF NOT EXISTS course TEXT;

-- 3. Enable RLS on all critical tables
ALTER TABLE public.user_security ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. Unified RLS Policies

-- User Security Policies
DROP POLICY IF EXISTS "Users manage own security" ON public.user_security;
CREATE POLICY "Users manage own security" ON public.user_security 
FOR ALL USING (auth.uid() = user_id);

-- Admin Permissions Policies
DROP POLICY IF EXISTS "Admins view own permissions" ON public.admin_permissions;
CREATE POLICY "Admins view own permissions" ON public.admin_permissions 
FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Super admins manage all permissions" ON public.admin_permissions;
CREATE POLICY "Super admins manage all permissions" ON public.admin_permissions 
FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));

-- Students Table Policies
DROP POLICY IF EXISTS "Students view own record" ON public.students;
CREATE POLICY "Students view own record" ON public.students 
FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Students insert own record" ON public.students;
CREATE POLICY "Students insert own record" ON public.students 
FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Students update own record" ON public.students;
CREATE POLICY "Students update own record" ON public.students 
FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins view all students" ON public.students;
CREATE POLICY "Admins view all students" ON public.students 
FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 5. Fix handle_new_user trigger to be more flexible
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Assign role from metadata if present, else default to student
  INSERT INTO public.user_roles (user_id, role) 
  VALUES (
    NEW.id, 
    COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'student'::public.app_role)
  ) 
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- 6. Grant Permissions
GRANT ALL ON public.user_security TO authenticated, service_role;
GRANT ALL ON public.admin_permissions TO authenticated, service_role;
GRANT ALL ON public.students TO authenticated, service_role;
GRANT ALL ON public.profiles TO authenticated, service_role;
GRANT ALL ON public.user_roles TO authenticated, service_role;

GRANT SELECT ON public.user_security TO anon; -- Required for PIN check during login
GRANT SELECT ON public.user_roles TO anon;
GRANT SELECT ON public.site_settings TO anon;

-- 7. Ensure has_role function is robust
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, anon, service_role;

-- 8. Add college pisa_fee if missing (required for dynamic pricing)
ALTER TABLE public.colleges ADD COLUMN IF NOT EXISTS pisa_fee INTEGER DEFAULT 0;
ALTER TABLE public.universities ADD COLUMN IF NOT EXISTS pisa_fee INTEGER DEFAULT 0;

-- 9. Success message
-- SUCCESS: Unified fix applied. Data integrity and RLS policies restored.
