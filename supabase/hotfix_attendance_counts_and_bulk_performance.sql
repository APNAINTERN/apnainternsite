-- Attendance performance + 500 fix.
-- Symptoms fixed:
--   * admin_get_attendance_counts 500 (statement timeout on large table)
--   * admin_bulk_mark_attendance "failed to mark" (slow correlated NOT EXISTS
--     times out even though rows were inserted)
-- Strategy: index attendance, dedupe existing rows once, replace correlated
-- anti-join with a single-scan LEFT JOIN, count DISTINCT programme-window days.
-- Safe to re-run in Supabase SQL Editor.

-- Index that powers per-student lookups and the dedupe/anti-join below.
CREATE INDEX IF NOT EXISTS idx_attendance_student_marked
  ON public.attendance (student_id, marked_at);

-- One-time cleanup: keep a single attendance row per (student, IST day).
DELETE FROM public.attendance a
USING public.attendance b
WHERE a.student_id = b.student_id
  AND (a.marked_at AT TIME ZONE 'Asia/Kolkata')::date
    = (b.marked_at AT TIME ZONE 'Asia/Kolkata')::date
  AND a.ctid > b.ctid;

-- ─── Counts = distinct programme-window days per student (fast) ──────────────
CREATE OR REPLACE FUNCTION public.admin_get_attendance_counts()
RETURNS TABLE(student_id uuid, day_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $$
BEGIN
  PERFORM public.assert_may_admin_list_students();

  RETURN QUERY
  WITH distinct_days AS (
    SELECT DISTINCT
      a.student_id AS sid,
      (a.marked_at AT TIME ZONE 'Asia/Kolkata')::date AS ist_date
    FROM public.attendance a
    WHERE a.marked_at IS NOT NULL
  )
  SELECT d.sid, COUNT(*)::bigint
  FROM distinct_days d
  JOIN public.students s ON s.id = d.sid
  WHERE
    CASE
      WHEN lower(trim(coalesce(s.university_name, ''))) ~ 'bnmu|bhupendra\s*narayan\s*mandal'
        THEN d.ist_date BETWEEN DATE '2026-05-23' AND DATE '2026-06-21'
      WHEN lower(trim(coalesce(s.university_name, ''))) ~ 'lnmu|lalit\s*narayan|mithila'
        THEN d.ist_date BETWEEN DATE '2026-06-01' AND DATE '2026-06-20'
      ELSE TRUE
    END
  GROUP BY d.sid;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_attendance_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_attendance_counts() TO authenticated;

-- ─── Bulk mark present (single-scan anti-join, no per-row subquery) ──────────
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
SET statement_timeout = '60s'
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

  WITH existing AS (
    SELECT DISTINCT
      a.student_id,
      (a.marked_at AT TIME ZONE 'Asia/Kolkata')::date AS ist_date
    FROM public.attendance a
    WHERE a.marked_at IS NOT NULL
  ),
  to_insert AS (
    INSERT INTO public.attendance (student_id, marked_at)
    SELECT
      s.id,
      ((gs.day::timestamp + time '12:00:00') AT TIME ZONE 'Asia/Kolkata')
    FROM public.students s
    CROSS JOIN generate_series(p_start_date, p_end_date, interval '1 day') AS gs(day)
    LEFT JOIN existing ex
      ON ex.student_id = s.id
     AND ex.ist_date = gs.day::date
    WHERE (v_uni IS NULL OR trim(s.university_name) ILIKE v_uni)
      AND (v_college IS NULL OR trim(s.college_name) ILIKE v_college)
      AND ex.student_id IS NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM to_insert;

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

REVOKE ALL ON FUNCTION public.admin_bulk_mark_attendance(date, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_bulk_mark_attendance(date, date, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
