-- Re-enable self profile editing for LNMU and BNMU students.
-- Run in Supabase SQL Editor after hotfix_lnmu_bnmu_student_self_profile_lock.sql.

DROP TRIGGER IF EXISTS trg_block_lnmu_bnmu_student_self_profile_update ON public.students;

-- Keep function as no-op so older deploy scripts that recreate it stay harmless.
CREATE OR REPLACE FUNCTION public.block_lnmu_bnmu_student_self_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NEW;
END;
$$;
