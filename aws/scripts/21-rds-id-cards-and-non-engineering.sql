-- ID card tables + Non-Engineering university configs (mirror Engineering)

BEGIN;

-- ---------------------------------------------------------------------------
-- ID cards
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.id_card_generations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    card_number text UNIQUE NOT NULL,
    user_id text,
    user_name text,
    user_email text,
    category text,
    generated_by text,
    generated_at timestamptz DEFAULT now(),
    status text DEFAULT 'generated',
    metadata jsonb
);

ALTER TABLE public.id_card_generations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage id_card_generations" ON public.id_card_generations;
DROP POLICY IF EXISTS "Admins and staff can manage id_card_generations" ON public.id_card_generations;

CREATE POLICY "Admins and staff can manage id_card_generations"
  ON public.id_card_generations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('admin', 'super_admin', 'staff')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.admin_staff
      WHERE admin_staff.id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('admin', 'super_admin', 'staff')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.admin_staff
      WHERE admin_staff.id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.id_card_sequences (
    category_code text PRIMARY KEY,
    current_serial integer DEFAULT 0
);

ALTER TABLE public.id_card_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read id_card_sequences" ON public.id_card_sequences;
DROP POLICY IF EXISTS "Admins can manage id_card_sequences" ON public.id_card_sequences;
DROP POLICY IF EXISTS "Admins and staff can read id_card_sequences" ON public.id_card_sequences;

CREATE POLICY "Admins and staff can read id_card_sequences"
  ON public.id_card_sequences
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('admin', 'super_admin', 'staff')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.admin_staff
      WHERE admin_staff.id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.generate_id_card_number(p_category_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    next_serial integer;
    padded_serial text;
BEGIN
    INSERT INTO public.id_card_sequences (category_code, current_serial)
    VALUES (upper(trim(p_category_code)), 1)
    ON CONFLICT (category_code)
    DO UPDATE SET current_serial = public.id_card_sequences.current_serial + 1
    RETURNING current_serial INTO next_serial;

    padded_serial := LPAD(next_serial::text, 3, '0');
    RETURN 'EZI/' || UPPER(trim(p_category_code)) || '/' || padded_serial;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON public.id_card_sequences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.id_card_generations TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_id_card_number(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Non-Engineering university configs (same shape as engineering)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.non_engineering_university_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL UNIQUE REFERENCES public.universities(id) ON DELETE CASCADE,
  courses jsonb NOT NULL DEFAULT '[]'::jsonb,
  branches_by_course jsonb NOT NULL DEFAULT '{}'::jsonb,
  domains jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS non_engineering_university_configs_university_id_idx
  ON public.non_engineering_university_configs(university_id);

ALTER TABLE public.non_engineering_university_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS non_engineering_configs_public_read ON public.non_engineering_university_configs;
CREATE POLICY non_engineering_configs_public_read ON public.non_engineering_university_configs
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS non_engineering_configs_admin_all ON public.non_engineering_university_configs;
CREATE POLICY non_engineering_configs_admin_all ON public.non_engineering_university_configs
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

GRANT SELECT ON public.non_engineering_university_configs TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.non_engineering_university_configs TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
