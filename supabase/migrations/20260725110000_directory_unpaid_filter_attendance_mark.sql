-- Mirror of aws/scripts/36-rds-directory-unpaid-filter-attendance-mark.sql
-- Directory: hide unpaid SDU until payment; staff attendance mark RPC; created_at default.

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
