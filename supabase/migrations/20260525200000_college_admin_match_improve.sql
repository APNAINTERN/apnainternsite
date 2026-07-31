-- Stronger college name matching for college admin portal (LNMU Darbhanga abbreviations,
-- commas, dots in "M. L. S. M. College", etc.) + optional university alignment.

CREATE OR REPLACE FUNCTION public.normalize_college_match_key(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(
    regexp_replace(
      lower(trim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g'))),
      '\.', '', 'g'
    ),
    '[^a-z0-9]', '', 'g'
  )
$$;

CREATE OR REPLACE FUNCTION public.college_name_match_keys(t text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  raw text := trim(coalesce(t, ''));
  keys text[] := ARRAY[]::text[];
  part text;
  stripped text;
  k text;
BEGIN
  IF raw = '' THEN
    RETURN keys;
  END IF;

  FOR k IN SELECT unnest(ARRAY[
    public.normalize_college_match_key(raw),
    public.normalize_college_match_key(public.canonical_college_display_name(raw)),
    public.normalize_college_match_key(split_part(raw, ',', 1))
  ]) LOOP
    IF k IS NOT NULL AND k <> '' AND NOT (k = ANY (keys)) THEN
      keys := array_append(keys, k);
    END IF;
  END LOOP;

  stripped := regexp_replace(raw, ',?\s*darbhanga\s*$', '', 'i');
  IF stripped <> raw THEN
    k := public.normalize_college_match_key(stripped);
    IF k <> '' AND NOT (k = ANY (keys)) THEN keys := array_append(keys, k); END IF;
    k := public.normalize_college_match_key(split_part(stripped, ',', 1));
    IF k <> '' AND NOT (k = ANY (keys)) THEN keys := array_append(keys, k); END IF;
  END IF;

  stripped := regexp_replace(stripped, ',?\s*laheriasarai\s*$', '', 'i');
  IF stripped <> '' THEN
    k := public.normalize_college_match_key(stripped);
    IF k <> '' AND NOT (k = ANY (keys)) THEN keys := array_append(keys, k); END IF;
    k := public.normalize_college_match_key(split_part(stripped, ',', 1));
    IF k <> '' AND NOT (k = ANY (keys)) THEN keys := array_append(keys, k); END IF;
  END IF;

  RETURN keys;
END;
$$;

CREATE OR REPLACE FUNCTION public.university_names_match(ref text, student_uni text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    coalesce(trim(student_uni), '') = ''
    OR coalesce(trim(ref), '') = ''
    OR public.normalize_college_match_key(ref) = public.normalize_college_match_key(student_uni)
    OR (
      length(public.normalize_college_match_key(ref)) >= 4
      AND length(public.normalize_college_match_key(student_uni)) >= 4
      AND (
        public.normalize_college_match_key(ref)
          LIKE '%' || public.normalize_college_match_key(student_uni) || '%'
        OR public.normalize_college_match_key(student_uni)
          LIKE '%' || public.normalize_college_match_key(ref) || '%'
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.college_names_match(college_ref text, student_college text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    coalesce(trim(student_college), '') <> ''
    AND EXISTS (
      SELECT 1
      FROM unnest(public.college_name_match_keys(college_ref)) AS rk
      CROSS JOIN unnest(public.college_name_match_keys(student_college)) AS sk
      WHERE rk = sk
         OR (
           length(rk) >= 6
           AND length(sk) >= 6
           AND (rk LIKE '%' || sk || '%' OR sk LIKE '%' || rk || '%')
         )
    )
$$;

DROP POLICY IF EXISTS "College admins view their college students" ON public.students;
CREATE POLICY "College admins view their college students"
  ON public.students
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'college_admin'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.college_admin_assignments caa
      JOIN public.colleges c ON c.id = caa.college_id
      LEFT JOIN public.universities u ON u.id = c.university_id
      WHERE caa.user_id = auth.uid()
        AND public.college_names_match(c.name, public.students.college_name)
        AND public.university_names_match(u.name, public.students.university_name)
    )
  );

DROP POLICY IF EXISTS "College admins view profiles of their college students" ON public.profiles;
CREATE POLICY "College admins view profiles of their college students"
  ON public.profiles
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'college_admin'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.college_admin_assignments caa ON caa.user_id = auth.uid()
      JOIN public.colleges c ON c.id = caa.college_id
      LEFT JOIN public.universities u ON u.id = c.university_id
      WHERE s.id = public.profiles.id
        AND public.college_names_match(c.name, s.college_name)
        AND public.university_names_match(u.name, s.university_name)
    )
  );

CREATE OR REPLACE FUNCTION public.college_admin_list_students()
RETURNS SETOF public.students
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.*
  FROM public.students s
  WHERE public.has_role(auth.uid(), 'college_admin'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.college_admin_assignments caa
      JOIN public.colleges c ON c.id = caa.college_id
      LEFT JOIN public.universities u ON u.id = c.university_id
      WHERE caa.user_id = auth.uid()
        AND public.college_names_match(c.name, s.college_name)
        AND public.university_names_match(u.name, s.university_name)
    )
  ORDER BY s.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.college_admin_list_students() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.college_admin_list_students() TO authenticated;

GRANT EXECUTE ON FUNCTION public.normalize_college_match_key(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.college_name_match_keys(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.university_names_match(text, text) TO anon, authenticated;
