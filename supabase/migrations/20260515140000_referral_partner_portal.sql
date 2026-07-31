-- Referral promoters: auth-linked partners + scoped student visibility + login RPCs.

ALTER TABLE public.referral_partners
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.referral_partners
  ADD COLUMN IF NOT EXISTS partner_login_secret text;

COMMENT ON COLUMN public.referral_partners.auth_user_id IS 'Supabase Auth user for /referral/login portal; NULL until provisioned.';
COMMENT ON COLUMN public.referral_partners.partner_login_secret IS 'Initial login secret (same as Auth password at provision); optional support copy.';

CREATE INDEX IF NOT EXISTS idx_referral_partners_auth_user ON public.referral_partners (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

DROP POLICY IF EXISTS "Referral partners read own partner row" ON public.referral_partners;
CREATE POLICY "Referral partners read own partner row"
  ON public.referral_partners
  FOR SELECT
  USING (auth_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- finalize_referral_partner_creation: signup under admin JWT → link partner row.
-- ---------------------------------------------------------------------------
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
      AND role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
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

-- ---------------------------------------------------------------------------
-- Admin: remove portal link (partner row unlinked; auth user gets student role).
-- ---------------------------------------------------------------------------
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
      AND role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
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

-- ---------------------------------------------------------------------------
-- Login routing
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.account_requires_admin_login(check_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE lower(trim(u.email)) = lower(trim(check_email))
      AND (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = u.id
            AND ur.role IN (
              'admin'::public.app_role,
              'super_admin'::public.app_role,
              'staff'::public.app_role
            )
        )
        OR EXISTS (SELECT 1 FROM public.cybercafe_profiles c WHERE c.id = u.id)
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur2
          WHERE ur2.user_id = u.id
            AND ur2.role = 'college_admin'::public.app_role
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur3
          WHERE ur3.user_id = u.id
            AND ur3.role = 'referral_partner'::public.app_role
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.account_is_student_only(check_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE lower(trim(u.email)) = lower(trim(check_email))
      AND NOT (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = u.id
            AND ur.role IN (
              'admin'::public.app_role,
              'super_admin'::public.app_role,
              'staff'::public.app_role,
              'college_admin'::public.app_role,
              'referral_partner'::public.app_role
            )
        )
        OR EXISTS (SELECT 1 FROM public.cybercafe_profiles c WHERE c.id = u.id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.account_may_use_referral_login(check_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    JOIN public.user_roles ur ON ur.user_id = u.id AND ur.role = 'referral_partner'::public.app_role
    WHERE lower(trim(u.email)) = lower(trim(check_email))
  );
$$;

GRANT EXECUTE ON FUNCTION public.account_may_use_referral_login(text) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.account_requires_admin_login(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_is_student_only(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Students: referral partners see rows matching their referral_code.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Referral partners see referred students" ON public.students;
CREATE POLICY "Referral partners see referred students"
  ON public.students
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'referral_partner'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.referral_partners rp
      WHERE rp.auth_user_id = auth.uid()
        AND rp.active = true
        AND lower(trim(COALESCE(rp.referral_code, ''))) = lower(trim(COALESCE(public.students.referral_code, '')))
    )
  );

DROP POLICY IF EXISTS "Referral partners view profiles of referred students" ON public.profiles;
CREATE POLICY "Referral partners view profiles of referred students"
  ON public.profiles
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'referral_partner'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.referral_partners rp
      JOIN public.students s ON s.id = public.profiles.id
      WHERE rp.auth_user_id = auth.uid()
        AND rp.active = true
        AND lower(trim(COALESCE(rp.referral_code, ''))) = lower(trim(COALESCE(s.referral_code, '')))
    )
  );
