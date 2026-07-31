-- Allow staff to view and manage certificates (alongside existing admin policy).

ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

-- Keep admin policy, ensure WITH CHECK for inserts/updates
DROP POLICY IF EXISTS "Admins manage certificates" ON public.certificates;
CREATE POLICY "Admins manage certificates"
  ON public.certificates
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Staff manage certificates" ON public.certificates;
CREATE POLICY "Staff manage certificates"
  ON public.certificates
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'staff'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'staff'::public.app_role)
  );

-- Public verify stays as-is (SELECT USING true) if present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.certificates'::regclass
      AND polname = 'Public can verify certificates'
  ) THEN
    CREATE POLICY "Public can verify certificates"
      ON public.certificates
      FOR SELECT
      USING (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.certificates TO authenticated;
