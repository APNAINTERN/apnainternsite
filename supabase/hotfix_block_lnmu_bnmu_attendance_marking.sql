-- Block LNMU & BNMU students from self-marking attendance from 22 June 2026.
-- Admins/staff may still insert attendance (including backfill before 22 Jun).
-- Run once in Supabase SQL Editor (re-run to update trigger logic).

CREATE OR REPLACE FUNCTION public.is_bnmu_university_name(p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    lower(trim(p_name)) ~ 'bnmu|bhupendra\s*narayan\s*mandal',
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_lnmu_or_bnmu_university_name(p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.is_lnmu_university_name(p_name)
      OR public.is_bnmu_university_name(p_name);
$$;

CREATE OR REPLACE FUNCTION public.auth_may_mark_lnmu_bnmu_attendance_as_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND NOT COALESCE(public.auth_is_referral_partner_scoped_only(auth.uid()), false)
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN (
          'admin'::public.app_role,
          'super_admin'::public.app_role,
          'staff'::public.app_role
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.block_lnmu_bnmu_student_attendance_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uni text;
BEGIN
  SELECT s.university_name INTO v_uni
  FROM public.students s
  WHERE s.id = NEW.student_id;

  IF public.is_lnmu_or_bnmu_university_name(v_uni)
     AND CURRENT_DATE >= DATE '2026-06-22'
     AND NOT public.auth_may_mark_lnmu_bnmu_attendance_as_admin() THEN
    RAISE EXCEPTION 'Unable to mark attendance';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_lnmu_bnmu_student_attendance ON public.attendance;

CREATE TRIGGER trg_block_lnmu_bnmu_student_attendance
  BEFORE INSERT ON public.attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.block_lnmu_bnmu_student_attendance_insert();
