-- RDS gap-fill part 8: registration fee RPCs + registration leads writes (AWS workflow).

-- Fee columns (idempotent)
ALTER TABLE public.colleges
  ADD COLUMN IF NOT EXISTS fee_base_paise INTEGER,
  ADD COLUMN IF NOT EXISTS fee_processing_paise INTEGER,
  ADD COLUMN IF NOT EXISTS show_fee_breakdown BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS fees_managed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.colleges
  ADD COLUMN IF NOT EXISTS registration_start_date DATE,
  ADD COLUMN IF NOT EXISTS registration_end_date DATE;

COMMENT ON COLUMN public.colleges.fees_managed IS
  'When true (or fee_* columns set), registration uses DB fee fields instead of code feeRules.';

-- Public registration catalog with fee fields (used by registration page)
CREATE OR REPLACE FUNCTION public.get_registration_universities()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', u.id,
        'name', u.name,
        'pisa_fee', u.pisa_fee
      )
      ORDER BY u.name
    ),
    '[]'::jsonb
  )
  FROM public.universities u;
$$;

-- Drop prior uuid-only overload so text+uuid are unambiguous on RDS text ids
DROP FUNCTION IF EXISTS public.get_registration_colleges(uuid);
DROP FUNCTION IF EXISTS public.get_registration_colleges(text);

CREATE OR REPLACE FUNCTION public.get_registration_colleges(p_university_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'university_id', c.university_id,
        'pisa_fee', c.pisa_fee,
        'fee_base_paise', c.fee_base_paise,
        'fee_processing_paise', c.fee_processing_paise,
        'show_fee_breakdown', c.show_fee_breakdown,
        'fees_managed', c.fees_managed,
        'registration_start_date', c.registration_start_date,
        'registration_end_date', c.registration_end_date
      )
      ORDER BY c.name
    ),
    '[]'::jsonb
  )
  FROM public.colleges c
  WHERE c.university_id::text = p_university_id::text;
$$;

GRANT EXECUTE ON FUNCTION public.get_registration_universities() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_registration_colleges(text) TO anon, authenticated;

-- Ensure registration_leads table exists for AWS imports / new drafts
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

CREATE INDEX IF NOT EXISTS idx_registration_leads_updated
  ON public.registration_leads (updated_at DESC);

CREATE OR REPLACE FUNCTION public.upsert_registration_lead(
  p_email text,
  p_phone text DEFAULT NULL,
  p_step integer DEFAULT 1,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_cybercafe_shop_name text DEFAULT NULL,
  p_cybercafe_email text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id uuid;
BEGIN
  IF v_email = '' OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'Valid email required';
  END IF;

  INSERT INTO public.registration_leads AS rl (
    email, phone, step, payload, cybercafe_shop_name, cybercafe_email, updated_at
  )
  VALUES (
    v_email,
    NULLIF(trim(coalesce(p_phone, '')), ''),
    GREATEST(1, coalesce(p_step, 1)),
    coalesce(p_payload, '{}'::jsonb),
    NULLIF(trim(coalesce(p_cybercafe_shop_name, '')), ''),
    NULLIF(trim(coalesce(p_cybercafe_email, '')), ''),
    now()
  )
  ON CONFLICT (email) DO UPDATE
  SET
    phone = COALESCE(EXCLUDED.phone, rl.phone),
    step = GREATEST(rl.step, EXCLUDED.step),
    payload = COALESCE(rl.payload, '{}'::jsonb) || coalesce(EXCLUDED.payload, '{}'::jsonb),
    cybercafe_shop_name = COALESCE(EXCLUDED.cybercafe_shop_name, rl.cybercafe_shop_name),
    cybercafe_email = COALESCE(EXCLUDED.cybercafe_email, rl.cybercafe_email),
    updated_at = now()
  RETURNING rl.id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_registration_lead(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.registration_leads
  WHERE lower(email) = lower(trim(coalesce(p_email, '')));
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_registration_lead(text, text, integer, jsonb, text, text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_registration_lead(text)
  TO anon, authenticated;
