-- Referral partners (admin-created) + attribution on students

CREATE TABLE IF NOT EXISTS public.referral_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  contact_number text NOT NULL DEFAULT '',
  referral_code text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_referral_partners_active ON public.referral_partners (active);
CREATE INDEX IF NOT EXISTS idx_referral_partners_email_lower ON public.referral_partners (lower(email));

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS referral_code text;

CREATE INDEX IF NOT EXISTS idx_students_referral_code ON public.students (referral_code)
  WHERE referral_code IS NOT NULL;

COMMENT ON TABLE public.referral_partners IS 'Marketing / ambassador referral rows; link is /register?ref=<referral_code>';
COMMENT ON COLUMN public.students.referral_code IS 'First-touch referral code captured at registration (must match active partner at signup time).';

ALTER TABLE public.referral_partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage referral partners" ON public.referral_partners;
CREATE POLICY "Admins manage referral partners" ON public.referral_partners
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_partners TO authenticated;
