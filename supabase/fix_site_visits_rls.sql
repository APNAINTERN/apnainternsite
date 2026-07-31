-- Ensure site_visits table exists
CREATE TABLE IF NOT EXISTS public.site_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id TEXT NOT NULL,
  page_path TEXT,
  referrer TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;

-- Allow ANYONE (including public/unauthenticated users) to insert visit logs
DROP POLICY IF EXISTS "Anyone can insert site visits" ON public.site_visits;
CREATE POLICY "Anyone can insert site visits"
ON public.site_visits
FOR INSERT
WITH CHECK (true);

-- Allow admins to view the stats
DROP POLICY IF EXISTS "Admins view site visits" ON public.site_visits;
CREATE POLICY "Admins view site visits"
ON public.site_visits
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'super_admin')
);
