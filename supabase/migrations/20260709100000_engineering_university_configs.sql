-- Per-university engineering registration config (courses, branches, domains).

CREATE TABLE IF NOT EXISTS public.engineering_university_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL UNIQUE REFERENCES public.universities(id) ON DELETE CASCADE,
  courses jsonb NOT NULL DEFAULT '[]'::jsonb,
  branches_by_course jsonb NOT NULL DEFAULT '{}'::jsonb,
  domains jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS engineering_university_configs_university_id_idx
  ON public.engineering_university_configs(university_id);

ALTER TABLE public.engineering_university_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engineering_configs_public_read ON public.engineering_university_configs;
CREATE POLICY engineering_configs_public_read ON public.engineering_university_configs
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS engineering_configs_admin_all ON public.engineering_university_configs;
CREATE POLICY engineering_configs_admin_all ON public.engineering_university_configs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role, 'staff'::public.app_role)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role, 'staff'::public.app_role)
    )
  );

GRANT SELECT ON public.engineering_university_configs TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.engineering_university_configs TO authenticated;

NOTIFY pgrst, 'reload schema';
