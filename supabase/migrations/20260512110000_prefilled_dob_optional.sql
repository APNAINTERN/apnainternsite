-- Make DOB strictly optional in the reference-number lookup. If the caller
-- supplies a DOB we still verify it (loose, digits-only match); if they
-- leave it blank we skip the check and return the matched row anyway.

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
  v_dob_supplied BOOLEAN;
BEGIN
  IF p_reference_number IS NULL OR length(btrim(p_reference_number)) = 0 THEN
    RETURN QUERY SELECT 'none'::TEXT, NULL::JSONB; RETURN;
  END IF;

  SELECT * INTO v_row
  FROM public.prefilled_students
  WHERE lower(reference_number) = lower(btrim(p_reference_number))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'none'::TEXT, NULL::JSONB; RETURN;
  END IF;

  v_dob_supplied := p_dob IS NOT NULL AND length(btrim(p_dob)) > 0;

  -- Only verify DOB when the caller supplied one *and* we have one on file.
  IF v_dob_supplied
     AND v_row.dob IS NOT NULL
     AND length(btrim(v_row.dob)) > 0
  THEN
    IF regexp_replace(btrim(v_row.dob), '[^0-9]', '', 'g')
       <> regexp_replace(btrim(p_dob), '[^0-9]', '', 'g')
    THEN
      RETURN QUERY SELECT 'dob_mismatch'::TEXT, NULL::JSONB; RETURN;
    END IF;
  END IF;

  IF v_row.claimed_user_id IS NOT NULL THEN
    RETURN QUERY SELECT 'claimed'::TEXT, NULL::JSONB; RETURN;
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
