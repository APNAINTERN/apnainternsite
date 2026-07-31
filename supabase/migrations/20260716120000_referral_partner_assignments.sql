-- Referral partner ↔ university/college assignments + attribution gating.
-- Signups from unassigned institutions still succeed, but students.referral_code
-- is left null so they do not count toward the partner's referrals.

CREATE TABLE IF NOT EXISTS public.referral_partner_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.referral_partners(id) ON DELETE CASCADE,
  university_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  college_id uuid REFERENCES public.colleges(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique: one university-wide row (college_id NULL) and one row per college.
CREATE UNIQUE INDEX IF NOT EXISTS referral_partner_assignments_uni_wide_uidx
  ON public.referral_partner_assignments (partner_id, university_id)
  WHERE college_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS referral_partner_assignments_college_uidx
  ON public.referral_partner_assignments (partner_id, college_id)
  WHERE college_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_referral_partner_assignments_partner
  ON public.referral_partner_assignments (partner_id);

ALTER TABLE public.referral_partner_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage referral partner assignments" ON public.referral_partner_assignments;
CREATE POLICY "Admins manage referral partner assignments"
  ON public.referral_partner_assignments
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_partner_assignments TO authenticated;

CREATE OR REPLACE FUNCTION public.normalize_institution_key(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.institutions_match(a text, b text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN length(public.normalize_institution_key(a)) = 0
        OR length(public.normalize_institution_key(b)) = 0 THEN false
      WHEN public.normalize_institution_key(a) = public.normalize_institution_key(b) THEN true
      WHEN position(public.normalize_institution_key(a) IN public.normalize_institution_key(b)) > 0 THEN true
      WHEN position(public.normalize_institution_key(b) IN public.normalize_institution_key(a)) > 0 THEN true
      ELSE false
    END;
$$;

-- Returns canonical referral_code when the partner is active AND the student's
-- university/college is within their assignments (or partner has no assignments = legacy open).
-- Returns NULL when the code is invalid/inactive OR the institution is not assigned
-- (registration may still proceed without storing referral_code).
CREATE OR REPLACE FUNCTION public.resolve_referral_attribution(
  p_code text,
  p_university_name text DEFAULT NULL,
  p_college_name text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_id uuid;
  v_code text;
  v_has_assignments boolean;
  v_ok boolean;
BEGIN
  SELECT rp.id, rp.referral_code
  INTO v_partner_id, v_code
  FROM public.referral_partners rp
  WHERE lower(trim(rp.referral_code)) = lower(trim(nullif(p_code, '')))
    AND rp.active = true
  LIMIT 1;

  IF v_code IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.referral_partner_assignments a
    WHERE a.partner_id = v_partner_id
  ) INTO v_has_assignments;

  IF NOT coalesce(v_has_assignments, false) THEN
    RETURN v_code;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.referral_partner_assignments a
    JOIN public.universities u ON u.id = a.university_id
    LEFT JOIN public.colleges c ON c.id = a.college_id
    WHERE a.partner_id = v_partner_id
      AND public.institutions_match(u.name, p_university_name)
      AND (
        a.college_id IS NULL
        OR public.institutions_match(c.name, p_college_name)
      )
  ) INTO v_ok;

  IF coalesce(v_ok, false) THEN
    RETURN v_code;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_referral_attribution(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_referral_attribution(text, text, text) TO anon, authenticated;
