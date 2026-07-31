-- =============================================================================
-- COLLEGE STUDENT ROSTERS
--   * Admin uploads a CSV / XLSX list of pre-approved students per college.
--   * Public registration form looks up rows by (college_id, email | phone) and
--     auto-fills the remaining academic / internship fields.
--   * On successful payment the matched row is "claimed" so it cannot be reused.
--
-- Security model:
--   * RLS lets only admin / super_admin SELECT, INSERT, UPDATE, DELETE.
--   * Anonymous registrants can never read the table directly; they call
--     SECURITY DEFINER RPCs that return at most one row and only when the
--     caller already knows the student's email or phone.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.college_student_rosters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id UUID NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
  university_id UUID REFERENCES public.universities(id) ON DELETE SET NULL,
  full_name TEXT,
  registration_number TEXT,
  email TEXT,
  phone TEXT,
  course TEXT,
  degree TEXT,
  department TEXT,
  subject TEXT,
  class_semester TEXT,
  academic_session TEXT,
  gender TEXT,
  dob TEXT,
  parent_name TEXT,
  internship_mode TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_file TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roster_college ON public.college_student_rosters(college_id);
CREATE INDEX IF NOT EXISTS idx_roster_email
  ON public.college_student_rosters(college_id, lower(email))
  WHERE email IS NOT NULL AND email <> '';
CREATE INDEX IF NOT EXISTS idx_roster_phone
  ON public.college_student_rosters(college_id, phone)
  WHERE phone IS NOT NULL AND phone <> '';
CREATE INDEX IF NOT EXISTS idx_roster_regno
  ON public.college_student_rosters(college_id, lower(registration_number))
  WHERE registration_number IS NOT NULL AND registration_number <> '';
CREATE INDEX IF NOT EXISTS idx_roster_claimed
  ON public.college_student_rosters(claimed_user_id)
  WHERE claimed_user_id IS NOT NULL;

ALTER TABLE public.college_student_rosters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read college rosters" ON public.college_student_rosters;
CREATE POLICY "Admins read college rosters" ON public.college_student_rosters
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Admins write college rosters" ON public.college_student_rosters;
CREATE POLICY "Admins write college rosters" ON public.college_student_rosters
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  )
);

-- Saved column mapping per college so re-uploads are one click.
CREATE TABLE IF NOT EXISTS public.college_roster_mappings (
  college_id UUID PRIMARY KEY REFERENCES public.colleges(id) ON DELETE CASCADE,
  mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.college_roster_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage roster mappings" ON public.college_roster_mappings;
CREATE POLICY "Admins manage roster mappings" ON public.college_roster_mappings
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  )
);

-- =============================================================================
-- RPCs
-- =============================================================================

