-- Fix "new row violates row-level security policy" on public.students during registration.
-- Self-service: auth.uid() must equal students.id.
-- Staff/admin manual enrollment: may insert rows for other user ids.

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own student record" ON public.students;
DROP POLICY IF EXISTS "Students insert own record" ON public.students;
CREATE POLICY "Students insert own record"
  ON public.students
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users update own student record" ON public.students;
DROP POLICY IF EXISTS "Students update own record" ON public.students;
CREATE POLICY "Students update own record"
  ON public.students
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users view own student record" ON public.students;
DROP POLICY IF EXISTS "Students view own record" ON public.students;
CREATE POLICY "Students view own record"
  ON public.students
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Staff and admins insert students" ON public.students;
CREATE POLICY "Staff and admins insert students"
  ON public.students
  FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT public.auth_is_referral_partner_scoped_only(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN (
          'admin'::public.app_role,
          'super_admin'::public.app_role,
          'staff'::public.app_role
        )
    )
  );

GRANT INSERT, UPDATE, SELECT ON public.students TO authenticated;
