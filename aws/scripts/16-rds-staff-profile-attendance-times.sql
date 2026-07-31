-- Staff profile fields, block flag, and attendance check-in/out times.

ALTER TABLE public.admin_staff
  ADD COLUMN IF NOT EXISTS mobile_number text,
  ADD COLUMN IF NOT EXISTS account_number text,
  ADD COLUMN IF NOT EXISTS ifsc_code text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS aadhaar_number text,
  ADD COLUMN IF NOT EXISTS pan_number text,
  ADD COLUMN IF NOT EXISTS profile_image_url text,
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.employee_attendance
  ADD COLUMN IF NOT EXISTS check_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS check_out_at timestamptz;

-- Staff may update their own row (app only writes profile_image_url from staff UI).
DROP POLICY IF EXISTS "Staff update own admin_staff profile image" ON public.admin_staff;
CREATE POLICY "Staff update own admin_staff profile image" ON public.admin_staff
FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Admins already manage via existing admin policies; ensure UPDATE for admins if missing.
DROP POLICY IF EXISTS "Admins manage admin_staff" ON public.admin_staff;
CREATE POLICY "Admins manage admin_staff" ON public.admin_staff
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

CREATE OR REPLACE FUNCTION public.staff_update_profile_image(p_profile_image_url text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  UPDATE public.admin_staff
  SET
    profile_image_url = NULLIF(trim(COALESCE(p_profile_image_url, '')), ''),
    updated_at = now()
  WHERE id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff profile not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN json_build_object('ok', true, 'profile_image_url', p_profile_image_url);
END;
$$;

REVOKE ALL ON FUNCTION public.staff_update_profile_image(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_update_profile_image(text) TO authenticated;
