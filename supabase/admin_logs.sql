-- Create Admin Logs table
CREATE TABLE IF NOT EXISTS public.admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_email TEXT,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

-- Only super admins can view logs
DROP POLICY IF EXISTS "Super admins view all logs" ON public.admin_logs;
CREATE POLICY "Super admins view all logs" ON public.admin_logs 
  FOR SELECT USING (public.has_role(auth.uid(), 'super_admin'));

-- Admins and super admins can insert their own logs
DROP POLICY IF EXISTS "Admins can insert logs" ON public.admin_logs;
CREATE POLICY "Admins can insert logs" ON public.admin_logs 
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Grant permissions
GRANT ALL ON public.admin_logs TO authenticated;
GRANT ALL ON public.admin_logs TO service_role;
