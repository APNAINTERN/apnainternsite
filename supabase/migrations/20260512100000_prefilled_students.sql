-- Prefilled student data (sourced from college admission CSVs) used to
-- short-circuit the public / cyber-cafe registration flow.
--
-- * One row per (reference_number) — globally unique across uploaded files.
-- * `raw_data` holds the full CSV row verbatim so we can inspect / surface
--   any column without needing schema changes.
-- * `claimed_user_id` is set after a successful payment so the same reference
--   number can't be reused.

CREATE TABLE IF NOT EXISTS public.prefilled_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number TEXT NOT NULL,
  full_name TEXT,
  father_name TEXT,
  gender TEXT,
  dob TEXT,
  university_name TEXT,
  college_name TEXT,
  degree TEXT,
  department TEXT,
  subject TEXT,
  session TEXT,
  semester TEXT,
  internship_domain TEXT,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  university_id UUID REFERENCES public.universities(id) ON DELETE SET NULL,
  college_id UUID REFERENCES public.colleges(id) ON DELETE SET NULL,
  claimed_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_prefilled_ref
  ON public.prefilled_students(lower(reference_number));

CREATE INDEX IF NOT EXISTS idx_prefilled_college ON public.prefilled_students(college_id);
CREATE INDEX IF NOT EXISTS idx_prefilled_university ON public.prefilled_students(university_id);
CREATE INDEX IF NOT EXISTS idx_prefilled_claimed ON public.prefilled_students(claimed_user_id);
CREATE INDEX IF NOT EXISTS idx_prefilled_dob ON public.prefilled_students(dob);

ALTER TABLE public.prefilled_students ENABLE ROW LEVEL SECURITY;

-- Admins / super-admins manage rows; everyone else gets data only via RPCs.
DROP POLICY IF EXISTS prefilled_admin_all ON public.prefilled_students;
CREATE POLICY prefilled_admin_all ON public.prefilled_students
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'super_admin')
    )
  );

-- Anon-callable RPC: look up by reference + DOB. Returns at most one row.
-- DOB comparison is loose (string-equal) because CSV formats vary.
CREATE OR REPLACE FUNCTION public.match_prefilled_student(
  p_reference_number TEXT,
  p_dob TEXT
)
RETURNS TABLE (
  status TEXT,
  data JSONB
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.prefilled_students;
BEGIN
  IF p_reference_number IS NULL OR length(btrim(p_reference_number)) = 0 THEN
    RETURN QUERY SELECT 'none'::TEXT, NULL::JSONB;
    RETURN;
  END IF;

  SELECT * INTO v_row
  FROM public.prefilled_students
  WHERE lower(reference_number) = lower(btrim(p_reference_number))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'none'::TEXT, NULL::JSONB;
    RETURN;
  END IF;

  -- If DOB is stored on the row, require a loose match (ignore separators).
  IF v_row.dob IS NOT NULL AND length(btrim(v_row.dob)) > 0 THEN
    IF p_dob IS NULL OR length(btrim(p_dob)) = 0 THEN
      RETURN QUERY SELECT 'dob_required'::TEXT, NULL::JSONB;
      RETURN;
    END IF;
    IF regexp_replace(btrim(v_row.dob), '[^0-9]', '', 'g')
       <> regexp_replace(btrim(p_dob), '[^0-9]', '', 'g')
    THEN
      RETURN QUERY SELECT 'dob_mismatch'::TEXT, NULL::JSONB;
      RETURN;
    END IF;
  END IF;

  IF v_row.claimed_user_id IS NOT NULL THEN
    RETURN QUERY SELECT 'claimed'::TEXT, NULL::JSONB;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'matched'::TEXT, jsonb_build_object(
    'id', v_row.id,
    'reference_number', v_row.reference_number,
    'full_name', v_row.full_name,
    'father_name', v_row.father_name,
    'gender', v_row.gender,
    'dob', v_row.dob,
    'university_id', v_row.university_id,
    'university_name', v_row.university_name,
    'college_id', v_row.college_id,
    'college_name', v_row.college_name,
    'degree', v_row.degree,
    'department', v_row.department,
    'subject', v_row.subject,
    'session', v_row.session,
    'semester', v_row.semester,
    'internship_domain', v_row.internship_domain,
    'raw_data', v_row.raw_data
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_prefilled_student(TEXT, TEXT) TO anon, authenticated;

-- Mark a prefilled row as claimed after the matching student finishes payment.
CREATE OR REPLACE FUNCTION public.claim_prefilled_student(
  p_reference_number TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_affected INT;
BEGIN
  IF p_reference_number IS NULL OR p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.prefilled_students
  SET claimed_user_id = p_user_id,
      claimed_at = now()
  WHERE lower(reference_number) = lower(btrim(p_reference_number))
    AND claimed_user_id IS NULL;

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_prefilled_student(TEXT, UUID) TO authenticated, service_role;
