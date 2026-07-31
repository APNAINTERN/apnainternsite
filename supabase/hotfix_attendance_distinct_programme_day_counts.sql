-- Make admin attendance counts consistent: count DISTINCT programme-window days
-- per student (not raw rows), and remove duplicate same-day attendance rows.
-- Fixes: count jumping (e.g. 34 -> 22) and "+1" showing many presents on one day.
-- Safe to re-run in Supabase SQL Editor.

-- University helpers (re-create defensively).
CREATE OR REPLACE FUNCTION public.is_lnmu_university_name(p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(lower(trim(p_name)) ~ 'lnmu|lalit\s*narayan|mithila', false);
$$;

CREATE OR REPLACE FUNCTION public.is_bnmu_university_name(p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(lower(trim(p_name)) ~ 'bnmu|bhupendra\s*narayan\s*mandal', false);
$$;

-- STEP 1 — Remove duplicate attendance rows on the same IST calendar day.
-- Keep one row per (student, day).
DELETE FROM public.attendance a
USING public.attendance b
WHERE a.student_id = b.student_id
  AND (a.marked_at AT TIME ZONE 'Asia/Kolkata')::date
    = (b.marked_at AT TIME ZONE 'Asia/Kolkata')::date
  AND a.ctid > b.ctid;

-- STEP 2 — Counts = distinct programme-window days per student.
CREATE OR REPLACE FUNCTION public.admin_get_attendance_counts()
RETURNS TABLE(student_id uuid, day_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_may_admin_list_students();

  RETURN QUERY
  WITH att AS (
    SELECT
      a.student_id,
      (a.marked_at AT TIME ZONE 'Asia/Kolkata')::date AS ist_date,
      s.university_name
    FROM public.attendance a
    JOIN public.students s ON s.id = a.student_id
  ),
  windowed AS (
    SELECT
      att.student_id,
      att.ist_date,
      CASE
        WHEN public.is_bnmu_university_name(att.university_name)
          THEN att.ist_date BETWEEN DATE '2026-05-23' AND DATE '2026-06-21'
        WHEN public.is_lnmu_university_name(att.university_name)
          THEN att.ist_date BETWEEN DATE '2026-06-01' AND DATE '2026-06-20'
        ELSE TRUE
      END AS in_window
    FROM att
  )
  SELECT w.student_id, COUNT(DISTINCT w.ist_date)::bigint
  FROM windowed w
  WHERE w.in_window
  GROUP BY w.student_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_attendance_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_attendance_counts() TO authenticated;
