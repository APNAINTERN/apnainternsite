-- Run in Supabase SQL Editor if attendance "Failed to mark" for students.
-- (Admins already have "Admins manage attendance" from fix_attendance_rls.sql.)

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students view own attendance" ON public.attendance;
CREATE POLICY "Students view own attendance"
  ON public.attendance
  FOR SELECT
  TO authenticated
  USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Students insert own attendance" ON public.attendance;
CREATE POLICY "Students insert own attendance"
  ON public.attendance
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = student_id);

GRANT SELECT, INSERT ON public.attendance TO authenticated;
