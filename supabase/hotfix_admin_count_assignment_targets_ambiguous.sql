-- Fix: function admin_count_assignment_targets(text[], text[], text[]) is not unique
-- Cause: both 3-arg and 4-arg overloads exist; 3-arg calls become ambiguous.
-- Safe to re-run.

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS target_modes text[];

DROP FUNCTION IF EXISTS public.admin_count_assignment_targets(text[], text[], text[]);
DROP FUNCTION IF EXISTS public.admin_count_assignment_targets(text[], text[], text[], text[]);

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

REVOKE ALL ON FUNCTION public.admin_count_assignment_targets(text[], text[], text[], text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_count_assignment_targets(text[], text[], text[], text[]) TO authenticated;

-- Patch insert/update RPCs to call the 4-arg function explicitly.
CREATE OR REPLACE FUNCTION public.admin_insert_assignment(p_row jsonb, p_questions jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_q jsonb;
  v_idx integer := 0;
  v_total integer := 0;
  v_passing integer;
  v_duration integer;
  v_type text := COALESCE(NULLIF(trim(p_row->>'assignment_type'), ''), 'mcq');
BEGIN
  PERFORM public.assert_may_admin_list_students();

  v_duration := GREATEST(5, COALESCE((p_row->>'duration_minutes')::integer, 30));
  v_total := GREATEST(1, COALESCE((p_row->>'total_marks')::integer, 1));
  v_passing := COALESCE((p_row->>'passing_marks')::integer, (v_total * 0.5)::integer);

  INSERT INTO public.assignments (
    title, description, duration_minutes, total_marks, passing_marks, is_active,
    due_at, target_universities, target_colleges, target_domains, target_modes,
    created_by, assignment_type
  )
  VALUES (
    trim(p_row->>'title'),
    NULLIF(trim(p_row->>'description'), ''),
    v_duration,
    v_total,
    v_passing,
    COALESCE((p_row->>'is_active')::boolean, true),
    NULLIF(trim(p_row->>'due_at'), '')::timestamptz,
    CASE WHEN p_row ? 'target_universities' AND jsonb_typeof(p_row->'target_universities') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_universities')) ELSE NULL END,
    CASE WHEN p_row ? 'target_colleges' AND jsonb_typeof(p_row->'target_colleges') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_colleges')) ELSE NULL END,
    CASE WHEN p_row ? 'target_domains' AND jsonb_typeof(p_row->'target_domains') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_domains')) ELSE NULL END,
    CASE WHEN p_row ? 'target_modes' AND jsonb_typeof(p_row->'target_modes') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_modes')) ELSE NULL END,
    NULLIF(trim(p_row->>'created_by'), '')::uuid,
    v_type
  )
  RETURNING id INTO v_id;

  IF v_type <> 'file_upload' THEN
    FOR v_q IN SELECT * FROM jsonb_array_elements(COALESCE(p_questions, '[]'::jsonb))
    LOOP
      INSERT INTO public.assignment_questions (
        assignment_id, question_text, question_type, options, correct_option_index,
        marks, order_index, word_limit_min, word_limit_max
      )
      VALUES (
        v_id,
        trim(v_q->>'question_text'),
        COALESCE(NULLIF(trim(v_q->>'question_type'), ''), CASE WHEN v_type = 'long_answer' THEN 'long_answer' ELSE 'mcq' END),
        CASE
          WHEN COALESCE(v_q->>'question_type', v_type) IN ('long_answer') THEN '[]'::jsonb
          ELSE COALESCE(v_q->'options', '[]'::jsonb)
        END,
        CASE
          WHEN COALESCE(v_q->>'question_type', v_type) IN ('long_answer') THEN NULL
          ELSE (v_q->>'correct_option_index')::integer
        END,
        GREATEST(1, COALESCE((v_q->>'marks')::integer, 1)),
        v_idx,
        NULLIF((v_q->>'word_limit_min')::integer, 0),
        NULLIF((v_q->>'word_limit_max')::integer, 0)
      );
      v_idx := v_idx + 1;
    END LOOP;
  END IF;

  UPDATE public.assignments a
  SET recipient_count = public.admin_count_assignment_targets(
        a.target_universities,
        a.target_colleges,
        a.target_domains,
        a.target_modes
      )::integer,
      updated_at = now()
  WHERE a.id = v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_assignment(
  p_assignment_id uuid,
  p_row jsonb,
  p_questions jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q jsonb;
  v_idx integer := 0;
  v_type text := COALESCE(NULLIF(trim(p_row->>'assignment_type'), ''), 'mcq');
BEGIN
  PERFORM public.assert_may_admin_list_students();

  IF NOT EXISTS (SELECT 1 FROM public.assignments WHERE id = p_assignment_id) THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  UPDATE public.assignments
  SET
    title = trim(p_row->>'title'),
    description = NULLIF(trim(p_row->>'description'), ''),
    duration_minutes = GREATEST(5, COALESCE((p_row->>'duration_minutes')::integer, 30)),
    total_marks = GREATEST(1, COALESCE((p_row->>'total_marks')::integer, 1)),
    passing_marks = COALESCE((p_row->>'passing_marks')::integer, passing_marks),
    is_active = COALESCE((p_row->>'is_active')::boolean, is_active),
    due_at = NULLIF(trim(p_row->>'due_at'), '')::timestamptz,
    target_universities = CASE WHEN p_row ? 'target_universities' AND jsonb_typeof(p_row->'target_universities') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_universities')) ELSE target_universities END,
    target_colleges = CASE WHEN p_row ? 'target_colleges' AND jsonb_typeof(p_row->'target_colleges') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_colleges')) ELSE target_colleges END,
    target_domains = CASE WHEN p_row ? 'target_domains' AND jsonb_typeof(p_row->'target_domains') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_domains')) ELSE target_domains END,
    target_modes = CASE WHEN p_row ? 'target_modes' AND jsonb_typeof(p_row->'target_modes') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_modes')) ELSE target_modes END,
    assignment_type = v_type,
    updated_at = now()
  WHERE id = p_assignment_id;

  DELETE FROM public.assignment_questions WHERE assignment_id = p_assignment_id;

  IF v_type <> 'file_upload' THEN
    FOR v_q IN SELECT * FROM jsonb_array_elements(COALESCE(p_questions, '[]'::jsonb))
    LOOP
      INSERT INTO public.assignment_questions (
        assignment_id, question_text, question_type, options, correct_option_index,
        marks, order_index, word_limit_min, word_limit_max
      )
      VALUES (
        p_assignment_id,
        trim(v_q->>'question_text'),
        COALESCE(NULLIF(trim(v_q->>'question_type'), ''), CASE WHEN v_type = 'long_answer' THEN 'long_answer' ELSE 'mcq' END),
        CASE
          WHEN COALESCE(v_q->>'question_type', v_type) IN ('long_answer') THEN '[]'::jsonb
          ELSE COALESCE(v_q->'options', '[]'::jsonb)
        END,
        CASE
          WHEN COALESCE(v_q->>'question_type', v_type) IN ('long_answer') THEN NULL
          ELSE (v_q->>'correct_option_index')::integer
        END,
        GREATEST(1, COALESCE((v_q->>'marks')::integer, 1)),
        v_idx,
        NULLIF((v_q->>'word_limit_min')::integer, 0),
        NULLIF((v_q->>'word_limit_max')::integer, 0)
      );
      v_idx := v_idx + 1;
    END LOOP;
  END IF;

  UPDATE public.assignments a
  SET recipient_count = public.admin_count_assignment_targets(
        a.target_universities,
        a.target_colleges,
        a.target_domains,
        a.target_modes
      )::integer,
      updated_at = now()
  WHERE a.id = p_assignment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_insert_assignment(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_assignment(uuid, jsonb, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
