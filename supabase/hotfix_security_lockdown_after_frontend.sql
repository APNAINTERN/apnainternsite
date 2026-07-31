-- RUN ONLY AFTER deploying frontend that uses security RPCs (20260601120000_*).
-- Run in Supabase SQL Editor when ready to lock down (e.g. after Lovable "go ahead").

-- 1) Payment secrets — no direct table reads for anon/authenticated
DROP POLICY IF EXISTS "anon_read_payment_config" ON public.payment_config;
DROP POLICY IF EXISTS "Anyone can view active config" ON public.payment_config;
DROP POLICY IF EXISTS "Public read payment config for checkout" ON public.payment_config;

REVOKE SELECT ON public.payment_config FROM anon;
REVOKE SELECT ON public.payment_config FROM authenticated;

-- Super admins may still manage via admin_save_payment_config RPC (SECURITY DEFINER).
DROP POLICY IF EXISTS "Super admins manage config" ON public.payment_config;
CREATE POLICY "Super admins manage config"
  ON public.payment_config
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

GRANT SELECT, INSERT, UPDATE ON public.payment_config TO authenticated;

-- Public checkout uses get_public_payment_config() + public_payment_config view (no secret column).
DROP VIEW IF EXISTS public.public_payment_config;
CREATE VIEW public.public_payment_config AS
SELECT razorpay_key_id, amount_paise, COALESCE(currency, 'INR') AS currency, is_active
FROM public.payment_config
WHERE id = 1;

GRANT SELECT ON public.public_payment_config TO anon, authenticated;

-- 2) Registration fees — use RPCs only for anon
DROP POLICY IF EXISTS "Anyone can view universities" ON public.universities;
DROP POLICY IF EXISTS "Anyone can view colleges" ON public.colleges;

CREATE POLICY "Authenticated view universities"
  ON public.universities FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated view colleges"
  ON public.colleges FOR SELECT TO authenticated USING (true);

-- Admins unchanged (manage policies already exist).

-- 3) Assignment answer keys — students use RPC; block direct question reads for non-admins
DROP POLICY IF EXISTS "Anyone can view questions" ON public.assignment_questions;

CREATE POLICY "Admins view assignment questions"
  ON public.assignment_questions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role, 'staff'::public.app_role)
    )
  );

-- 4) Students cannot insert arbitrary scores
DROP POLICY IF EXISTS "Students can insert their own submissions" ON public.assignment_submissions;

-- Submissions only via submit_assignment_graded (SECURITY DEFINER).
