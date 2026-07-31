-- RDS gap-fill part 6: fast admin student list + attendance counts (text created_at safe).

DROP FUNCTION IF EXISTS public.admin_list_students_light();
DROP FUNCTION IF EXISTS public.admin_get_attendance_counts();

CREATE OR REPLACE FUNCTION public.admin_list_students_light()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  college_name text,
  university_name text,
  created_at timestamptz,
  status text,
  internship_domain text,
  registration_id text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_may_admin_list_students();

  RETURN QUERY
  SELECT
    s.id,
    s.full_name,
    s.email,
    s.college_name,
    s.university_name,
    public.student_created_at_ts(s),
    s.status,
    s.internship_domain,
    s.registration_id
  FROM public.students s
  ORDER BY public.student_created_at_ts(s) DESC NULLS LAST, s.id DESC;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_attendance_student_marked
  ON public.attendance (student_id, marked_at);

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

REVOKE ALL ON FUNCTION public.admin_list_students_light() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_attendance_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_students_light() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_attendance_counts() TO authenticated;
