-- Directory visibility for Student Data Upload + staff attendance mark RPC.
-- Paid SDU rows stay in Directory; unpaid (payment_required) stay hidden until paid.
-- Also: set created_at on SDU import; staff-safe attendance insert RPC.

-- ─── Helper: unpaid SDU / payment-required rows ──────────────────────────────
CREATE OR REPLACE FUNCTION public.student_is_pending_directory_payment(s public.students)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    lower(trim(COALESCE(public.safe_text_to_jsonb(s.metadata)->>'payment_required', 'false')))
      IN ('true', 't', '1'),
    false
  )
  OR COALESCE(
    lower(trim(COALESCE(public.safe_text_to_jsonb(s.metadata)->>'bulk_upload_paid', 'true')))
      IN ('false', 'f', '0'),
    false
  );
$$;

-- ─── Directory list / count: exclude unpaid pending payment ──────────────────
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
    WHERE NOT public.student_is_pending_directory_payment(s)
    AND (
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
    AND (p_start IS NULL OR public.student_created_at_ts(s) >= p_start)
    AND (p_end IS NULL OR public.student_created_at_ts(s) <= p_end)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_students_directory(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL,
  p_domain text DEFAULT NULL,
  p_university text DEFAULT NULL,
  p_college text DEFAULT NULL,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL
)
RETURNS SETOF public.students
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(trim(p_search), '');
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 50), 500));
  v_offset integer := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
  PERFORM public.assert_may_admin_list_students();

  RETURN QUERY
  SELECT s.*
  FROM public.students s
  WHERE NOT public.student_is_pending_directory_payment(s)
  AND (
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
  AND (p_start IS NULL OR public.student_created_at_ts(s) >= p_start)
  AND (p_end IS NULL OR public.student_created_at_ts(s) <= p_end)
  ORDER BY public.student_created_at_ts(s) DESC NULLS LAST, s.id DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_count_students_directory(text, text, text, text, timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_students_directory(integer, integer, text, text, text, text, timestamptz, timestamptz) TO authenticated;

-- ─── Light list: exclude unpaid + include cert fields ────────────────────────
DROP FUNCTION IF EXISTS public.admin_list_students_light(integer, integer);
DROP FUNCTION IF EXISTS public.admin_list_students_light();

CREATE OR REPLACE FUNCTION public.admin_list_students_light(
  p_limit integer DEFAULT 1000,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id text,
  full_name text,
  email text,
  college_name text,
  university_name text,
  created_at timestamptz,
  status text,
  internship_domain text,
  registration_id text,
  roll_number text,
  degree text,
  department text,
  course text,
  gender text,
  contact_number text,
  class_semester text,
  academic_session text,
  metadata text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 1000), 2000));
  v_offset integer := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
  PERFORM public.assert_may_admin_list_students();

  RETURN QUERY
  SELECT
    s.id::text,
    s.full_name,
    s.email,
    s.college_name,
    s.university_name,
    public.student_created_at_ts(s),
    s.status,
    s.internship_domain,
    s.registration_id,
    s.roll_number,
    s.degree,
    s.department,
    s.course,
    s.gender,
    s.contact_number,
    s.class_semester,
    s.academic_session,
    s.metadata::text
  FROM public.students s
  WHERE NOT public.student_is_pending_directory_payment(s)
  ORDER BY public.student_created_at_ts(s) DESC NULLS LAST, s.id DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_students_light()
