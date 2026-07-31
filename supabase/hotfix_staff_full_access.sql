-- ============================================================
-- HOTFIX: Staff Full Access - Students + Payments
-- Run this in Supabase Dashboard → SQL Editor
-- Safe to re-run multiple times
-- ============================================================

-- ──────────────────────────────────────────
-- 0. Make sure RLS is enabled on key tables
-- ──────────────────────────────────────────
ALTER TABLE public.payment_success   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_cancelled ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_leads ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────
-- 1. user_roles — staff must read OWN row
--    (required so the app knows user is staff)
-- ──────────────────────────────────────────
DROP POLICY IF EXISTS "Users view own roles"  ON public.user_roles;
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

-- ──────────────────────────────────────────
-- 2. payment_success — SELECT + INSERT + DELETE for staff/admin
-- ──────────────────────────────────────────
DROP POLICY IF EXISTS "Admins view all successful payments"   ON public.payment_success;
DROP POLICY IF EXISTS "Staff view payment success"            ON public.payment_success;
DROP POLICY IF EXISTS "Admins insert payment success"         ON public.payment_success;
DROP POLICY IF EXISTS "Admins delete payment success"         ON public.payment_success;
DROP POLICY IF EXISTS "Staff all payment success"             ON public.payment_success;

-- One policy covering all operations for admin / super_admin / staff
CREATE POLICY "Staff all payment success" ON public.payment_success
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND role IN ('admin', 'super_admin', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND role IN ('admin', 'super_admin', 'staff')
    )
  );

-- Allow users to view their own payment record
DROP POLICY IF EXISTS "Users view own payment success" ON public.payment_success;
CREATE POLICY "Users view own payment success" ON public.payment_success
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      user_id = auth.uid()
      OR email = (SELECT email FROM auth.users WHERE id = auth.uid() LIMIT 1)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_success TO authenticated;

-- ──────────────────────────────────────────
-- 3. payment_cancelled (leads) — staff full access
-- ──────────────────────────────────────────
DROP POLICY IF EXISTS "Admins view all cancelled payments" ON public.payment_cancelled;
DROP POLICY IF EXISTS "Admins manage leads"                ON public.payment_cancelled;
DROP POLICY IF EXISTS "Staff all payment cancelled"        ON public.payment_cancelled;

CREATE POLICY "Staff all payment cancelled" ON public.payment_cancelled
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND role IN ('admin', 'super_admin', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND role IN ('admin', 'super_admin', 'staff')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_cancelled TO authenticated;

-- ──────────────────────────────────────────
-- 4. students — SELECT + UPDATE for staff
-- ──────────────────────────────────────────
DROP POLICY IF EXISTS "Admins view all students"   ON public.students;
DROP POLICY IF EXISTS "Admins update all students" ON public.students;
DROP POLICY IF EXISTS "Staff all students"         ON public.students;

CREATE POLICY "Staff all students" ON public.students
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND role IN ('admin', 'super_admin', 'staff')
    )
    OR auth.uid() = id   -- students can view own row
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND role IN ('admin', 'super_admin', 'staff')
    )
    OR auth.uid() = id
  );

GRANT SELECT, INSERT, UPDATE ON public.students TO authenticated;

-- ──────────────────────────────────────────
-- 5. registration_leads — staff full access
-- ──────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage registration leads" ON public.registration_leads;
DROP POLICY IF EXISTS "Staff all registration leads"     ON public.registration_leads;

CREATE POLICY "Staff all registration leads" ON public.registration_leads
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND role IN ('admin', 'super_admin', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND role IN ('admin', 'super_admin', 'staff')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.registration_leads TO authenticated;

-- ──────────────────────────────────────────
-- 6. Grant usage on schema (safety net)
-- ──────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO authenticated, anon;

-- ──────────────────────────────────────────
-- 7. Verify current policies (optional check)
-- ──────────────────────────────────────────
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename IN ('payment_success','payment_cancelled','students','user_roles','registration_leads')
ORDER BY tablename, policyname;
