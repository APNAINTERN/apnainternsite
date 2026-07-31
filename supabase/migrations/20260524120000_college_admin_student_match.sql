-- College admin students: match assigned colleges to student.college_name reliably
-- (handles display aliases, commas in college names, PDKJ rename).

CREATE OR REPLACE FUNCTION public.canonical_college_display_name(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN coalesce(t, '') ~* 'prof'
      AND coalesce(t, '') ~* 'chandra'
      AND coalesce(t, '') ~* 'shekhar'
      AND coalesce(t, '') ~* 'jha'
      AND coalesce(t, '') ~* 'pdkj'
      THEN 'PDKJ College'
    ELSE trim(coalesce(t, ''))
  END
$$;

CREATE OR REPLACE FUNCTION public.college_names_match(college_ref text, student_college text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    coalesce(trim(student_college), '') <> ''
    AND (
      public.normalize_space_label(college_ref) = public.normalize_space_label(student_college)
      OR public.normalize_space_label(public.canonical_college_display_name(college_ref))
        = public.normalize_space_label(student_college)
      OR public.normalize_space_label(split_part(college_ref, ',', 1))
        = public.normalize_space_label(student_college)
      OR (
        length(public.normalize_space_label(split_part(college_ref, ',', 1))) >= 8
        AND length(public.normalize_space_label(student_college)) >= 8
        AND (
          public.normalize_space_label(student_college)
            LIKE '%' || public.normalize_space_label(split_part(college_ref, ',', 1)) || '%'
          OR public.normalize_space_label(split_part(college_ref, ',', 1))
            LIKE '%' || public.normalize_space_label(student_college) || '%'
        )
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
      WHERE caa.user_id = auth.uid()
        AND public.college_names_match(c.name, public.students.college_name)
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
      WHERE s.id = public.profiles.id
        AND public.college_names_match(c.name, s.college_name)
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
      WHERE caa.user_id = auth.uid()
        AND public.college_names_match(c.name, s.college_name)
    )
  ORDER BY s.created_at DESC
  LIMIT 10000;
$$;

REVOKE ALL ON FUNCTION public.college_admin_list_students() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.college_admin_list_students() TO authenticated;
