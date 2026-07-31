-- Referral promoter portal: allow staff + harden finalize checks.

CREATE OR REPLACE FUNCTION public.finalize_referral_partner_creation(
  target_user_id uuid,
  p_partner_id uuid,
  p_login_secret text,
  partner_full_name text,
  partner_email text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean := EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN (
        'admin'::public.app_role,
        'super_admin'::public.app_role,
        'staff'::public.app_role
      )
  );
BEGIN
  IF NOT v_ok THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  IF p_partner_id IS NULL OR target_user_id IS NULL THEN
    RAISE EXCEPTION 'partner and user are required' USING ERRCODE = '22023';
  END IF;

  IF p_login_secret IS NULL OR length(trim(p_login_secret)) < 6 THEN
    RAISE EXCEPTION 'Login secret must be at least 6 characters' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'Auth user not found for portal signup' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.referral_partners
    WHERE id = p_partner_id
      AND lower(trim(email)) = lower(trim(partner_email))
      AND auth_user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Invalid partner, email mismatch, or portal already provisioned' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = target_user_id
    AND role IN (
      'student'::public.app_role,
      'admin'::public.app_role,
      'staff'::public.app_role,
      'college_admin'::public.app_role,
      'referral_partner'::public.app_role
    );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'referral_partner'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.referral_partners
  SET
    auth_user_id = target_user_id,
    partner_login_secret = trim(p_login_secret),
    full_name = COALESCE(NULLIF(trim(partner_full_name), ''), full_name),
    email = lower(trim(partner_email)),
    updated_at = now()
  WHERE id = p_partner_id;

  BEGIN
    UPDATE public.profiles
    SET
      full_name = COALESCE(NULLIF(trim(partner_full_name), ''), full_name),
      email = lower(trim(partner_email))
    WHERE id = target_user_id;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_referral_partner_creation(uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_referral_partner_creation(uuid, uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.detach_referral_partner_portal(p_partner_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean := EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN (
        'admin'::public.app_role,
        'super_admin'::public.app_role,
        'staff'::public.app_role
      )
  );
  v_uid uuid;
BEGIN
  IF NOT v_ok THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  SELECT auth_user_id INTO v_uid FROM public.referral_partners WHERE id = p_partner_id FOR UPDATE;
  IF v_uid IS NULL THEN
    RETURN json_build_object('ok', true, 'note', 'no_portal');
  END IF;

  UPDATE public.referral_partners
  SET auth_user_id = NULL, partner_login_secret = NULL, updated_at = now()
  WHERE id = p_partner_id;

  DELETE FROM public.user_roles
  WHERE user_id = v_uid AND role = 'referral_partner'::public.app_role;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'student'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.detach_referral_partner_portal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detach_referral_partner_portal(uuid) TO authenticated;

-- Staff can manage referral partner rows (create portal updates auth_user_id)
DROP POLICY IF EXISTS "Admins manage referral partners" ON public.referral_partners;
CREATE POLICY "Admins manage referral partners" ON public.referral_partners
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'staff'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'staff'::public.app_role)
  );