-- Bulk insert / update — admin only via JWT.
-- p_rows is an array of jsonb objects with snake_case keys matching the table.
CREATE OR REPLACE FUNCTION public.upsert_college_roster_rows(
  p_college_id UUID,
  p_rows JSONB,
  p_source_file TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_university_id UUID;
  v_row JSONB;
  v_inserted INT := 0;
  v_updated INT := 0;
  v_skipped INT := 0;
  v_existing UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  SELECT university_id INTO v_university_id FROM public.colleges WHERE id = p_college_id;
  IF v_university_id IS NULL THEN
    RAISE EXCEPTION 'Unknown college_id %', p_college_id USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb))
  LOOP
    -- Skip blank rows.
    IF COALESCE(NULLIF(trim(v_row->>'full_name'), ''), NULLIF(trim(v_row->>'email'), ''), NULLIF(trim(v_row->>'phone'), '')) IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Match by (college_id, lower(registration_number)) first, then (college_id, lower(email)).
    v_existing := NULL;
    IF NULLIF(trim(v_row->>'registration_number'), '') IS NOT NULL THEN
      SELECT id INTO v_existing
      FROM public.college_student_rosters
      WHERE college_id = p_college_id
        AND lower(trim(registration_number)) = lower(trim(v_row->>'registration_number'))
      LIMIT 1;
    END IF;

    IF v_existing IS NULL AND NULLIF(trim(v_row->>'email'), '') IS NOT NULL THEN
      SELECT id INTO v_existing
      FROM public.college_student_rosters
      WHERE college_id = p_college_id
        AND lower(trim(email)) = lower(trim(v_row->>'email'))
      LIMIT 1;
    END IF;

    IF v_existing IS NOT NULL THEN
      UPDATE public.college_student_rosters
      SET
        university_id = v_university_id,
        full_name = COALESCE(NULLIF(trim(v_row->>'full_name'), ''), full_name),
        registration_number = COALESCE(NULLIF(trim(v_row->>'registration_number'), ''), registration_number),
        email = COALESCE(NULLIF(lower(trim(v_row->>'email')), ''), email),
        phone = COALESCE(NULLIF(regexp_replace(COALESCE(v_row->>'phone', ''), '\D', '', 'g'), ''), phone),
        course = COALESCE(NULLIF(trim(v_row->>'course'), ''), course),
        degree = COALESCE(NULLIF(trim(v_row->>'degree'), ''), degree),
        department = COALESCE(NULLIF(trim(v_row->>'department'), ''), department),
        subject = COALESCE(NULLIF(trim(v_row->>'subject'), ''), subject),
        class_semester = COALESCE(NULLIF(trim(v_row->>'class_semester'), ''), class_semester),
        academic_session = COALESCE(NULLIF(trim(v_row->>'academic_session'), ''), academic_session),
        gender = COALESCE(NULLIF(trim(v_row->>'gender'), ''), gender),
        dob = COALESCE(NULLIF(trim(v_row->>'dob'), ''), dob),
        parent_name = COALESCE(NULLIF(trim(v_row->>'parent_name'), ''), parent_name),
        internship_mode = COALESCE(NULLIF(trim(v_row->>'internship_mode'), ''), internship_mode),
        metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(v_row->'metadata', '{}'::jsonb),
        source_file = COALESCE(p_source_file, source_file),
        uploaded_by = auth.uid(),
        uploaded_at = now(),
        updated_at = now()
      WHERE id = v_existing;
      v_updated := v_updated + 1;
    ELSE
      INSERT INTO public.college_student_rosters (
        college_id, university_id, full_name, registration_number, email, phone,
        course, degree, department, subject, class_semester, academic_session,
        gender, dob, parent_name, internship_mode, metadata, source_file, uploaded_by
      ) VALUES (
        p_college_id,
        v_university_id,
        NULLIF(trim(v_row->>'full_name'), ''),
        NULLIF(trim(v_row->>'registration_number'), ''),
        NULLIF(lower(trim(v_row->>'email')), ''),
        NULLIF(regexp_replace(COALESCE(v_row->>'phone', ''), '\D', '', 'g'), ''),
        NULLIF(trim(v_row->>'course'), ''),
        NULLIF(trim(v_row->>'degree'), ''),
        NULLIF(trim(v_row->>'department'), ''),
        NULLIF(trim(v_row->>'subject'), ''),
        NULLIF(trim(v_row->>'class_semester'), ''),
        NULLIF(trim(v_row->>'academic_session'), ''),
        NULLIF(trim(v_row->>'gender'), ''),
        NULLIF(trim(v_row->>'dob'), ''),
        NULLIF(trim(v_row->>'parent_name'), ''),
        NULLIF(trim(v_row->>'internship_mode'), ''),
        COALESCE(v_row->'metadata', '{}'::jsonb),
        p_source_file,
        auth.uid()
      );
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'updated', v_updated,
    'skipped', v_skipped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_college_roster_rows(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_college_roster_rows(UUID, JSONB, TEXT) TO authenticated;

-- Public lookup — anon callable. Returns at most one row, and only when the
-- caller already knows the email or phone for that college.
CREATE OR REPLACE FUNCTION public.match_college_roster(
  p_college_id UUID,
  p_email TEXT,
  p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_norm_email TEXT := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
  v_norm_phone TEXT;
  v_phone_tail TEXT;
  v_row public.college_student_rosters%ROWTYPE;
  v_count INT;
BEGIN
  IF p_college_id IS NULL THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;

  v_norm_phone := NULLIF(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), '');
  IF v_norm_phone IS NOT NULL AND length(v_norm_phone) >= 10 THEN
    v_phone_tail := right(v_norm_phone, 10);
  ELSE
    v_phone_tail := v_norm_phone;
  END IF;

  IF v_norm_email IS NULL AND v_phone_tail IS NULL THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;

  -- 1) Tightest match: email AND phone match same row.
  IF v_norm_email IS NOT NULL AND v_phone_tail IS NOT NULL THEN
    SELECT * INTO v_row
    FROM public.college_student_rosters
    WHERE college_id = p_college_id
      AND lower(trim(email)) = v_norm_email
      AND right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 10) = v_phone_tail
    LIMIT 1;
    IF FOUND THEN
      RETURN public._roster_match_result(v_row);
    END IF;
  END IF;

  -- 2) Email-only match (must be unique).
  IF v_norm_email IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM public.college_student_rosters
    WHERE college_id = p_college_id
      AND lower(trim(email)) = v_norm_email;
    IF v_count = 1 THEN
      SELECT * INTO v_row
      FROM public.college_student_rosters
      WHERE college_id = p_college_id
        AND lower(trim(email)) = v_norm_email
      LIMIT 1;
      RETURN public._roster_match_result(v_row);
    ELSIF v_count > 1 THEN
      RETURN jsonb_build_object('status', 'ambiguous');
    END IF;
  END IF;

  -- 3) Phone-only match (must be unique).
  IF v_phone_tail IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM public.college_student_rosters
    WHERE college_id = p_college_id
      AND right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 10) = v_phone_tail;
    IF v_count = 1 THEN
      SELECT * INTO v_row
      FROM public.college_student_rosters
      WHERE college_id = p_college_id
        AND right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 10) = v_phone_tail
      LIMIT 1;
      RETURN public._roster_match_result(v_row);
    ELSIF v_count > 1 THEN
      RETURN jsonb_build_object('status', 'ambiguous');
    END IF;
  END IF;

  RETURN jsonb_build_object('status', 'none');
