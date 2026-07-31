-- Internship mode filter (Online / Offline / Hybrid) for directory, notifications, and targeting.
-- Run once in Supabase SQL Editor.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS target_modes text[];

CREATE OR REPLACE FUNCTION public.normalize_student_internship_mode(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_raw IS NULL OR trim(p_raw) = '' THEN 'Online'
    WHEN lower(trim(p_raw)) LIKE 'on%' THEN 'Online'
    WHEN lower(trim(p_raw)) LIKE 'off%' THEN 'Offline'
    WHEN lower(trim(p_raw)) LIKE 'hy%' OR lower(trim(p_raw)) LIKE 'bl%' THEN 'Hybrid'
    ELSE initcap(trim(p_raw))
  END;
$$;

CREATE OR REPLACE FUNCTION public.student_record_internship_mode(s public.students)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT public.normalize_student_internship_mode(
    COALESCE(
      NULLIF(trim(s.metadata->>'internship_mode'), ''),
      NULLIF(trim(s.metadata->>'internshipMode'), '')
    )
  );
$$;

DROP FUNCTION IF EXISTS public.class_targets_are_universal(text[], text[], text[], uuid);
DROP FUNCTION IF EXISTS public.class_targets_are_universal(text[], text[], text[], text[], uuid);

CREATE OR REPLACE FUNCTION public.class_targets_are_universal(
  p_target_universities text[],
  p_target_colleges text[],
  p_target_domains text[],
  p_target_modes text[],
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
    AND (p_target_modes IS NULL OR cardinality(p_target_modes) = 0)
    AND p_domain_id IS NULL;
$$;

DROP FUNCTION IF EXISTS public.student_matches_class_targets(uuid, text[], text[], text[], uuid);

CREATE OR REPLACE FUNCTION public.student_matches_class_targets(
  p_student_id uuid,
  p_target_universities text[],
  p_target_colleges text[],
  p_target_domains text[],
  p_domain_id uuid,
  p_target_modes text[] DEFAULT NULL
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
    p_target_universities, p_target_colleges, p_target_domains, p_target_modes, p_domain_id
  ) THEN
    RETURN true;
  END IF;

  SELECT * INTO v_student FROM public.students s WHERE s.id = p_student_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_target_modes IS NOT NULL AND cardinality(p_target_modes) > 0 THEN
    IF NOT (public.student_record_internship_mode(v_student) = ANY (p_target_modes)) THEN
      RETURN false;
    END IF;
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

DROP FUNCTION IF EXISTS public.admin_count_students_directory(text, text, text, text, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.admin_count_students_directory(
  p_search text DEFAULT NULL,
  p_domain text DEFAULT NULL,
  p_university text DEFAULT NULL,
  p_college text DEFAULT NULL,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL,
  p_mode text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(trim(p_search), '');
  v_mode text := NULLIF(trim(p_mode), '');
BEGIN
  PERFORM public.assert_may_admin_list_students();

  RETURN (
    SELECT count(*)::bigint
    FROM public.students s
    WHERE (
      v_search IS NULL
      OR s.full_name ILIKE '%' || v_search || '%'
      OR s.email ILIKE '%' || v_search || '%'
      OR s.registration_id ILIKE '%' || v_search || '%'
      OR s.contact_number ILIKE '%' || v_search || '%'
      OR s.roll_number ILIKE '%' || v_search || '%'
      OR s.college_name ILIKE '%' || v_search || '%'
      OR s.parent_name ILIKE '%' || v_search || '%'
    )
    AND (p_domain IS NULL OR p_domain = '' OR p_domain = 'all' OR s.internship_domain = p_domain)
    AND (p_university IS NULL OR p_university = '' OR p_university = 'all' OR s.university_name = p_university)
    AND (p_college IS NULL OR p_college = '' OR p_college = 'all' OR s.college_name = p_college)
    AND (v_mode IS NULL OR v_mode = 'all' OR public.student_record_internship_mode(s) = v_mode)
    AND (p_start IS NULL OR s.created_at >= p_start)
    AND (p_end IS NULL OR s.created_at <= p_end)
  );
END;
$$;

DROP FUNCTION IF EXISTS public.admin_list_students_directory(integer, integer, text, text, text, text, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.admin_list_students_directory(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL,
  p_domain text DEFAULT NULL,
  p_university text DEFAULT NULL,
  p_college text DEFAULT NULL,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL,
  p_mode text DEFAULT NULL
)
RETURNS SETOF public.students
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(trim(p_search), '');
  v_mode text := NULLIF(trim(p_mode), '');
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 50), 500));
  v_offset integer := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
  PERFORM public.assert_may_admin_list_students();

  RETURN QUERY
  SELECT s.*
  FROM public.students s
  WHERE (
    v_search IS NULL
    OR s.full_name ILIKE '%' || v_search || '%'
    OR s.email ILIKE '%' || v_search || '%'
    OR s.registration_id ILIKE '%' || v_search || '%'
    OR s.contact_number ILIKE '%' || v_search || '%'
    OR s.roll_number ILIKE '%' || v_search || '%'
    OR s.college_name ILIKE '%' || v_search || '%'
    OR s.parent_name ILIKE '%' || v_search || '%'
  )
  AND (p_domain IS NULL OR p_domain = '' OR p_domain = 'all' OR s.internship_domain = p_domain)
  AND (p_university IS NULL OR p_university = '' OR p_university = 'all' OR s.university_name = p_university)
  AND (p_college IS NULL OR p_college = '' OR p_college = 'all' OR s.college_name = p_college)
  AND (v_mode IS NULL OR v_mode = 'all' OR public.student_record_internship_mode(s) = v_mode)
  AND (p_start IS NULL OR s.created_at >= p_start)
  AND (p_end IS NULL OR s.created_at <= p_end)
  ORDER BY s.created_at DESC NULLS LAST, s.id DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_count_notification_targets(text, uuid, text[], text[], text[]);

CREATE OR REPLACE FUNCTION public.admin_count_notification_targets(
  p_target_type text,
  p_target_user_id uuid DEFAULT NULL,
  p_universities text[] DEFAULT NULL,
  p_colleges text[] DEFAULT NULL,
  p_domains text[] DEFAULT NULL,
  p_modes text[] DEFAULT NULL
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

  IF p_target_type = 'specific' THEN
    IF p_target_user_id IS NULL THEN
      RETURN 0;
    END IF;
    SELECT count(*) INTO v_count FROM public.students s WHERE s.id = p_target_user_id;
    RETURN v_count;
  END IF;

  IF p_target_type = 'all'
     OR public.class_targets_are_universal(p_universities, p_colleges, p_domains, p_modes, NULL) THEN
    SELECT count(*) INTO v_count FROM public.students;
    RETURN v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.students s
  WHERE public.student_matches_class_targets(
    s.id, p_universities, p_colleges, p_domains, NULL, p_modes
  );
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public._notification_fan_out_deliveries(p_notification_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n public.notifications%ROWTYPE;
  v_inserted integer;
BEGIN
  SELECT * INTO v_n FROM public.notifications WHERE id = p_notification_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  DELETE FROM public.notification_deliveries WHERE notification_id = p_notification_id;

  IF v_n.target_type = 'specific' AND v_n.target_user_id IS NOT NULL THEN
    INSERT INTO public.notification_deliveries (notification_id, user_id)
    SELECT p_notification_id, s.id
    FROM public.students s
    WHERE s.id = v_n.target_user_id
    ON CONFLICT (notification_id, user_id) DO NOTHING;
  ELSIF v_n.target_type = 'all'
    OR public.class_targets_are_universal(
      v_n.target_universities, v_n.target_colleges, v_n.target_domains, v_n.target_modes, NULL
    ) THEN
    INSERT INTO public.notification_deliveries (notification_id, user_id)
    SELECT p_notification_id, s.id FROM public.students s
    ON CONFLICT (notification_id, user_id) DO NOTHING;
  ELSE
    INSERT INTO public.notification_deliveries (notification_id, user_id)
    SELECT p_notification_id, s.id
    FROM public.students s
    WHERE public.student_matches_class_targets(
      s.id,
      v_n.target_universities,
      v_n.target_colleges,
      v_n.target_domains,
      NULL,
      v_n.target_modes
    )
    ON CONFLICT (notification_id, user_id) DO NOTHING;
  END IF;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  UPDATE public.notifications
  SET recipient_count = v_inserted, updated_at = now()
  WHERE id = p_notification_id;
  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_publish_notification(p_row jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_target_type text;
  v_status text;
  v_target_user_id uuid;
BEGIN
  PERFORM public.assert_may_admin_list_students();

  v_target_type := COALESCE(NULLIF(trim(p_row->>'target_type'), ''), 'filtered');
  IF v_target_type NOT IN ('all', 'specific', 'filtered') THEN
    v_target_type := 'filtered';
  END IF;

  v_status := COALESCE(NULLIF(trim(p_row->>'status'), ''), 'published');
  IF v_status NOT IN ('draft', 'published') THEN
    v_status := 'published';
  END IF;

  v_target_user_id := NULLIF(trim(p_row->>'target_user_id'), '')::uuid;

  INSERT INTO public.notifications (
    title,
    message,
    target_type,
    target_user_id,
    target_universities,
    target_colleges,
    target_domains,
    target_modes,
    status,
    class_id,
    created_by
  )
  VALUES (
    trim(p_row->>'title'),
    trim(p_row->>'message'),
    v_target_type,
    v_target_user_id,
    CASE
      WHEN p_row ? 'target_universities' AND jsonb_typeof(p_row->'target_universities') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_universities'))
      ELSE NULL
    END,
    CASE
      WHEN p_row ? 'target_colleges' AND jsonb_typeof(p_row->'target_colleges') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_colleges'))
      ELSE NULL
    END,
    CASE
      WHEN p_row ? 'target_domains' AND jsonb_typeof(p_row->'target_domains') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_domains'))
      ELSE NULL
    END,
    CASE
      WHEN p_row ? 'target_modes' AND jsonb_typeof(p_row->'target_modes') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_modes'))
      ELSE NULL
    END,
    v_status,
    NULLIF(trim(p_row->>'class_id'), '')::uuid,
    NULLIF(trim(p_row->>'created_by'), '')::uuid
  )
  RETURNING id INTO v_id;

  IF v_status = 'published' THEN
    PERFORM public._notification_fan_out_deliveries(v_id);
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_notification_draft(p_id uuid, p_row jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_may_admin_list_students();

  IF NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.id = p_id AND n.status = 'draft'
  ) THEN
    RAISE EXCEPTION 'Only draft notifications can be edited';
  END IF;

  UPDATE public.notifications
  SET
    title = trim(p_row->>'title'),
    message = trim(p_row->>'message'),
    target_type = COALESCE(NULLIF(trim(p_row->>'target_type'), ''), target_type),
    target_user_id = NULLIF(trim(p_row->>'target_user_id'), '')::uuid,
    target_universities = CASE
      WHEN p_row ? 'target_universities' AND jsonb_typeof(p_row->'target_universities') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_universities'))
      ELSE NULL
    END,
    target_colleges = CASE
      WHEN p_row ? 'target_colleges' AND jsonb_typeof(p_row->'target_colleges') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_colleges'))
      ELSE NULL
    END,
    target_domains = CASE
      WHEN p_row ? 'target_domains' AND jsonb_typeof(p_row->'target_domains') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_domains'))
      ELSE NULL
    END,
    target_modes = CASE
      WHEN p_row ? 'target_modes' AND jsonb_typeof(p_row->'target_modes') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_modes'))
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = p_id;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_count_class_target_students(text[], text[], text[]);

CREATE OR REPLACE FUNCTION public.admin_count_class_target_students(
  p_universities text[] DEFAULT NULL,
  p_colleges text[] DEFAULT NULL,
  p_domains text[] DEFAULT NULL,
  p_modes text[] DEFAULT NULL
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

  IF public.class_targets_are_universal(p_universities, p_colleges, p_domains, p_modes, NULL) THEN
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
    NULL,
    p_modes
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
      c.domain_id,
      c.target_modes
    )
  ORDER BY c.scheduled_at ASC NULLS LAST, c.created_at DESC;
END;
$$;

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS target_modes text[];

REVOKE ALL ON FUNCTION public.normalize_student_internship_mode(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_record_internship_mode(public.students) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.class_targets_are_universal(text[], text[], text[], text[], uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_matches_class_targets(uuid, text[], text[], text[], uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_count_students_directory(text, text, text, text, timestamptz, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_students_directory(integer, integer, text, text, text, text, timestamptz, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_count_notification_targets(text, uuid, text[], text[], text[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_count_class_target_students(text[], text[], text[], text[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_count_students_directory(text, text, text, text, timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_students_directory(integer, integer, text, text, text, text, timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_count_notification_targets(text, uuid, text[], text[], text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_count_class_target_students(text[], text[], text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_matches_class_targets(uuid, text[], text[], text[], uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_classes_for_student() TO authenticated;

DROP FUNCTION IF EXISTS public.admin_list_students_light();

CREATE OR REPLACE FUNCTION public.admin_list_students_light()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  college_name text,
  university_name text,
  created_at timestamptz,
  status text,
  internship_domain text,
  registration_id text,
  metadata jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_may_admin_list_students();

  RETURN QUERY
  SELECT
    s.id,
    s.full_name,
    s.email,
    s.college_name,
    s.university_name,
    s.created_at,
    s.status,
    s.internship_domain,
    s.registration_id,
    s.metadata
  FROM public.students s
  ORDER BY s.created_at DESC NULLS LAST, s.id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_students_light() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_students_light() TO authenticated;

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS target_modes text[];

DROP FUNCTION IF EXISTS public.admin_count_assignment_targets(text[], text[], text[]);

CREATE OR REPLACE FUNCTION public.admin_count_assignment_targets(
  p_universities text[] DEFAULT NULL,
  p_colleges text[] DEFAULT NULL,
  p_domains text[] DEFAULT NULL,
  p_modes text[] DEFAULT NULL
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

  IF public.class_targets_are_universal(p_universities, p_colleges, p_domains, p_modes, NULL) THEN
    SELECT count(*) INTO v_count FROM public.students;
    RETURN v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.students s
  WHERE public.student_matches_class_targets(
    s.id, p_universities, p_colleges, p_domains, NULL, p_modes
  );
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_count_assignment_targets(text[], text[], text[], text[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
