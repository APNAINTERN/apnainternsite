-- Allow students to resubmit assignments and remove 10 MB upload cap on assignment-uploads bucket.
-- Safe to re-run. Run in Supabase Dashboard → SQL Editor.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('assignment-uploads', 'assignment-uploads', false, NULL)
ON CONFLICT (id) DO UPDATE SET file_size_limit = NULL;

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
    is_passed, warnings_received, cheating_detected, grading_status, admin_feedback
  )
  VALUES (
    p_assignment_id, v_uid, p_answers, v_mcq_score, v_mcq_score, 0,
    v_is_passed, GREATEST(0, COALESCE(p_warnings_received, 0)),
    COALESCE(p_cheating_detected, false), v_grading, NULL
  )
  ON CONFLICT (assignment_id, student_id) DO UPDATE SET
    answers = EXCLUDED.answers,
    score = EXCLUDED.score,
    mcq_score = EXCLUDED.mcq_score,
    manual_score = 0,
    admin_feedback = NULL,
    is_passed = EXCLUDED.is_passed,
    warnings_received = EXCLUDED.warnings_received,
    cheating_detected = EXCLUDED.cheating_detected,
    grading_status = EXCLUDED.grading_status,
    submitted_at = timezone('utc', now());

  RETURN jsonb_build_object(
    'score', v_mcq_score,
    'is_passed', v_is_passed,
    'total_marks', v_assgn.total_marks,
    'grading_status', v_grading,
    'pending_review', v_has_review
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_assignment_graded(uuid, jsonb, integer, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
