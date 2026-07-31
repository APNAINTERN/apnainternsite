-- ==========================================================
-- HOTFIX: Access Consistency + Performance Indexes
-- Run in Supabase SQL Editor after hotfix_auth_role_guard.sql
-- ==========================================================

-- 1) Ensure role read policies are consistent.
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;
CREATE POLICY "Users view own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all roles" ON public.user_roles;
CREATE POLICY "Admins view all roles"
ON public.user_roles
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
);

DROP POLICY IF EXISTS "Super admins manage roles" ON public.user_roles;
CREATE POLICY "Super admins manage roles"
ON public.user_roles
FOR ALL
USING (public.has_role(auth.uid(), 'super_admin'));

-- 2) Keep has_role function aligned and executable by authenticated users.
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;

-- 3) Query-performance indexes for common filters/sorting.
CREATE INDEX IF NOT EXISTS idx_user_roles_user_role ON public.user_roles (user_id, role);

CREATE INDEX IF NOT EXISTS idx_students_created_at ON public.students (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_students_email ON public.students (email);
CREATE INDEX IF NOT EXISTS idx_students_contact_number ON public.students (contact_number);
CREATE INDEX IF NOT EXISTS idx_students_registration_id ON public.students (registration_id);
CREATE INDEX IF NOT EXISTS idx_students_course ON public.students (course);
CREATE INDEX IF NOT EXISTS idx_students_college_name ON public.students (college_name);
CREATE INDEX IF NOT EXISTS idx_students_university_name ON public.students (university_name);

CREATE INDEX IF NOT EXISTS idx_profiles_contact_number ON public.profiles (contact_number);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (email);

CREATE INDEX IF NOT EXISTS idx_payment_success_created_at ON public.payment_success (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_success_email ON public.payment_success (email);
CREATE INDEX IF NOT EXISTS idx_payment_success_user_id ON public.payment_success (user_id);

CREATE INDEX IF NOT EXISTS idx_payment_cancelled_created_at ON public.payment_cancelled (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_cancelled_user_email ON public.payment_cancelled (user_email);

-- If cybercafe_profiles exists, add helpful indexes safely.
DO $$
BEGIN
  IF to_regclass('public.cybercafe_profiles') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_cybercafe_profiles_email ON public.cybercafe_profiles (email)';
  END IF;
END $$;

-- 4) Stats refresh for improved planner choices (safe to run repeatedly).
ANALYZE public.user_roles;
ANALYZE public.students;
ANALYZE public.profiles;
ANALYZE public.payment_success;
ANALYZE public.payment_cancelled;

-- Verification queries (run manually):
-- EXPLAIN ANALYZE SELECT * FROM public.students ORDER BY created_at DESC LIMIT 50;
-- EXPLAIN ANALYZE SELECT role FROM public.user_roles WHERE user_id = '00000000-0000-0000-0000-000000000000';