RETURNS TABLE (
  id text,
  full_name text,
  email text,
  college_name text,
  university_name text,
  created_at timestamptz,
  status text,
  internship_domain text,
  registration_id text,
  roll_number text,
  degree text,
  department text,
  course text,
  gender text,
  contact_number text,
  class_semester text,
  academic_session text,
  metadata text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.admin_list_students_light(1000, 0);
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_students_light(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_students_light() TO authenticated;

-- ─── Staff/admin mark one attendance day (no marked_by column) ───────────────
CREATE OR REPLACE FUNCTION public.admin_mark_student_attendance_day(
  p_student_id text,
  p_marked_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id text := NULLIF(trim(p_student_id), '');
  v_at timestamptz := COALESCE(p_marked_at, now());
  v_row_id uuid;
BEGIN
  PERFORM public.assert_may_admin_list_students();

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'student_id is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id = v_id) THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  INSERT INTO public.attendance (id, student_id, marked_at, created_at)
  VALUES (gen_random_uuid(), v_id, v_at, now())
  RETURNING id INTO v_row_id;

  RETURN jsonb_build_object('ok', true, 'id', v_row_id, 'student_id', v_id, 'marked_at', v_at);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_mark_student_attendance_day(text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_mark_student_attendance_day(text, timestamptz) TO authenticated;

-- Staff RLS for student attendance (idempotent)
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff manage student attendance" ON public.attendance;
CREATE POLICY "Staff manage student attendance"
  ON public.attendance
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'staff'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'staff'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;

-- ─── Backfill blank created_at for SDU paid rows so they sort into Directory ─
UPDATE public.students s
SET created_at = COALESCE(NULLIF(trim(s.created_at::text), ''), now()::text)
WHERE (
  public.safe_text_to_jsonb(s.metadata)->>'source' = 'admin_student_data_upload'
  OR public.safe_text_to_jsonb(s.metadata)->>'source' = 'admin_bulk_upload'
)
AND (
  s.created_at IS NULL
  OR NULLIF(trim(s.created_at::text), '') IS NULL
);

-- Ensure new student rows always get a created_at (text column has no default on RDS)
CREATE OR REPLACE FUNCTION public.students_set_created_at_default()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.created_at IS NULL OR NULLIF(trim(NEW.created_at::text), '') IS NULL THEN
    NEW.created_at := now()::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_students_set_created_at_default ON public.students;
CREATE TRIGGER trg_students_set_created_at_default
  BEFORE INSERT ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.students_set_created_at_default();

-- When payment is recovered, clear unpaid SDU flags so the student appears in Directory
CREATE OR REPLACE FUNCTION public.clear_student_pending_payment_flags(p_user_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta jsonb;
BEGIN
  IF NULLIF(trim(p_user_id), '') IS NULL THEN
    RETURN;
  END IF;
  SELECT public.safe_text_to_jsonb(s.metadata) INTO v_meta
  FROM public.students s
  WHERE s.id = p_user_id
  LIMIT 1;
  IF v_meta IS NULL THEN
    RETURN;
  END IF;
  v_meta := v_meta || jsonb_build_object(
    'payment_required', false,
    'bulk_upload_paid', true
  );
  UPDATE public.students
  SET metadata = v_meta::text
  WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.student_recover_paid_enrollment(
  p_payment_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_pay_id text := NULLIF(trim(p_payment_id), '');
  v_amount bigint;
  v_order_email text;
  v_ok boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT lower(trim(u.email)) INTO v_email
  FROM auth.users u
  WHERE u.id = v_uid;

  IF v_email IS NULL OR v_email = '' THEN
    RETURN FALSE;
  END IF;

  IF public.student_has_paid_enrollment(v_uid) THEN
    PERFORM public.clear_student_pending_payment_flags(v_uid::text);
    RETURN TRUE;
  END IF;

  UPDATE public.payment_success ps
  SET
    user_id = v_uid,
    amount_paise = CASE
      WHEN coalesce(ps.amount_paise, 0) < 100 THEN 100
      ELSE ps.amount_paise
    END
  WHERE lower(trim(ps.email)) = v_email
    AND ps.payment_id ~* '^pay_[a-z0-9]'
    AND (ps.user_id IS NULL OR ps.user_id <> v_uid);

  IF public.student_has_paid_enrollment(v_uid) THEN
    PERFORM public.clear_student_pending_payment_flags(v_uid::text);
    RETURN TRUE;
  END IF;

  IF v_pay_id IS NOT NULL THEN
    SELECT po.amount, lower(trim(coalesce(po.user_email, po.metadata->>'email', '')))
    INTO v_amount, v_order_email
    FROM public.payment_orders po
    WHERE po.status = 'success'
      AND (po.payment_id = v_pay_id OR po.order_id = v_pay_id)
    ORDER BY po.created_at DESC
    LIMIT 1;
  ELSE
    SELECT po.payment_id, po.amount, lower(trim(coalesce(po.user_email, po.metadata->>'email', '')))
    INTO v_pay_id, v_amount, v_order_email
    FROM public.payment_orders po
    WHERE po.status = 'success'
      AND (
        lower(trim(coalesce(po.user_email, ''))) = v_email
        OR lower(trim(coalesce(po.metadata->>'email', ''))) = v_email
      )
    ORDER BY po.created_at DESC
    LIMIT 1;
  END IF;

  IF v_pay_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_order_email IS NOT NULL AND v_order_email <> '' AND v_order_email <> v_email THEN
    RETURN FALSE;
  END IF;

  PERFORM public.ensure_payment_success_log(
    jsonb_build_object(
      'user_id', v_uid::text,
      'payment_id', v_pay_id,
      'amount_paise', GREATEST(coalesce(v_amount, 0), 100),
      'email', v_email,
      'full_name', 'Student',
      'status', 'success'
    )
  );

  v_ok := public.student_has_paid_enrollment(v_uid);
  IF v_ok THEN
    PERFORM public.clear_student_pending_payment_flags(v_uid::text);
  END IF;
  RETURN v_ok;
END;
$$;

REVOKE ALL ON FUNCTION public.student_recover_paid_enrollment(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_recover_paid_enrollment(text) TO authenticated;
