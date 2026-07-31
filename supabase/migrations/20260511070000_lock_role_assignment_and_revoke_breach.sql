-- =============================================================================
-- SECURITY HARDENING + INCIDENT REMEDIATION
-- Incident: a student account (dilxxso1@gmail.com) reached /admin because the
-- signup trigger trusted `raw_user_meta_data.role` (and other code paths trusted
-- `raw_user_meta_data.is_staff`). Both are client-editable through the Supabase
-- anon key (auth.signUp options.data / auth.updateUser data), so any visitor
-- could promote themselves.
--
-- This migration:
--   1) Locks public.handle_new_user so it ALWAYS assigns the 'student' role
--      and never reads role/is_staff from client metadata.
--   2) Moves elevation into the admin-only RPC finalize_sub_admin_creation:
--      it now writes the user_roles row directly (admin or staff) under the
--      caller's verified admin/super_admin JWT.
--   3) Drops the is_staff metadata clause from the login-routing RPCs.
--   4) Strips `role` + `is_staff` from raw_user_meta_data on every existing
--      account that DOES NOT have a legitimate elevated row in user_roles, so
--      stale metadata can't be used to flip future routing decisions.
--   5) Revokes admin/super_admin/staff from dilxxso1@gmail.com (if present),
--      ensures they have a 'student' role, and invalidates their refresh
--      tokens so the active session terminates immediately.
-- =============================================================================

-- 1) Harden handle_new_user — role/is_staff in raw_user_meta_data is IGNORED.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Always default to student. Elevation only happens via
    -- finalize_sub_admin_creation() called under an admin/super_admin JWT.
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'student'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    INSERT INTO public.profiles (id, full_name, email)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, 'User'),
        COALESCE(NEW.email, '')
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2) Role elevation now happens server-side in finalize_sub_admin_creation
--    under the caller's verified admin/super_admin JWT.
CREATE OR REPLACE FUNCTION public.finalize_sub_admin_creation(
  target_user_id uuid,
  staff_email text,
  staff_full_name text,
  p_permissions jsonb DEFAULT '{}'::jsonb,
  p_role public.app_role DEFAULT 'staff'::public.app_role
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_is_super boolean := EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'super_admin'::public.app_role
  );
  v_caller_is_admin boolean := v_caller_is_super OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'::public.app_role
  );
