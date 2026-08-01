-- Admin dashboard tables missing on RDS (site_settings, system_settings, classes).
-- classes failed in full_setup.sql because uuid_generate_v4() is not on search_path for RDS app user.
-- Safe to run multiple times (IF NOT EXISTS / ON CONFLICT).

-- ── site_settings ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  notice_enabled BOOLEAN DEFAULT false,
  notice_title TEXT DEFAULT 'Important Notice',
  notice_message TEXT DEFAULT '',
  show_on_home BOOLEAN DEFAULT true,
  show_on_registration BOOLEAN DEFAULT true,
  show_on_login BOOLEAN DEFAULT false,
  reg_min_delay INTEGER DEFAULT 0,
  reg_max_delay INTEGER DEFAULT 0,
  whatsapp_link_enabled BOOLEAN DEFAULT true,
  whatsapp_link_url TEXT DEFAULT 'https://whatsapp.com/channel/0029VbC9lvi3bbV8TS7TbB00',
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT site_settings_one_row CHECK (id = 1)
);

INSERT INTO public.site_settings (
  id, notice_enabled, notice_title, notice_message, show_on_home, show_on_registration,
  whatsapp_link_enabled
)
VALUES (1, false, 'Important Notice', '', true, true, true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view settings" ON public.site_settings;
CREATE POLICY "Anyone can view settings" ON public.site_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Super admins manage settings" ON public.site_settings;
CREATE POLICY "Super admins manage settings" ON public.site_settings FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND role = 'super_admin'
  )
);

GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT ALL ON public.site_settings TO service_role;

-- ── system_settings (feature toggles) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.system_settings (key, is_enabled) VALUES
  ('live_classes', true),
  ('certificates', true),
  ('bulk_certification', true),
  ('internship_registration', true)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view system settings" ON public.system_settings;
CREATE POLICY "Anyone can view system settings" ON public.system_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage system settings" ON public.system_settings;
CREATE POLICY "Admins manage system settings" ON public.system_settings FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND role IN ('admin', 'super_admin')
  )
);

GRANT SELECT ON public.system_settings TO anon, authenticated;
GRANT ALL ON public.system_settings TO service_role;

-- ── classes (live sessions) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  link_type TEXT NOT NULL,
  url TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  domain_id UUID REFERENCES public.internship_domains(id),
  is_active BOOLEAN DEFAULT true,
  description TEXT,
  target_universities TEXT[],
  target_colleges TEXT[],
  target_domains TEXT[],
  target_modes TEXT[],
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_link_type_check;
ALTER TABLE public.classes ADD CONSTRAINT classes_link_type_check
  CHECK (link_type IN ('youtube', 'meet', 'zoom', 'teams', 'url'));

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

GRANT SELECT ON public.classes TO anon, authenticated;
GRANT ALL ON public.classes TO service_role;

-- list_classes_for_student depends on public.classes
CREATE OR REPLACE FUNCTION public.list_classes_for_student()
RETURNS SETOF public.classes
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT c.*
  FROM public.classes c
  WHERE COALESCE(c.is_active, true) = true
    AND public.student_matches_class_targets(
      v_uid,
      public.coerce_text_array(c.target_universities),
      public.coerce_text_array(c.target_colleges),
      public.coerce_text_array(c.target_domains),
      CASE
        WHEN c.domain_id IS NULL OR btrim(c.domain_id::text) = '' THEN NULL
        ELSE c.domain_id::uuid
      END,
      public.coerce_text_array(c.target_modes)
    )
  ORDER BY c.scheduled_at ASC NULLS LAST, c.created_at DESC;
EXCEPTION
  WHEN others THEN
    RETURN QUERY
    SELECT c.*
    FROM public.classes c
    WHERE COALESCE(c.is_active, true) = true
    ORDER BY c.scheduled_at ASC NULLS LAST, c.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_classes_for_student() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_classes_for_student() TO authenticated;
