-- Fix RLS policies for id_card_generations and id_card_sequences
-- so that staff and authenticated admins can also use these tables.

-- 1. id_card_generations: allow admins AND staff to manage records
DROP POLICY IF EXISTS "Admins can manage id_card_generations" ON public.id_card_generations;

CREATE POLICY "Admins and staff can manage id_card_generations"
  ON public.id_card_generations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('admin', 'super_admin')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.admin_staff
      WHERE admin_staff.id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('admin', 'super_admin')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.admin_staff
      WHERE admin_staff.id = auth.uid()
    )
  );

-- 2. id_card_sequences: the SECURITY DEFINER function manages this, but we
--    need to allow authenticated users to read (for transparency) and the
--    function needs write access. Grant via a policy for the definer context.
DROP POLICY IF EXISTS "Authenticated can read id_card_sequences" ON public.id_card_sequences;
DROP POLICY IF EXISTS "Admins can manage id_card_sequences" ON public.id_card_sequences;

-- Allow admins/staff to read sequence state
CREATE POLICY "Admins and staff can read id_card_sequences"
  ON public.id_card_sequences
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('admin', 'super_admin')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.admin_staff
      WHERE admin_staff.id = auth.uid()
    )
  );

-- The generate_id_card_number function is SECURITY DEFINER so it bypasses
-- RLS when updating the sequence table. Explicitly grant table access to the
-- function's execution context (postgres role used by SECURITY DEFINER).
GRANT SELECT, INSERT, UPDATE ON public.id_card_sequences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.id_card_generations TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_id_card_number(text) TO authenticated;
