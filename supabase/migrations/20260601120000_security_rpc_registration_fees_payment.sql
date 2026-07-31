-- Security RPCs: run in Supabase SQL Editor BEFORE hotfix_security_lockdown_after_frontend.sql
-- Frontend uses these instead of reading secrets / grading client-side.

-- ─── Payment config (public vs admin) ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_public_payment_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'razorpay_key_id', razorpay_key_id,
    'amount_paise', amount_paise,
    'is_active', COALESCE(is_active, true),
    'currency', COALESCE(currency, 'INR')
  )
  FROM public.payment_config
  WHERE id = 1
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.assert_payment_config_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_payment_config()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.payment_config%ROWTYPE;
BEGIN
  PERFORM public.assert_payment_config_admin();
  SELECT * INTO v_row FROM public.payment_config WHERE id = 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'id', v_row.id,
    'razorpay_key_id', v_row.razorpay_key_id,
    'razorpay_key_secret', v_row.razorpay_key_secret,
    'razorpay_webhook_secret', v_row.razorpay_webhook_secret,
    'amount_paise', v_row.amount_paise,
    'is_active', v_row.is_active,
    'currency', COALESCE(v_row.currency, 'INR'),
    'updated_at', v_row.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_save_payment_config(p_config jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_payment_config_admin();
  INSERT INTO public.payment_config (
    id,
    razorpay_key_id,
    razorpay_key_secret,
    razorpay_webhook_secret,
    amount_paise,
    is_active,
    currency,
    updated_at
  )
  VALUES (
    1,
    NULLIF(trim(p_config->>'razorpay_key_id'), ''),
    NULLIF(trim(p_config->>'razorpay_key_secret'), ''),
    NULLIF(trim(p_config->>'razorpay_webhook_secret'), ''),
    COALESCE((p_config->>'amount_paise')::bigint, 9900),
    COALESCE((p_config->>'is_active')::boolean, true),
    COALESCE(NULLIF(trim(p_config->>'currency'), ''), 'INR'),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    razorpay_key_id = EXCLUDED.razorpay_key_id,
    razorpay_key_secret = EXCLUDED.razorpay_key_secret,
    razorpay_webhook_secret = EXCLUDED.razorpay_webhook_secret,
    amount_paise = EXCLUDED.amount_paise,
    is_active = EXCLUDED.is_active,
    currency = EXCLUDED.currency,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_payment_config() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_save_payment_config(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_payment_config() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_payment_config(jsonb) TO authenticated;

-- ─── Registration fee catalog (anon + authenticated) ─────────────────────────

CREATE OR REPLACE FUNCTION public.get_registration_universities()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', u.id,
        'name', u.name,
        'pisa_fee', u.pisa_fee
      )
      ORDER BY u.name
    ),
    '[]'::jsonb
  )
  FROM public.universities u;
$$;

CREATE OR REPLACE FUNCTION public.get_registration_colleges(p_university_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'university_id', c.university_id,
        'pisa_fee', c.pisa_fee,
        'fee_base_paise', c.fee_base_paise,
        'fee_processing_paise', c.fee_processing_paise,
        'show_fee_breakdown', c.show_fee_breakdown,
        'fees_managed', c.fees_managed
      )
      ORDER BY c.name
    ),
    '[]'::jsonb
  )
  FROM public.colleges c
  WHERE c.university_id = p_university_id;
$$;

CREATE OR REPLACE FUNCTION public.list_public_universities()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name) ORDER BY u.name),
    '[]'::jsonb
  )
  FROM public.universities u;
$$;

CREATE OR REPLACE FUNCTION public.list_public_colleges(p_university_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'university_id', c.university_id
      )
      ORDER BY c.name
    ),
    '[]'::jsonb
  )
  FROM public.colleges c
  WHERE p_university_id IS NULL OR c.university_id = p_university_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_payment_config() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_registration_universities() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_registration_colleges(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_universities() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_colleges(uuid) TO anon, authenticated;

-- ─── Assignments: server grading, hide answer keys ─────────────────────────

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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;

  SELECT * INTO v_assgn
  FROM public.assignments
  WHERE id = p_assignment_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment not found or inactive';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'assignment_id', q.assignment_id,
        'question_text', q.question_text,
        'options', q.options,
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
      'is_active', v_assgn.is_active
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
  v_score integer := 0;
  v_passing integer;
  v_is_passed boolean;
  v_q record;
  v_selected integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.assignment_submissions s
    WHERE s.assignment_id = p_assignment_id AND s.student_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Assignment already submitted';
  END IF;

  SELECT * INTO v_assgn
  FROM public.assignments
  WHERE id = p_assignment_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment not found or inactive';
  END IF;

  v_passing := COALESCE(v_assgn.passing_marks, 0);

  FOR v_q IN
    SELECT id, correct_option_index, marks
    FROM public.assignment_questions
    WHERE assignment_id = p_assignment_id
  LOOP
    BEGIN
      v_selected := (p_answers->>v_q.id::text)::integer;
    EXCEPTION WHEN OTHERS THEN
      v_selected := NULL;
    END;
    IF v_selected IS NOT NULL AND v_selected = v_q.correct_option_index THEN
      v_score := v_score + COALESCE(v_q.marks, 0);
    END IF;
  END LOOP;

  v_is_passed := v_score >= v_passing;

  INSERT INTO public.assignment_submissions (
    assignment_id,
    student_id,
    answers,
    score,
    is_passed,
    warnings_received,
    cheating_detected
  )
  VALUES (
    p_assignment_id,
    v_uid,
    p_answers,
    v_score,
    v_is_passed,
    GREATEST(0, COALESCE(p_warnings_received, 0)),
    COALESCE(p_cheating_detected, false)
  );

  RETURN jsonb_build_object(
    'score', v_score,
    'is_passed', v_is_passed,
    'total_marks', v_assgn.total_marks
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_assignment_take_payload(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_assignment_graded(uuid, jsonb, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_assignment_take_payload(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_assignment_graded(uuid, jsonb, integer, boolean) TO authenticated;