BEGIN
  IF NOT v_caller_is_admin THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  -- Only super_admins may mint admins. Admins may only mint staff.
  IF p_role = 'super_admin'::public.app_role THEN
    RAISE EXCEPTION 'Cannot create super_admin via this RPC' USING ERRCODE = '42501';
  END IF;
  IF p_role = 'admin'::public.app_role AND NOT v_caller_is_super THEN
    RAISE EXCEPTION 'Only super_admin can create admin accounts' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('admin'::public.app_role, 'staff'::public.app_role) THEN
    RAISE EXCEPTION 'Invalid role for sub-admin creation' USING ERRCODE = '22023';
  END IF;

  -- Replace any existing elevated rows for this target with the requested role.
  DELETE FROM public.user_roles
  WHERE user_id = target_user_id
    AND role IN (
      'admin'::public.app_role,
      'staff'::public.app_role
    );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.admin_permissions (
    user_id,
    can_manage_students,
    can_manage_classes,
    can_manage_certificates,
    can_manage_institutions,
    can_view_payments,
    can_manage_leads,
    can_manage_notifications,
    can_manage_assignments,
    can_manage_communications
  )
  VALUES (
    target_user_id,
    COALESCE((p_permissions ->> 'can_manage_students')::boolean, true),
    COALESCE((p_permissions ->> 'can_manage_classes')::boolean, true),
    COALESCE((p_permissions ->> 'can_manage_certificates')::boolean, true),
    COALESCE((p_permissions ->> 'can_manage_institutions')::boolean, true),
    COALESCE((p_permissions ->> 'can_view_payments')::boolean, true),
    COALESCE((p_permissions ->> 'can_manage_leads')::boolean, true),
    COALESCE((p_permissions ->> 'can_manage_notifications')::boolean, true),
    COALESCE((p_permissions ->> 'can_manage_assignments')::boolean, true),
    COALESCE((p_permissions ->> 'can_manage_communications')::boolean, true)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    can_manage_students = EXCLUDED.can_manage_students,
    can_manage_classes = EXCLUDED.can_manage_classes,
    can_manage_certificates = EXCLUDED.can_manage_certificates,
    can_manage_institutions = EXCLUDED.can_manage_institutions,
    can_view_payments = EXCLUDED.can_view_payments,
    can_manage_leads = EXCLUDED.can_manage_leads,
    can_manage_notifications = EXCLUDED.can_manage_notifications,
    can_manage_assignments = EXCLUDED.can_manage_assignments,
    can_manage_communications = EXCLUDED.can_manage_communications;

  INSERT INTO public.admin_staff (id, email, full_name, role_tag, permissions)
  VALUES (
    target_user_id,
    lower(trim(staff_email)),
    staff_full_name,
    staff_full_name,
    COALESCE(p_permissions, '{}'::jsonb)
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role_tag = EXCLUDED.role_tag,
    permissions = EXCLUDED.permissions;

  BEGIN
    UPDATE public.profiles
    SET
      full_name = COALESCE(NULLIF(trim(staff_full_name), ''), full_name),
      email = lower(trim(staff_email))
    WHERE id = target_user_id;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN json_build_object('ok', true, 'role', p_role::text);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_sub_admin_creation(uuid, text, text, jsonb, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_sub_admin_creation(uuid, text, text, jsonb, public.app_role) TO authenticated;

-- 3) Login-routing RPCs no longer trust raw_user_meta_data.is_staff.
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
              'staff'::public.app_role
            )
        )
        OR EXISTS (SELECT 1 FROM public.cybercafe_profiles c WHERE c.id = u.id)
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.account_requires_admin_login(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_is_student_only(text) TO anon, authenticated;

-- 4) Strip role / is_staff from raw_user_meta_data on accounts that are NOT in
--    user_roles as admin/super_admin/staff. Stale metadata can't be used to
--    flip future routing decisions even if older client code still reads it.
UPDATE auth.users u
SET raw_user_meta_data = COALESCE(u.raw_user_meta_data, '{}'::jsonb) - 'role' - 'is_staff'
WHERE (
        COALESCE((u.raw_user_meta_data ? 'role'), false)
        OR COALESCE((u.raw_user_meta_data ? 'is_staff'), false)
      )
  AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = u.id
          AND ur.role IN (
            'admin'::public.app_role,
            'super_admin'::public.app_role,
            'staff'::public.app_role
          )
      );

-- 5) Targeted incident remediation: dilxxso1@gmail.com
DO $remediate$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(trim(email)) = 'dilxxso1@gmail.com'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'dilxxso1@gmail.com not present; nothing to revoke.';
    RETURN;
  END IF;

  -- Drop every elevated role row.
  DELETE FROM public.user_roles
  WHERE user_id = v_user_id
    AND role IN (
      'admin'::public.app_role,
      'super_admin'::public.app_role,
      'staff'::public.app_role
    );

  -- Drop any admin permission / directory rows just in case.
  DELETE FROM public.admin_permissions WHERE user_id = v_user_id;
  DELETE FROM public.admin_staff WHERE id = v_user_id;

  -- Ensure they're a regular student.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'student'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Clean any role / is_staff metadata bits.
  UPDATE auth.users
  SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) - 'role' - 'is_staff'
  WHERE id = v_user_id;

  -- Force the active session to terminate immediately by invalidating refresh
  -- tokens. (Access tokens are short-lived JWTs and will fail to refresh.)
  BEGIN
    DELETE FROM auth.refresh_tokens WHERE user_id::uuid = v_user_id;
  EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
    RAISE NOTICE 'Skipped auth.refresh_tokens cleanup (insufficient privilege). Use Supabase Auth → Users → "Sign out user" for dilxxso1@gmail.com.';
  END;

  RAISE NOTICE 'Revoked elevated access for dilxxso1@gmail.com (user_id=%).', v_user_id;
END;
$remediate$;
