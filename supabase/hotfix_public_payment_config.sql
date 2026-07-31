-- Run once in Supabase SQL Editor if registration skips payment (anon cannot read payment_config).
-- Safe to re-run.

-- Existing Lovable view may have different columns — must drop before recreate (42P16).
DROP VIEW IF EXISTS public.public_payment_config;

CREATE VIEW public.public_payment_config AS
SELECT
  razorpay_key_id,
  amount_paise,
  COALESCE(currency, 'INR') AS currency,
  is_active
FROM public.payment_config
WHERE id = 1;

GRANT SELECT ON public.public_payment_config TO anon, authenticated;

ALTER TABLE public.payment_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active config" ON public.payment_config;
DROP POLICY IF EXISTS "anon_read_payment_config" ON public.payment_config;
DROP POLICY IF EXISTS "Public read payment config for checkout" ON public.payment_config;

CREATE POLICY "anon_read_payment_config"
  ON public.payment_config
  FOR SELECT
  TO anon, authenticated
  USING (id = 1);

GRANT SELECT ON public.payment_config TO anon;

CREATE OR REPLACE FUNCTION public.get_public_payment_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'razorpay_key_id', razorpay_key_id,
    'amount_paise', amount_paise,
    'is_active', COALESCE(is_active, true),
    'currency', COALESCE(currency, 'INR')
  )
  FROM public.payment_config
  WHERE id = 1
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_payment_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_payment_config() TO anon, authenticated;

-- Ensure gateway is enabled (adjust key in Super Admin if needed)
UPDATE public.payment_config
SET is_active = true
WHERE id = 1
  AND razorpay_key_id IS NOT NULL
  AND length(trim(razorpay_key_id)) > 0;
