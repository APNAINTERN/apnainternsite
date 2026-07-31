-- Class Link Management: targeting + student-scoped listing

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS target_universities text[],
  ADD COLUMN IF NOT EXISTS target_colleges text[],
  ADD COLUMN IF NOT EXISTS target_domains text[],
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_link_type_check;
ALTER TABLE public.classes ADD CONSTRAINT classes_link_type_check
  CHECK (link_type IN ('youtube', 'meet', 'zoom', 'teams', 'url'));

CREATE OR REPLACE FUNCTION public.class_targets_are_universal(
  p_target_universities text[],
  p_target_colleges text[],
  p_target_domains text[],
  p_domain_id uuid
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    (p_target_universities IS NULL OR cardinality(p_target_universities) = 0)
    AND (p_target_colleges IS NULL OR cardinality(p_target_colleges) = 0)
    AND (p_target_domains IS NULL OR cardinality(p_target_domains) = 0)
    AND p_domain_id IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.student_matches_class_targets(
  p_student_id uuid,
  p_target_universities text[],
  p_target_colleges text[],
  p_target_domains text[],
  p_domain_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student public.students%ROWTYPE;
  v_domain_name text;
  v_college_names text[];
BEGIN
  IF public.class_targets_are_universal(
    p_target_universities, p_target_colleges, p_target_domains, p_domain_id
  ) THEN
    RETURN true;
  END IF;

  SELECT * INTO v_student FROM public.students s WHERE s.id = p_student_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_target_domains IS NOT NULL AND cardinality(p_target_domains) > 0 THEN
    IF NOT (
      COALESCE(v_student.internship_domain, '') = ANY (p_target_domains)
      OR COALESCE(v_student.course, '') = ANY (p_target_domains)
    ) THEN
      RETURN false;
    END IF;
  ELSIF p_domain_id IS NOT NULL THEN
    SELECT d.name INTO v_domain_name
    FROM public.internship_domains d
    WHERE d.id = p_domain_id;
    IF v_domain_name IS NOT NULL
      AND COALESCE(v_student.internship_domain, v_student.course, '') <> v_domain_name THEN
      RETURN false;
    END IF;
  END IF;

  IF p_target_colleges IS NOT NULL AND cardinality(p_target_colleges) > 0 THEN
    IF NOT (COALESCE(v_student.college_name, '') = ANY (p_target_colleges)) THEN
      RETURN false;
    END IF;
  END IF;

  IF p_target_universities IS NOT NULL AND cardinality(p_target_universities) > 0 THEN
    SELECT array_agg(c.name)
    INTO v_college_names
    FROM public.colleges c
    JOIN public.universities u ON u.id = c.university_id
    WHERE u.name = ANY (p_target_universities);

    IF NOT (
      COALESCE(v_student.university_name, '') = ANY (p_target_universities)
      OR (
        v_college_names IS NOT NULL
        AND COALESCE(v_student.college_name, '') = ANY (v_college_names)
      )
    ) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_count_class_target_students(
  p_universities text[] DEFAULT NULL,
  p_colleges text[] DEFAULT NULL,
  p_domains text[] DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint;
BEGIN
  PERFORM public.assert_may_admin_list_students();

  IF public.class_targets_are_universal(p_universities, p_colleges, p_domains, NULL) THEN
    SELECT count(*) INTO v_count FROM public.students;
    RETURN v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.students s
  WHERE public.student_matches_class_targets(
    s.id,
    p_universities,
    p_colleges,
    p_domains,
    NULL
  );

  RETURN COALESCE(v_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_classes_for_student()
RETURNS SETOF public.classes
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT c.*
  FROM public.classes c
  WHERE COALESCE(c.is_active, true) = true
    AND public.student_matches_class_targets(
      v_uid,
      c.target_universities,
      c.target_colleges,
      c.target_domains,
      c.domain_id
    )
  ORDER BY c.scheduled_at ASC NULLS LAST, c.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.class_targets_are_universal(text[], text[], text[], uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_matches_class_targets(uuid, text[], text[], text[], uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_count_class_target_students(text[], text[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_classes_for_student() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_count_class_target_students(text[], text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_classes_for_student() TO authenticated;
