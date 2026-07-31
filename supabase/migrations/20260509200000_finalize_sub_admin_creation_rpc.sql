-- Sub-admin creation without SUPABASE_SERVICE_ROLE_KEY:
-- Requires handle_new_user (fix_signup_error.sql or equivalent) so signup assigns roles + admin_permissions from raw_user_meta_data.
-- Ensure enum app_role includes 'staff' (see supabase/add_staff_role.sql) before creating staff accounts.

-- 1) Browser calls auth.signUp (anon key) with role + is_staff in raw_user_meta_data (trigger handle_new_user).
-- 2) Caller invokes finalize_sub_admin_creation(...) using their admin JWT to set granular permissions + admin_staff row.

CREATE TABLE IF NOT EXISTS public.admin_staff (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role_tag TEXT,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_staff_email ON public.admin_staff (lower(email));

ALTER TABLE public.admin_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read admin_staff directory" ON public.admin_staff;
CREATE POLICY "Admins read admin_staff directory" ON public.admin_staff
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  )
);

COMMENT ON TABLE public.admin_staff IS 'Optional directory row for staff/sub-admins; mutations use finalize_sub_admin_creation RPC.';

CREATE OR REPLACE FUNCTION public.finalize_sub_admin_creation(
  target_user_id uuid,
  staff_email text,
  staff_full_name text,
  p_permissions jsonb DEFAULT '{}'::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

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
    -- Older schemas may differ; core permission rows still succeed.
    NULL;
  END;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_sub_admin_creation(uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_sub_admin_creation(uuid, text, text, jsonb) TO authenticated;
