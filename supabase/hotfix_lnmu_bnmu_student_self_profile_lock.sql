-- DEPRECATED: superseded by hotfix_enable_lnmu_bnmu_student_profile_edit.sql
-- Block LNMU learners only from self-editing profile from 23 June 2026.
-- BNMU students may edit; admins/staff may update any student profile anytime.
-- Safe to re-run in Supabase SQL Editor.

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

CREATE OR REPLACE FUNCTION public.auth_may_manage_students_as_admin()
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

CREATE OR REPLACE FUNCTION public.block_lnmu_bnmu_student_self_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uni text;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> OLD.id THEN
    RETURN NEW;
  END IF;

  IF public.auth_may_manage_students_as_admin() THEN
    RETURN NEW;
  END IF;

  v_uni := COALESCE(
    NULLIF(trim(NEW.university_name), ''),
    NULLIF(trim(OLD.university_name), '')
  );

  IF public.is_lnmu_university_name(v_uni)
     AND CURRENT_DATE >= DATE '2026-06-23' THEN
    RAISE EXCEPTION 'Profile editing is no longer available for your university.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_lnmu_bnmu_student_self_profile_update ON public.students;

CREATE TRIGGER trg_block_lnmu_bnmu_student_self_profile_update
  BEFORE UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.block_lnmu_bnmu_student_self_profile_update();
