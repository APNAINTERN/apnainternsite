-- BEU engineering student details linked to students directory.

CREATE TABLE IF NOT EXISTS public.beu_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL UNIQUE REFERENCES public.students(id) ON DELETE CASCADE,
  college text,
  course text NOT NULL,
  branch_subject text NOT NULL,
  specialization text,
  section_type text NOT NULL CHECK (section_type IN ('Hours', 'Weeks')),
  section_duration text NOT NULL,
  academic_session text,
  registration_number text,
  internship_domain text,
  mode text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS beu_details_student_id_idx ON public.beu_details(student_id);
CREATE INDEX IF NOT EXISTS beu_details_course_idx ON public.beu_details(course);
CREATE INDEX IF NOT EXISTS beu_details_branch_subject_idx ON public.beu_details(branch_subject);

ALTER TABLE public.beu_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS beu_details_admin_all ON public.beu_details;
CREATE POLICY beu_details_admin_all ON public.beu_details
  FOR ALL TO authenticated
  USING (
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
  )
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

DROP POLICY IF EXISTS beu_details_student_read_own ON public.beu_details;
CREATE POLICY beu_details_student_read_own ON public.beu_details
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS beu_details_student_insert_own ON public.beu_details;
CREATE POLICY beu_details_student_insert_own ON public.beu_details
  FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS beu_details_student_update_own ON public.beu_details;
CREATE POLICY beu_details_student_update_own ON public.beu_details
  FOR UPDATE TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.beu_details TO authenticated;

NOTIFY pgrst, 'reload schema';
