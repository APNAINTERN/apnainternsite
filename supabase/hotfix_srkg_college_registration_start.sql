-- Run in Supabase SQL Editor: college registration dates + SRKG College start 1 Jul 2026.

ALTER TABLE public.colleges
  ADD COLUMN IF NOT EXISTS registration_start_date date,
  ADD COLUMN IF NOT EXISTS registration_end_date date;

COMMENT ON COLUMN public.colleges.registration_start_date IS 'First calendar day students may register for this college (inclusive). NULL = no start restriction.';
COMMENT ON COLUMN public.colleges.registration_end_date IS 'Last calendar day students may register for this college (inclusive). NULL = no end restriction.';

CREATE OR REPLACE FUNCTION public.is_college_registration_open(p_college_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT
        (c.registration_start_date IS NULL OR CURRENT_DATE >= c.registration_start_date)
        AND (c.registration_end_date IS NULL OR CURRENT_DATE <= c.registration_end_date)
      FROM public.colleges c
      WHERE c.id = p_college_id
    ),
    true
  );
$$;

CREATE OR REPLACE FUNCTION public.college_registration_status(p_college_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_college public.colleges%ROWTYPE;
BEGIN
  SELECT * INTO v_college FROM public.colleges WHERE id = p_college_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('open', true, 'message', '');
  END IF;

  IF v_college.registration_start_date IS NOT NULL AND CURRENT_DATE < v_college.registration_start_date THEN
    RETURN jsonb_build_object(
      'open', false,
      'reason', 'not_started',
      'message', format(
        'Registration for %s opens on %s.',
        v_college.name,
        to_char(v_college.registration_start_date, 'DD Mon YYYY')
      ),
      'registration_start_date', v_college.registration_start_date,
      'registration_end_date', v_college.registration_end_date
    );
  END IF;

  IF v_college.registration_end_date IS NOT NULL AND CURRENT_DATE > v_college.registration_end_date THEN
    RETURN jsonb_build_object(
      'open', false,
      'reason', 'ended',
      'message', format(
        'Registration for %s closed on %s.',
        v_college.name,
        to_char(v_college.registration_end_date, 'DD Mon YYYY')
      ),
      'registration_start_date', v_college.registration_start_date,
      'registration_end_date', v_college.registration_end_date
    );
  END IF;

  RETURN jsonb_build_object(
    'open', true,
    'message', '',
    'registration_start_date', v_college.registration_start_date,
    'registration_end_date', v_college.registration_end_date
  );
END;
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
        'fees_managed', c.fees_managed,
        'registration_start_date', c.registration_start_date,
        'registration_end_date', c.registration_end_date
      )
      ORDER BY c.name
    ),
    '[]'::jsonb
  )
  FROM public.colleges c
  WHERE c.university_id = p_university_id;
$$;

GRANT EXECUTE ON FUNCTION public.is_college_registration_open(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.college_registration_status(uuid) TO anon, authenticated;

-- NOTE: 1 July 2026 for S.R.K.G. College, Sitamarhi (BRABU) is offer-letter display only.
-- Do NOT set registration_start_date here — registration must stay open for all colleges.

NOTIFY pgrst, 'reload schema';
