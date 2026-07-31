-- Quick fix: "get_registration_universities is missing" on register page refresh.
-- Run this ENTIRE file in Supabase → SQL Editor → Run.
-- (Or run the full supabase/migrations/20260601120000_security_rpc_registration_fees_payment.sql)

CREATE OR REPLACE FUNCTION public.get_registration_universities()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('id', u.id, 'name', u.name, 'pisa_fee', u.pisa_fee)
      ORDER BY u.name
    ),
    '[]'::jsonb
  )
  FROM public.universities u;
$$;

CREATE OR REPLACE FUNCTION public.get_registration_colleges(p_university_id uuid)
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
        'fees_managed', c.fees_managed
      )
      ORDER BY c.name
    ),
    '[]'::jsonb
  )
  FROM public.colleges c
  WHERE c.university_id = p_university_id;
$$;

CREATE OR REPLACE FUNCTION public.list_public_universities()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name) ORDER BY u.name),
    '[]'::jsonb
  )
  FROM public.universities u;
$$;

CREATE OR REPLACE FUNCTION public.list_public_colleges(p_university_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('id', c.id, 'name', c.name, 'university_id', c.university_id)
      ORDER BY c.name
    ),
    '[]'::jsonb
  )
  FROM public.colleges c
  WHERE p_university_id IS NULL OR c.university_id = p_university_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_registration_universities() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_registration_colleges(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_universities() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_colleges(uuid) TO anon, authenticated;
