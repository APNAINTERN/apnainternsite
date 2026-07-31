-- Site Settings Table for Notice Popups
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
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT one_row CHECK (id = 1)
);

-- Insert default row if not exists
INSERT INTO public.site_settings (id, notice_enabled, notice_title, notice_message, show_on_home, show_on_registration)
VALUES (1, false, 'Important Notice', '', true, true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Policies
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

-- Grant permissions
GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT ALL ON public.site_settings TO service_role;
