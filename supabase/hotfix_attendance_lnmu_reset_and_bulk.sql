-- Attendance reset + filtered bulk mark + admin RPCs.
-- Run once in Supabase SQL Editor (deploy); admins use the Attendance tab after that.

-- ─── Helper: LNMU university name match (legacy) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.is_lnmu_university_name(p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    lower(trim(p_name)) ~ 'lnmu|lalit\s*narayan|mithila',
    false
  );
$$;

-- ─── Step 1: Reset attendance (all universities, or optional uni / college filter) ─
DROP FUNCTION IF EXISTS public.admin_reset_all_attendance();

CREATE OR REPLACE FUNCTION public.admin_reset_all_attendance(
  p_university_name text DEFAULT NULL,
  p_college_name text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted bigint;
  v_uni text := NULLIF(trim(p_university_name), '');
  v_college text := NULLIF(trim(p_college_name), '');
BEGIN
  PERFORM public.assert_may_admin_list_students();

  IF v_uni IS NULL AND v_college IS NULL THEN
    DELETE FROM public.attendance;
  ELSE
    DELETE FROM public.attendance a
    USING public.students s
    WHERE a.student_id = s.id
      AND (v_uni IS NULL OR trim(s.university_name) ILIKE v_uni)
      AND (v_college IS NULL OR trim(s.college_name) ILIKE v_college);
  END IF;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- ─── Step 2: Bulk mark present for date range (optional uni / college filter) ─
CREATE OR REPLACE FUNCTION public.admin_bulk_mark_attendance(
  p_start_date date,
  p_end_date date,
  p_university_name text DEFAULT NULL,
  p_college_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_students bigint := 0;
  v_inserted bigint := 0;
  v_uni text := NULLIF(trim(p_university_name), '');
  v_college text := NULLIF(trim(p_college_name), '');
BEGIN
  PERFORM public.assert_may_admin_list_students();

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'End date must be on or after start date';
  END IF;

  SELECT COUNT(*) INTO v_students
  FROM public.students s
  WHERE (v_uni IS NULL OR trim(s.university_name) ILIKE v_uni)
    AND (v_college IS NULL OR trim(s.college_name) ILIKE v_college);

  INSERT INTO public.attendance (student_id, marked_at)
  SELECT
    s.id,
    ((d.day::timestamp + time '12:00:00') AT TIME ZONE 'Asia/Kolkata')
  FROM public.students s
  CROSS JOIN generate_series(p_start_date, p_end_date, interval '1 day') AS d(day)
  WHERE (v_uni IS NULL OR trim(s.university_name) ILIKE v_uni)
    AND (v_college IS NULL OR trim(s.college_name) ILIKE v_college)
    AND NOT EXISTS (
      SELECT 1
      FROM public.attendance a
      WHERE a.student_id = s.id
        AND (a.marked_at AT TIME ZONE 'Asia/Kolkata')::date = d.day::date
    );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'students_matched', v_students,
    'records_inserted', v_inserted,
    'start_date', p_start_date,
    'end_date', p_end_date,
    'university_name', v_uni,
    'college_name', v_college
  );
END;
$$;

-- Backward-compatible LNMU wrapper
CREATE OR REPLACE FUNCTION public.admin_bulk_mark_lnmu_attendance(
  p_start_date date DEFAULT DATE '2026-06-01',
  p_end_date date DEFAULT DATE '2026-06-15'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.assert_may_admin_list_students();

  SELECT public.admin_bulk_mark_attendance(
    p_start_date,
    p_end_date,
    u.name,
    NULL
  ) INTO v_result
  FROM public.universities u
  WHERE public.is_lnmu_university_name(u.name)
  LIMIT 1;

  IF v_result IS NULL THEN
    RETURN public.admin_bulk_mark_attendance(p_start_date, p_end_date, NULL, NULL);
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_all_attendance(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_bulk_mark_attendance(date, date, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_bulk_mark_lnmu_attendance(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_all_attendance(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bulk_mark_attendance(date, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bulk_mark_lnmu_attendance(date, date) TO authenticated;

-- ─── Fast aggregated counts for admin attendance tab ───────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_attendance_counts()
RETURNS TABLE(student_id uuid, day_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_may_admin_list_students();

  RETURN QUERY
  SELECT a.student_id, COUNT(*)::bigint
  FROM public.attendance a
  GROUP BY a.student_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_attendance_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_attendance_counts() TO authenticated;