END;
$$;

-- Internal helper that shapes a roster row into the response. Kept separate so
-- the access policy is "only callable via match_college_roster".
CREATE OR REPLACE FUNCTION public._roster_match_result(v_row public.college_student_rosters)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF v_row.claimed_user_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'claimed');
  END IF;
  RETURN jsonb_build_object(
    'status', 'matched',
    'data', jsonb_build_object(
      'id', v_row.id,
      'full_name', v_row.full_name,
      'registration_number', v_row.registration_number,
      'email', v_row.email,
      'phone', v_row.phone,
      'course', v_row.course,
      'degree', v_row.degree,
      'department', v_row.department,
      'subject', v_row.subject,
      'class_semester', v_row.class_semester,
      'academic_session', v_row.academic_session,
      'gender', v_row.gender,
      'dob', v_row.dob,
      'parent_name', v_row.parent_name,
      'internship_mode', v_row.internship_mode,
      'metadata', v_row.metadata
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public._roster_match_result(public.college_student_rosters) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.match_college_roster(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_college_roster(UUID, TEXT, TEXT) TO anon, authenticated;

-- Claim a roster row for a given auth user after a successful payment.
-- Called from the payment-verify endpoint with the service-role key, but also
-- usable by the matched user themselves (auth.uid()) since they own the row
-- they just claimed.
CREATE OR REPLACE FUNCTION public.claim_college_roster_row(
  p_college_id UUID,
  p_user_id UUID,
  p_email TEXT,
  p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm_email TEXT := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
  v_norm_phone TEXT;
  v_phone_tail TEXT;
  v_id UUID;
BEGIN
  v_norm_phone := NULLIF(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), '');
  IF v_norm_phone IS NOT NULL AND length(v_norm_phone) >= 10 THEN
    v_phone_tail := right(v_norm_phone, 10);
  ELSE
    v_phone_tail := v_norm_phone;
  END IF;

  IF p_user_id IS NULL OR p_college_id IS NULL OR (v_norm_email IS NULL AND v_phone_tail IS NULL) THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'missing_params');
  END IF;

  SELECT id INTO v_id
  FROM public.college_student_rosters
  WHERE college_id = p_college_id
    AND claimed_user_id IS NULL
    AND (
      (v_norm_email IS NOT NULL AND lower(trim(email)) = v_norm_email)
      OR (v_phone_tail IS NOT NULL AND right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 10) = v_phone_tail)
    )
  ORDER BY (
    CASE
      WHEN v_norm_email IS NOT NULL AND lower(trim(email)) = v_norm_email
       AND v_phone_tail IS NOT NULL AND right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 10) = v_phone_tail
       THEN 0
      ELSE 1
    END
  )
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'no_match');
  END IF;

  UPDATE public.college_student_rosters
  SET claimed_user_id = p_user_id,
      claimed_at = now(),
      updated_at = now()
  WHERE id = v_id
    AND claimed_user_id IS NULL;

  RETURN jsonb_build_object('claimed', true, 'roster_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_college_roster_row(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_college_roster_row(UUID, UUID, TEXT, TEXT) TO authenticated;

-- Aggregate view for the admin "College Rosters" tab.
-- One row per college that has at least one roster row.
CREATE OR REPLACE VIEW public.college_roster_summary AS
SELECT
  c.id AS college_id,
  c.name AS college_name,
  u.id AS university_id,
  u.name AS university_name,
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE r.claimed_user_id IS NOT NULL) AS claimed_rows,
  COUNT(*) FILTER (WHERE r.claimed_user_id IS NULL) AS pending_rows,
  MAX(r.uploaded_at) AS last_uploaded_at
FROM public.college_student_rosters r
JOIN public.colleges c ON c.id = r.college_id
LEFT JOIN public.universities u ON u.id = r.university_id
GROUP BY c.id, c.name, u.id, u.name;

GRANT SELECT ON public.college_roster_summary TO authenticated;
