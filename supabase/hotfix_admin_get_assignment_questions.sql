-- Run if admin submission review shows empty "Student answers". Then reload API schema.

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

REVOKE ALL ON FUNCTION public.admin_get_assignment_questions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_assignment_questions(uuid) TO authenticated;
