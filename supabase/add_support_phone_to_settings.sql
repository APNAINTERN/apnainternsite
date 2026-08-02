-- Support phone + contact page numbers (managed from admin panel)
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS support_phone TEXT DEFAULT '';
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS show_support_phone_on_footer BOOLEAN DEFAULT false;
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS contact_support_phones TEXT DEFAULT '';

-- Allow admins (not only super_admin) to manage site contact settings
DROP POLICY IF EXISTS "Super admins manage settings" ON public.site_settings;
CREATE POLICY "Admins manage settings" ON public.site_settings FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND role IN ('admin', 'super_admin')
  )
);
