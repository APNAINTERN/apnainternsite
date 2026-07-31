-- ================================================
-- EZYINTERN PORTAL - Complete Database Setup
-- Run this entire script in Supabase SQL Editor
-- ================================================

-- Enable uuid extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================
-- 1. ROLES
-- ================================================
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('student', 'admin', 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins view all roles" ON public.user_roles;
CREATE POLICY "Admins view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Super admins manage roles" ON public.user_roles;
CREATE POLICY "Super admins manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));

-- ================================================
-- 2. UNIVERSITIES & COLLEGES
-- ================================================
CREATE TABLE IF NOT EXISTS public.universities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.universities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view universities" ON public.universities;
CREATE POLICY "Anyone can view universities" ON public.universities FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage universities" ON public.universities;
CREATE POLICY "Admins manage universities" ON public.universities FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE IF NOT EXISTS public.colleges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id UUID REFERENCES public.universities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.colleges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view colleges" ON public.colleges;
CREATE POLICY "Anyone can view colleges" ON public.colleges FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage colleges" ON public.colleges;
CREATE POLICY "Admins manage colleges" ON public.colleges FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id UUID REFERENCES public.colleges(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view departments" ON public.departments;
CREATE POLICY "Anyone can view departments" ON public.departments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage departments" ON public.departments;
CREATE POLICY "Admins manage departments" ON public.departments FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- ================================================
-- 3. INTERNSHIP DOMAINS
-- ================================================
CREATE TABLE IF NOT EXISTS public.internship_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.internship_domains ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view domains" ON public.internship_domains;
CREATE POLICY "Anyone can view domains" ON public.internship_domains FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage domains" ON public.internship_domains;
CREATE POLICY "Admins manage domains" ON public.internship_domains FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- ================================================
-- 4. PROFILES
-- ================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT '',
  parent_name TEXT NOT NULL DEFAULT '',
  contact_number TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Admins view all profiles" ON public.profiles;
CREATE POLICY "Admins view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- ================================================
-- 5. ACADEMIC INFO
-- ================================================
CREATE TABLE IF NOT EXISTS public.academic_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  university_name TEXT NOT NULL DEFAULT '',
  college_name TEXT NOT NULL DEFAULT '',
  degree TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  class_semester TEXT NOT NULL DEFAULT '',
  academic_session TEXT NOT NULL DEFAULT '',
  subject TEXT,
  roll_number TEXT NOT NULL DEFAULT '',
  course TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.academic_info ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own academic" ON public.academic_info;
CREATE POLICY "Users view own academic" ON public.academic_info FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users insert own academic" ON public.academic_info;
CREATE POLICY "Users insert own academic" ON public.academic_info FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own academic" ON public.academic_info;
CREATE POLICY "Users update own academic" ON public.academic_info FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins view all academic" ON public.academic_info;
CREATE POLICY "Admins view all academic" ON public.academic_info FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- ================================================
-- 6. EMERGENCY CONTACTS
-- ================================================
CREATE TABLE IF NOT EXISTS public.emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL DEFAULT '',
  contact_number TEXT NOT NULL DEFAULT '',
  relationship TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own emergency" ON public.emergency_contacts;
CREATE POLICY "Users view own emergency" ON public.emergency_contacts FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users insert own emergency" ON public.emergency_contacts;
CREATE POLICY "Users insert own emergency" ON public.emergency_contacts FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own emergency" ON public.emergency_contacts;
CREATE POLICY "Users update own emergency" ON public.emergency_contacts FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins view all emergency" ON public.emergency_contacts;
CREATE POLICY "Admins view all emergency" ON public.emergency_contacts FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- ================================================
-- 7. STUDENTS (main table used in dashboard)
-- ================================================
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  gender TEXT,
  parent_name TEXT,
  contact_number TEXT,
  internship_domain TEXT,
  college_name TEXT,
  university_name TEXT,
  degree TEXT,
  department TEXT,
  class_semester TEXT,
  academic_session TEXT,
  roll_number TEXT,
  course TEXT,
  emergency_name TEXT,
  emergency_contact TEXT,
  emergency_relation TEXT,
  metadata JSONB,
  registration_id TEXT UNIQUE,
  status TEXT DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own student record" ON public.students;
CREATE POLICY "Users view own student record" ON public.students FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users update own student record" ON public.students;
CREATE POLICY "Users update own student record" ON public.students FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users insert own student record" ON public.students;
CREATE POLICY "Users insert own student record" ON public.students FOR INSERT WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Admins view all students" ON public.students;
CREATE POLICY "Admins view all students" ON public.students FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Admins update all students" ON public.students;
CREATE POLICY "Admins update all students" ON public.students FOR UPDATE USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Admins delete students" ON public.students;
CREATE POLICY "Admins delete students" ON public.students FOR DELETE USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- ================================================
-- 8. CERTIFICATES
-- ================================================
CREATE TABLE IF NOT EXISTS public.certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id TEXT NOT NULL UNIQUE,
  student_name TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  internship_name TEXT NOT NULL,
  duration TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can verify certificates" ON public.certificates;
CREATE POLICY "Public can verify certificates" ON public.certificates FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage certificates" ON public.certificates;
CREATE POLICY "Admins manage certificates" ON public.certificates FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- ================================================
-- 9. CLASSES (Live Intern Program)
-- ================================================
CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  link_type TEXT NOT NULL CHECK (link_type IN ('youtube', 'meet')),
  url TEXT NOT NULL,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  domain_id UUID REFERENCES public.internship_domains(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view classes" ON public.classes;
CREATE POLICY "Anyone can view classes" ON public.classes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage classes" ON public.classes;
CREATE POLICY "Admins can manage classes" ON public.classes FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND role IN ('admin', 'super_admin')
  )
);

-- ================================================
-- 10. AUTO-ASSIGN STUDENT ROLE ON SIGNUP
-- ================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student') ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ================================================
-- 11. REVOKE PERMISSIONS
-- ================================================
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
