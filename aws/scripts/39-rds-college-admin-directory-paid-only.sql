-- College admin portal: only show directory-visible (paid) students.
-- Exclude unpaid Student Data Upload / payment_required rows — same as Admin Directory.

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
    AND NOT public.student_is_pending_directory_payment(s)
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
    AND NOT public.student_is_pending_directory_payment(s)
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
    AND NOT public.student_is_pending_directory_payment(s)
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
    AND NOT public.student_is_pending_directory_payment(s)
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

REVOKE ALL ON FUNCTION public.college_admin_count_students_for_college(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.college_admin_count_students_for_college(text) TO authenticated;

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
    AND NOT public.student_is_pending_directory_payment(s)
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

-- RLS: college admins must not see unpaid pending-directory rows via direct SELECT
DROP POLICY IF EXISTS "College admins view their college students" ON public.students;
CREATE POLICY "College admins view their college students"
  ON public.students
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'college_admin'::public.app_role)
    AND public.college_admin_student_in_scope(college_name, university_name)
    AND NOT (
      lower(trim(COALESCE(public.safe_text_to_jsonb(metadata)->>'payment_required', 'false')))
        IN ('true', 't', '1')
      OR lower(trim(COALESCE(public.safe_text_to_jsonb(metadata)->>'bulk_upload_paid', 'true')))
        IN ('false', 'f', '0')
    )
  );
