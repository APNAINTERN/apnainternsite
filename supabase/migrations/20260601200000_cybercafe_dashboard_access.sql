-- Cyber cafe dashboard RPCs + RLS (same as hotfix_cybercafe_dashboard_access.sql).

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS cybercafe_shop_name TEXT,
  ADD COLUMN IF NOT EXISTS cybercafe_email TEXT;

ALTER TABLE public.payment_cancelled
  ADD COLUMN IF NOT EXISTS cybercafe_shop_name TEXT,
  ADD COLUMN IF NOT EXISTS cybercafe_email TEXT;

CREATE INDEX IF NOT EXISTS idx_students_cybercafe_email_lower
  ON public.students (lower(trim(cybercafe_email)))
  WHERE cybercafe_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_success_cybercafe_email_lower
  ON public.payment_success (lower(trim(cybercafe_email)))
  WHERE cybercafe_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_cancelled_cybercafe_email_lower
  ON public.payment_cancelled (lower(trim(cybercafe_email)))
  WHERE cybercafe_email IS NOT NULL;

CREATE OR REPLACE FUNCTION public._cybercafe_partner_email(p_uid uuid DEFAULT auth.uid())
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(trim(cp.email))
  FROM public.cybercafe_profiles cp
  WHERE cp.id = p_uid
    AND cp.status = 'approved'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.cybercafe_list_students()
RETURNS SETOF public.students
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.*
  FROM public.students s
  WHERE public._cybercafe_partner_email() IS NOT NULL
    AND (
      lower(trim(COALESCE(s.cybercafe_email, ''))) = public._cybercafe_partner_email()
      OR lower(trim(COALESCE(s.metadata->>'cybercafe_email', ''))) = public._cybercafe_partner_email()
    )
  ORDER BY s.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.cybercafe_get_student_by_email(p_student_email text)
RETURNS SETOF public.students
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.*
  FROM public.students s
  WHERE public._cybercafe_partner_email() IS NOT NULL
    AND lower(trim(COALESCE(p_student_email, ''))) <> ''
    AND lower(trim(s.email)) = lower(trim(p_student_email))
    AND (
      lower(trim(COALESCE(s.cybercafe_email, ''))) = public._cybercafe_partner_email()
      OR lower(trim(COALESCE(s.metadata->>'cybercafe_email', ''))) = public._cybercafe_partner_email()
    )
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.cybercafe_list_payment_success(p_status text DEFAULT 'success')
RETURNS SETOF public.payment_success
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ps.*
  FROM public.payment_success ps
  WHERE public._cybercafe_partner_email() IS NOT NULL
    AND lower(trim(COALESCE(ps.cybercafe_email, ''))) = public._cybercafe_partner_email()
    AND (
      p_status IS NULL
      OR trim(p_status) = ''
      OR lower(trim(COALESCE(ps.status, 'success'))) = lower(trim(p_status))
    )
  ORDER BY ps.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.cybercafe_list_payment_cancelled()
RETURNS SETOF public.payment_cancelled
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pc.*
  FROM public.payment_cancelled pc
  WHERE public._cybercafe_partner_email() IS NOT NULL
    AND (
      lower(trim(COALESCE(pc.cybercafe_email, ''))) = public._cybercafe_partner_email()
      OR lower(trim(COALESCE(pc.metadata->>'cybercafe_email', ''))) = public._cybercafe_partner_email()
    )
  ORDER BY pc.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.cybercafe_list_failed_payments()
RETURNS SETOF public.payment_success
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ps.*
  FROM public.payment_success ps
  WHERE public._cybercafe_partner_email() IS NOT NULL
    AND lower(trim(COALESCE(ps.cybercafe_email, ''))) = public._cybercafe_partner_email()
    AND lower(trim(COALESCE(ps.status, 'success'))) NOT IN ('', 'success')
  ORDER BY ps.created_at DESC;
$$;

DROP POLICY IF EXISTS "Cybercafe partners view their students" ON public.students;
CREATE POLICY "Cybercafe partners view their students"
  ON public.students
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.cybercafe_profiles cp
      WHERE cp.id = auth.uid()
        AND cp.status = 'approved'
        AND (
          lower(trim(cp.email)) = lower(trim(COALESCE(public.students.cybercafe_email, '')))
          OR lower(trim(cp.email)) = lower(trim(COALESCE(public.students.metadata->>'cybercafe_email', '')))
        )
    )
  );

DROP POLICY IF EXISTS "Cybercafe partners view their payment success" ON public.payment_success;
CREATE POLICY "Cybercafe partners view their payment success"
  ON public.payment_success
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.cybercafe_profiles cp
      WHERE cp.id = auth.uid()
        AND cp.status = 'approved'
        AND lower(trim(cp.email)) = lower(trim(COALESCE(public.payment_success.cybercafe_email, '')))
    )
  );

DROP POLICY IF EXISTS "Cybercafe partners view their cancelled payments" ON public.payment_cancelled;
CREATE POLICY "Cybercafe partners view their cancelled payments"
  ON public.payment_cancelled
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.cybercafe_profiles cp
      WHERE cp.id = auth.uid()
        AND cp.status = 'approved'
        AND (
          lower(trim(cp.email)) = lower(trim(COALESCE(public.payment_cancelled.cybercafe_email, '')))
          OR lower(trim(cp.email)) = lower(trim(COALESCE(public.payment_cancelled.metadata->>'cybercafe_email', '')))
        )
    )
  );

REVOKE ALL ON FUNCTION public._cybercafe_partner_email(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cybercafe_list_students() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cybercafe_get_student_by_email(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cybercafe_list_payment_success(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cybercafe_list_payment_cancelled() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cybercafe_list_failed_payments() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public._cybercafe_partner_email(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cybercafe_list_students() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cybercafe_get_student_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cybercafe_list_payment_success(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cybercafe_list_payment_cancelled() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cybercafe_list_failed_payments() TO authenticated;
