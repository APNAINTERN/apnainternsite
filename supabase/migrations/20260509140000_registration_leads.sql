-- Draft registrations (abandoned before payment) surfaced in Lead Hub.
-- Permissive anon policies match existing client-side lead capture patterns.
CREATE TABLE IF NOT EXISTS public.registration_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  phone TEXT,
  step INTEGER NOT NULL DEFAULT 1,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  cybercafe_shop_name TEXT,
  cybercafe_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_registration_leads_email_unique
  ON public.registration_leads (email);

CREATE INDEX IF NOT EXISTS idx_registration_leads_updated ON public.registration_leads (updated_at DESC);

ALTER TABLE public.registration_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon manage registration_leads" ON public.registration_leads;
CREATE POLICY "Allow anon manage registration_leads"
  ON public.registration_leads
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated read registration_leads" ON public.registration_leads;
CREATE POLICY "Allow authenticated read registration_leads"
  ON public.registration_leads
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role, 'staff'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Staff admins delete registration_leads" ON public.registration_leads;
CREATE POLICY "Staff admins delete registration_leads"
  ON public.registration_leads
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role, 'staff'::public.app_role)
    )
  );

GRANT ALL ON public.registration_leads TO anon, authenticated, service_role;
