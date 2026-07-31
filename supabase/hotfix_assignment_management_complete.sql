-- Run once in Supabase SQL Editor to fix assignment portal errors and enable
-- MCQ, long-answer, and file-upload assignments with admin edit/delete.
-- Safe to re-run (uses IF NOT EXISTS / CREATE OR REPLACE).

-- ─── Base tables (if project never ran create_assignments.sql) ───────────────
CREATE TABLE IF NOT EXISTS public.assignments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  duration_minutes integer NOT NULL DEFAULT 30,
  total_marks integer NOT NULL,
  passing_marks integer NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assignment_questions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_option_index integer,
  marks integer NOT NULL DEFAULT 1,
  order_index integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assignment_submissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  answers jsonb,
  score integer NOT NULL DEFAULT 0,
  is_passed boolean NOT NULL DEFAULT false,
  warnings_received integer DEFAULT 0,
  cheating_detected boolean DEFAULT false,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id)
);

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;

-- ─── Extended columns ───────────────────────────────────────────────────────
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS target_universities text[],
  ADD COLUMN IF NOT EXISTS target_colleges text[],
  ADD COLUMN IF NOT EXISTS target_domains text[],
  ADD COLUMN IF NOT EXISTS recipient_count integer,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS assignment_type text NOT NULL DEFAULT 'mcq';

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS target_modes text[];

ALTER TABLE public.assignments DROP CONSTRAINT IF EXISTS assignments_type_check;
ALTER TABLE public.assignments ADD CONSTRAINT assignments_type_check
  CHECK (assignment_type IN ('mcq', 'long_answer', 'file_upload'));

ALTER TABLE public.assignment_questions
  ADD COLUMN IF NOT EXISTS question_type text NOT NULL DEFAULT 'mcq',
  ADD COLUMN IF NOT EXISTS word_limit_min integer,
  ADD COLUMN IF NOT EXISTS word_limit_max integer;

ALTER TABLE public.assignment_questions
  ALTER COLUMN options DROP NOT NULL,
  ALTER COLUMN correct_option_index DROP NOT NULL;

ALTER TABLE public.assignment_questions DROP CONSTRAINT IF EXISTS assignment_questions_type_check;
ALTER TABLE public.assignment_questions ADD CONSTRAINT assignment_questions_type_check
  CHECK (question_type IN ('mcq', 'long_answer'));

ALTER TABLE public.assignment_submissions
  ADD COLUMN IF NOT EXISTS grading_status text NOT NULL DEFAULT 'graded',
  ADD COLUMN IF NOT EXISTS admin_feedback text,
  ADD COLUMN IF NOT EXISTS mcq_score integer,
  ADD COLUMN IF NOT EXISTS manual_score integer;

UPDATE public.assignment_submissions SET grading_status = 'graded' WHERE grading_status IS NULL;
UPDATE public.assignment_submissions SET mcq_score = score WHERE mcq_score IS NULL;

ALTER TABLE public.assignment_submissions DROP CONSTRAINT IF EXISTS assignment_submissions_grading_status_check;
ALTER TABLE public.assignment_submissions ADD CONSTRAINT assignment_submissions_grading_status_check
  CHECK (grading_status IN ('graded', 'pending_review', 'failed'));

-- has_role required by RLS on several tables
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_submissions TO authenticated;

-- ─── Storage bucket for file-upload assignments ─────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('assignment-uploads', 'assignment-uploads', false, 10485760)
ON CONFLICT (id) DO UPDATE SET file_size_limit = 10485760;

DROP POLICY IF EXISTS "Students upload assignment files" ON storage.objects;
CREATE POLICY "Students upload assignment files" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'assignment-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Students read own assignment files" ON storage.objects;
CREATE POLICY "Students read own assignment files" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'assignment-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Admins read assignment uploads" ON storage.objects;
CREATE POLICY "Admins read assignment uploads" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'assignment-uploads'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'staff'::public.app_role)
  )
);

-- ─── Drop RPCs whose return shape changed (CREATE OR REPLACE cannot alter OUT params) ─
DROP FUNCTION IF EXISTS public.list_assignments_for_student();
DROP FUNCTION IF EXISTS public.admin_count_assignment_targets(text[], text[], text[]);
DROP FUNCTION IF EXISTS public.admin_count_assignment_targets(text[], text[], text[], text[]);

-- ─── RPCs (full definitions) ────────────────────────────────────────────────
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

