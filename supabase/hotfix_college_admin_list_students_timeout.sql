-- Fast college admin scope: index lookup on institution key + university keys (no 50k × 85 join).
-- Run entire file on production: unqfphgjilxpbzajcdjl

CREATE OR REPLACE FUNCTION public.college_institution_key(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT public.normalize_college_match_key(
    NULLIF(trim(split_part(coalesce(trim(t), ''), ',', 1)), '')
  );
$$;

GRANT EXECUTE ON FUNCTION public.college_institution_key(text) TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_students_college_institution_key
  ON public.students (public.college_institution_key(college_name))
  WHERE coalesce(trim(college_name), '') <> '';

CREATE INDEX IF NOT EXISTS idx_students_college_name_lower
  ON public.students (lower(trim(college_name)))
  WHERE coalesce(trim(college_name), '') <> '';

CREATE INDEX IF NOT EXISTS idx_students_university_match_key
  ON public.students (public.normalize_college_match_key(university_name))
  WHERE coalesce(trim(university_name), '') <> '';

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
    OR (
      public.normalize_college_match_key(ref) ~ '(lnmu|mithila|lalitnarayanmithila)'
      AND public.normalize_college_match_key(student_uni) ~ '(lnmu|mithila|lalitnarayanmithila)'
    );
$$;

CREATE OR REPLACE FUNCTION public.college_admin_college_matches_student(
  p_assigned_college text,
  p_assigned_uni text,
  p_student_college text,
  p_student_uni text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    coalesce(trim(p_student_college), '') <> ''
    AND public.university_names_match(p_assigned_uni, p_student_uni)
    AND (
      lower(trim(p_student_college)) = lower(trim(p_assigned_college))
      OR (
        public.college_institution_key(p_assigned_college) <> ''
        AND public.college_institution_key(p_assigned_college)
          = public.college_institution_key(p_student_college)
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.college_admin_college_matches_student(text, text, text, text)
  TO anon, authenticated;

-- One row per college admin session: assignment keys loaded once per query (STABLE + auth.uid()).
CREATE OR REPLACE FUNCTION public.college_admin_assigned_scope()
RETURNS TABLE(
  institution_keys text[],
  exact_college_names text[],
  university_keys text[],
  allow_lnmu boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    coalesce(
      array_agg(DISTINCT public.college_institution_key(c.name))
        FILTER (WHERE public.college_institution_key(c.name) <> ''),
      '{}'::text[]
    ),
    coalesce(
      array_agg(DISTINCT lower(trim(c.name)))
        FILTER (WHERE coalesce(trim(c.name), '') <> ''),
      '{}'::text[]
    ),
    coalesce(
      array_agg(DISTINCT public.normalize_college_match_key(u.name))
        FILTER (WHERE coalesce(trim(u.name), '') <> ''),
      '{}'::text[]
    ),
    coalesce(
      bool_or(
        public.normalize_college_match_key(u.name) ~ '(lnmu|mithila|lalitnarayanmithila)'
      ),
      false
    )
  FROM public.college_admin_assignments caa
  JOIN public.colleges c ON c.id = caa.college_id
  LEFT JOIN public.universities u ON u.id = c.university_id
  WHERE caa.user_id = auth.uid()
    AND public.has_role(auth.uid(), 'college_admin'::public.app_role);
$$;

REVOKE ALL ON FUNCTION public.college_admin_assigned_scope() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.college_admin_assigned_scope() TO authenticated;

CREATE OR REPLACE FUNCTION public.student_university_in_assigned_scope(
  p_student_uni text,
  p_university_keys text[],
  p_allow_lnmu boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    coalesce(trim(p_student_uni), '') = ''
    OR cardinality(coalesce(p_university_keys, '{}'::text[])) = 0
    OR public.normalize_college_match_key(p_student_uni) = ANY(p_university_keys)
    OR (
      p_allow_lnmu
      AND public.normalize_college_match_key(p_student_uni) ~ '(lnmu|mithila|lalitnarayanmithila)'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(coalesce(p_university_keys, '{}'::text[])) AS uk(ref_key)
      WHERE length(ref_key) >= 4
        AND length(public.normalize_college_match_key(p_student_uni)) >= 4
        AND (
          ref_key LIKE '%' || public.normalize_college_match_key(p_student_uni) || '%'
          OR public.normalize_college_match_key(p_student_uni) LIKE '%' || ref_key || '%'
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.college_admin_student_in_scope(
  p_college_name text,
  p_university_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.college_admin_assigned_scope() sc
    WHERE coalesce(trim(p_college_name), '') <> ''
      AND public.student_university_in_assigned_scope(
        p_university_name,
        sc.university_keys,
        sc.allow_lnmu
      )
      AND (
        lower(trim(p_college_name)) = ANY(sc.exact_college_names)
        OR public.college_institution_key(p_college_name) = ANY(sc.institution_keys)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.college_admin_student_in_scope(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.college_admin_student_in_scope(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.college_admin_directory_college_names()
RETURNS TABLE(directory_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT trim(s.college_name) AS directory_name
  FROM public.students s
  CROSS JOIN public.college_admin_assigned_scope() sc
  WHERE coalesce(trim(s.college_name), '') <> ''
    AND cardinality(sc.institution_keys) + cardinality(sc.exact_college_names) > 0
    AND public.student_university_in_assigned_scope(
      s.university_name,
      sc.university_keys,
      sc.allow_lnmu
    )
    AND (
      lower(trim(s.college_name)) = ANY(sc.exact_college_names)
      OR public.college_institution_key(s.college_name) = ANY(sc.institution_keys)
    )
  ORDER BY 1;
$$;

ALTER FUNCTION public.college_admin_directory_college_names() SET statement_timeout = '30s';

REVOKE ALL ON FUNCTION public.college_admin_directory_college_names() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.college_admin_directory_college_names() TO authenticated;

CREATE OR REPLACE FUNCTION public.college_admin_student_visible(
  p_admin_id uuid,
  p_student_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    JOIN public.college_admin_assignments caa ON caa.user_id = p_admin_id
    JOIN public.colleges c ON c.id = caa.college_id
    LEFT JOIN public.universities u ON u.id = c.university_id
    WHERE s.id = p_student_id
      AND public.college_admin_college_matches_student(
        c.name,
        u.name,
        s.college_name,
        s.university_name
      )
  );
$$;

REVOKE ALL ON FUNCTION public.college_admin_student_visible(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.college_admin_student_visible(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "College admins view their college students" ON public.students;
CREATE POLICY "College admins view their college students"
  ON public.students
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'college_admin'::public.app_role)
    AND public.college_admin_student_in_scope(college_name, university_name)
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
  CROSS JOIN public.college_admin_assigned_scope() sc
  WHERE coalesce(trim(s.college_name), '') <> ''
    AND cardinality(sc.institution_keys) + cardinality(sc.exact_college_names) > 0
    AND public.student_university_in_assigned_scope(
      s.university_name,
      sc.university_keys,
      sc.allow_lnmu
    )
    AND (
      lower(trim(s.college_name)) = ANY(sc.exact_college_names)
      OR public.college_institution_key(s.college_name) = ANY(sc.institution_keys)
    )
  ORDER BY s.created_at DESC
  LIMIT 50000;
$$;

ALTER FUNCTION public.college_admin_list_students() SET statement_timeout = '30s';

REVOKE ALL ON FUNCTION public.college_admin_list_students() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.college_admin_list_students() TO authenticated;

-- Optional: load one directory college quickly (dashboard filter).
CREATE OR REPLACE FUNCTION public.college_admin_list_students_for_college(p_directory_name text)
RETURNS SETOF public.students
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.*
  FROM public.students s
  CROSS JOIN public.college_admin_assigned_scope() sc
  WHERE trim(s.college_name) = trim(p_directory_name)
    AND public.student_university_in_assigned_scope(
      s.university_name,
      sc.university_keys,
      sc.allow_lnmu
    )
    AND (
      lower(trim(s.college_name)) = ANY(sc.exact_college_names)
      OR public.college_institution_key(s.college_name) = ANY(sc.institution_keys)
    )
  ORDER BY s.created_at DESC
  LIMIT 10000;
$$;

ALTER FUNCTION public.college_admin_list_students_for_college(text) SET statement_timeout = '15s';

REVOKE ALL ON FUNCTION public.college_admin_list_students_for_college(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.college_admin_list_students_for_college(text) TO authenticated;

-- Exact counts (same scope as list RPCs) — use for parity with Admin student directory.
CREATE OR REPLACE FUNCTION public.college_admin_count_students()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::bigint
  FROM public.students s
  CROSS JOIN public.college_admin_assigned_scope() sc
  WHERE coalesce(trim(s.college_name), '') <> ''
    AND cardinality(sc.institution_keys) + cardinality(sc.exact_college_names) > 0
    AND public.student_university_in_assigned_scope(
      s.university_name,
      sc.university_keys,
      sc.allow_lnmu
    )
    AND (
      lower(trim(s.college_name)) = ANY(sc.exact_college_names)
      OR public.college_institution_key(s.college_name) = ANY(sc.institution_keys)
    );
$$;

CREATE OR REPLACE FUNCTION public.college_admin_count_students_for_college(p_directory_name text)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::bigint
  FROM public.students s
  CROSS JOIN public.college_admin_assigned_scope() sc
  WHERE trim(s.college_name) = trim(p_directory_name)
    AND public.student_university_in_assigned_scope(
      s.university_name,
      sc.university_keys,
      sc.allow_lnmu
    )
    AND (
      lower(trim(s.college_name)) = ANY(sc.exact_college_names)
      OR public.college_institution_key(s.college_name) = ANY(sc.institution_keys)
    );
$$;

REVOKE ALL ON FUNCTION public.college_admin_count_students() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.college_admin_count_students() TO authenticated;
REVOKE ALL ON FUNCTION public.college_admin_count_students_for_college(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.college_admin_count_students_for_college(text) TO authenticated;
