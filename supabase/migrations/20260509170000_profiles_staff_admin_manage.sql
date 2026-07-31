-- Learner profile rows must be updatable by admins / staff when editing the student directory.
-- Without this, students.update succeeds but profiles.upsert fails under RLS and edits appear "broken".

DROP POLICY IF EXISTS "Staff and admins update learner profiles" ON public.profiles;
CREATE POLICY "Staff and admins update learner profiles" ON public.profiles
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role, 'staff'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Staff and admins insert learner profiles" ON public.profiles;
CREATE POLICY "Staff and admins insert learner profiles" ON public.profiles
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role, 'staff'::public.app_role)
  )
);