CREATE OR REPLACE FUNCTION public.admin_delete_assignment(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_may_admin_list_students();
  DELETE FROM public.assignments WHERE id = p_assignment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_assignments_for_student()
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  duration_minutes integer,
  total_marks integer,
  passing_marks integer,
  due_at timestamptz,
  created_at timestamptz,
  assignment_type text,
  has_submission boolean,
  submission_score integer,
  submission_passed boolean,
  grading_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.title,
    a.description,
    a.duration_minutes,
    a.total_marks,
    a.passing_marks,
    a.due_at,
    a.created_at,
    COALESCE(a.assignment_type, 'mcq')::text,
    (s.id IS NOT NULL) AS has_submission,
    s.score AS submission_score,
    s.is_passed AS submission_passed,
    COALESCE(s.grading_status, 'graded')::text AS grading_status
  FROM public.assignments a
  LEFT JOIN public.assignment_submissions s
    ON s.assignment_id = a.id AND s.student_id = auth.uid()
  WHERE a.is_active = true
    AND (
      public.class_targets_are_universal(
        a.target_universities, a.target_colleges, a.target_domains, a.target_modes, NULL
      )
      OR public.student_matches_class_targets(
        auth.uid(), a.target_universities, a.target_colleges, a.target_domains, NULL, a.target_modes
      )
      OR (
        a.target_universities IS NULL AND a.target_colleges IS NULL
        AND a.target_domains IS NULL AND a.target_modes IS NULL
      )
    )
  ORDER BY a.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_assignment_take_payload(p_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assgn public.assignments%ROWTYPE;
  v_questions jsonb;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;

  SELECT * INTO v_assgn FROM public.assignments
  WHERE id = p_assignment_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assignment not found or inactive'; END IF;

  IF NOT (
    public.class_targets_are_universal(
      v_assgn.target_universities, v_assgn.target_colleges, v_assgn.target_domains, v_assgn.target_modes, NULL
    )
    OR public.student_matches_class_targets(
      v_uid, v_assgn.target_universities, v_assgn.target_colleges, v_assgn.target_domains, NULL, v_assgn.target_modes
    )
    OR (
      v_assgn.target_universities IS NULL AND v_assgn.target_colleges IS NULL
      AND v_assgn.target_domains IS NULL AND v_assgn.target_modes IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'This assignment is not assigned to you';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'assignment_id', q.assignment_id,
        'question_text', q.question_text,
        'question_type', q.question_type,
        'options', CASE WHEN q.question_type = 'mcq' THEN q.options ELSE '[]'::jsonb END,
        'marks', q.marks,
        'order_index', q.order_index
      )
      ORDER BY q.order_index
    ),
    '[]'::jsonb
  )
  INTO v_questions
  FROM public.assignment_questions q
  WHERE q.assignment_id = p_assignment_id;

  RETURN jsonb_build_object(
    'assignment', jsonb_build_object(
      'id', v_assgn.id,
      'title', v_assgn.title,
      'description', v_assgn.description,
      'duration_minutes', v_assgn.duration_minutes,
      'total_marks', v_assgn.total_marks,
      'passing_marks', v_assgn.passing_marks,
      'is_active', v_assgn.is_active,
      'due_at', v_assgn.due_at,
      'assignment_type', COALESCE(v_assgn.assignment_type, 'mcq')
    ),
    'questions', v_questions
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_assignment_graded(
  p_assignment_id uuid,
  p_answers jsonb,
  p_warnings_received integer DEFAULT 0,
  p_cheating_detected boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_assgn public.assignments%ROWTYPE;
  v_mcq_score integer := 0;
  v_passing integer;
  v_is_passed boolean;
  v_q record;
  v_selected integer;
  v_text text;
  v_has_review boolean := false;
  v_grading text := 'graded';
  v_type text;
  v_file jsonb;
  v_links jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.assignment_submissions s
    WHERE s.assignment_id = p_assignment_id AND s.student_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Assignment already submitted';
  END IF;

  SELECT * INTO v_assgn FROM public.assignments WHERE id = p_assignment_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assignment not found or inactive'; END IF;

  v_type := COALESCE(v_assgn.assignment_type, 'mcq');
  v_passing := COALESCE(v_assgn.passing_marks, 0);

  IF v_type = 'file_upload' THEN
    v_file := p_answers->'__file_upload__';
    v_links := v_file->'links';
    IF v_file IS NULL OR (
      (v_links IS NULL OR jsonb_array_length(v_links) = 0)
      AND NULLIF(trim(v_file->>'path'), '') IS NULL
      AND (v_file->'files' IS NULL OR jsonb_array_length(v_file->'files') = 0)
    ) THEN
      RAISE EXCEPTION 'Please submit at least one link or file attachment before submitting';
    END IF;
    v_has_review := true;
    v_grading := 'pending_review';
    v_is_passed := false;
  ELSE
    FOR v_q IN
      SELECT id, question_type, correct_option_index, marks
      FROM public.assignment_questions
      WHERE assignment_id = p_assignment_id
    LOOP
      IF v_q.question_type = 'long_answer' THEN
        v_has_review := true;
        v_text := NULLIF(trim(p_answers->>v_q.id::text), '');
        IF v_text IS NULL OR length(v_text) < 1 THEN
          RAISE EXCEPTION 'Please answer all questions before submitting';
        END IF;
      ELSE
        BEGIN
          v_selected := (p_answers->>v_q.id::text)::integer;
        EXCEPTION WHEN OTHERS THEN
          v_selected := NULL;
        END;
        IF v_selected IS NULL THEN
          RAISE EXCEPTION 'Please answer all MCQ questions';
        END IF;
        IF v_selected = v_q.correct_option_index THEN
          v_mcq_score := v_mcq_score + COALESCE(v_q.marks, 0);
        END IF;
      END IF;
    END LOOP;

    IF v_has_review THEN
      v_grading := 'pending_review';
      v_is_passed := false;
    ELSE
      v_is_passed := v_mcq_score >= v_passing;
    END IF;
  END IF;

  INSERT INTO public.assignment_submissions (
    assignment_id, student_id, answers, score, mcq_score, manual_score,
    is_passed, warnings_received, cheating_detected, grading_status
  )
  VALUES (
    p_assignment_id, v_uid, p_answers, v_mcq_score, v_mcq_score, 0,
    v_is_passed, GREATEST(0, COALESCE(p_warnings_received, 0)),
    COALESCE(p_cheating_detected, false), v_grading
  );

  RETURN jsonb_build_object(
    'score', v_mcq_score,
    'is_passed', v_is_passed,
    'total_marks', v_assgn.total_marks,
    'grading_status', v_grading,
    'pending_review', v_has_review
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_grade_assignment_submission(
  p_submission_id uuid,
  p_manual_score integer,
  p_feedback text,
  p_is_passed boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.assignment_submissions%ROWTYPE;
  v_assgn public.assignments%ROWTYPE;
  v_total integer;
  v_passed boolean;
BEGIN
  PERFORM public.assert_may_admin_list_students();

  SELECT * INTO v_sub FROM public.assignment_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found'; END IF;

  SELECT * INTO v_assgn FROM public.assignments WHERE id = v_sub.assignment_id;
  v_total := COALESCE(v_sub.mcq_score, 0) + GREATEST(0, COALESCE(p_manual_score, 0));
  v_passed := COALESCE(p_is_passed, v_total >= COALESCE(v_assgn.passing_marks, 0));

  UPDATE public.assignment_submissions
  SET
    manual_score = GREATEST(0, COALESCE(p_manual_score, 0)),
    score = v_total,
    is_passed = v_passed,
    admin_feedback = NULLIF(trim(p_feedback), ''),
    grading_status = 'graded'
  WHERE id = p_submission_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_assignment_submissions(p_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_may_admin_list_students();

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'student_id', s.student_id,
          'score', s.score,
          'mcq_score', s.mcq_score,
          'manual_score', s.manual_score,
          'is_passed', s.is_passed,
          'grading_status', s.grading_status,
          'admin_feedback', s.admin_feedback,
          'answers', s.answers,
          'submitted_at', s.submitted_at,
          'student_name', st.full_name,
          'student_email', st.email,
          'registration_id', st.registration_id
        )
        ORDER BY s.submitted_at DESC
      )
      FROM public.assignment_submissions s
      LEFT JOIN public.students st ON st.id = s.student_id
      WHERE s.assignment_id = p_assignment_id
    ),
    '[]'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_assignment_questions(p_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_may_admin_list_students();

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'question_text', q.question_text,
          'question_type', COALESCE(q.question_type, 'mcq'),
          'options', q.options,
          'correct_option_index', q.correct_option_index,
          'marks', q.marks,
          'order_index', q.order_index
        )
        ORDER BY q.order_index
      )
      FROM public.assignment_questions q
      WHERE q.assignment_id = p_assignment_id
    ),
    '[]'::jsonb
  );
END;
$$;

-- ─── Grants (including previously missing student RPCs) ─────────────────────
REVOKE ALL ON FUNCTION public.admin_count_assignment_targets(text[], text[], text[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_insert_assignment(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_assignment(uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_assignment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_assignments_for_student() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_assignment_take_payload(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_assignment_graded(uuid, jsonb, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_grade_assignment_submission(uuid, integer, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_assignment_submissions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_assignment_questions(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_count_assignment_targets(text[], text[], text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_insert_assignment(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_assignment(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_assignment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_assignments_for_student() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_assignment_take_payload(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_assignment_graded(uuid, jsonb, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grade_assignment_submission(uuid, integer, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_assignment_submissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_assignment_questions(uuid) TO authenticated;
