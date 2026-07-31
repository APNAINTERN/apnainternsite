-- Staff permissions (engineering flag + false defaults), employee attendance,
-- staff sessions/activity, and admin_staff own-row SELECT for staff.

-- ── 1) Engineering permission column ─────────────────────────────────────────
ALTER TABLE public.admin_permissions
  ADD COLUMN IF NOT EXISTS can_manage_engineering boolean NOT NULL DEFAULT false;

-- ── 2) Staff can read their own admin_staff row ───────────────────────────────
DROP POLICY IF EXISTS "Staff read own admin_staff" ON public.admin_staff;
CREATE POLICY "Staff read own admin_staff" ON public.admin_staff
FOR SELECT USING (id = auth.uid());

-- ── 3) Employee attendance ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employee_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('present', 'absent', 'half_day', 'leave')),
  notes text,
  marked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_employee_attendance_employee
  ON public.employee_attendance (employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_attendance_date
  ON public.employee_attendance (attendance_date DESC);

ALTER TABLE public.employee_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage employee_attendance" ON public.employee_attendance;
CREATE POLICY "Admins manage employee_attendance" ON public.employee_attendance
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

DROP POLICY IF EXISTS "Staff read own employee_attendance" ON public.employee_attendance;
CREATE POLICY "Staff read own employee_attendance" ON public.employee_attendance
FOR SELECT TO authenticated
USING (employee_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_attendance TO authenticated;

-- ── 4) Staff auth sessions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_key text NOT NULL,
  device_label text,
  user_agent text,
  ip_hint text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (user_id, session_key)
);

CREATE INDEX IF NOT EXISTS idx_staff_auth_sessions_user
  ON public.staff_auth_sessions (user_id);

ALTER TABLE public.staff_auth_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read own sessions" ON public.staff_auth_sessions;
CREATE POLICY "Staff read own sessions" ON public.staff_auth_sessions
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins read staff sessions" ON public.staff_auth_sessions;
CREATE POLICY "Admins read staff sessions" ON public.staff_auth_sessions
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

GRANT SELECT ON public.staff_auth_sessions TO authenticated;

-- ── 5) Staff activity log ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_activity_log_user
  ON public.staff_activity_log (user_id, created_at DESC);

ALTER TABLE public.staff_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read own activity" ON public.staff_activity_log;
CREATE POLICY "Staff read own activity" ON public.staff_activity_log
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins read staff activity" ON public.staff_activity_log;
CREATE POLICY "Admins read staff activity" ON public.staff_activity_log
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

GRANT SELECT ON public.staff_activity_log TO authenticated;

-- ── 6) Session / activity RPCs ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.staff_touch_session(
  p_session_key text,
  p_device_label text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_ip_hint text DEFAULT NULL
)
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
  IF p_session_key IS NULL OR length(trim(p_session_key)) < 8 THEN
    RAISE EXCEPTION 'Invalid session key' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.staff_auth_sessions (
    user_id, session_key, device_label, user_agent, ip_hint, last_seen_at, revoked_at
  )
  VALUES (
    v_uid,
    trim(p_session_key),
    NULLIF(trim(COALESCE(p_device_label, '')), ''),
    NULLIF(trim(COALESCE(p_user_agent, '')), ''),
    NULLIF(trim(COALESCE(p_ip_hint, '')), ''),
    now(),
    NULL
  )
  ON CONFLICT (user_id, session_key) DO UPDATE SET
    device_label = COALESCE(EXCLUDED.device_label, public.staff_auth_sessions.device_label),
    user_agent = COALESCE(EXCLUDED.user_agent, public.staff_auth_sessions.user_agent),
    ip_hint = COALESCE(EXCLUDED.ip_hint, public.staff_auth_sessions.ip_hint),
    last_seen_at = now(),
    revoked_at = NULL;

  RETURN json_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_revoke_session(p_session_key text)
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

  UPDATE public.staff_auth_sessions
  SET revoked_at = now()
  WHERE user_id = v_uid
    AND session_key = trim(p_session_key)
    AND revoked_at IS NULL;

  RETURN json_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_revoke_other_sessions(p_keep_session_key text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  UPDATE public.staff_auth_sessions
  SET revoked_at = now()
  WHERE user_id = v_uid
    AND revoked_at IS NULL
    AND session_key IS DISTINCT FROM trim(COALESCE(p_keep_session_key, ''));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN json_build_object('ok', true, 'revoked', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_log_activity(
  p_event_type text,
  p_detail text DEFAULT NULL
)
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
  IF p_event_type IS NULL OR length(trim(p_event_type)) = 0 THEN
    RAISE EXCEPTION 'event_type required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.staff_activity_log (user_id, event_type, detail)
  VALUES (v_uid, trim(p_event_type), NULLIF(trim(COALESCE(p_detail, '')), ''));

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.staff_touch_session(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_revoke_session(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_revoke_other_sessions(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_log_activity(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_touch_session(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_revoke_session(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_revoke_other_sessions(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_log_activity(text, text) TO authenticated;

-- ── 7) finalize_sub_admin_creation — false defaults + engineering ────────────
DROP FUNCTION IF EXISTS public.finalize_sub_admin_creation(uuid, text, text, jsonb);
DROP FUNCTION IF EXISTS public.finalize_sub_admin_creation(uuid, text, text, jsonb, public.app_role);

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

  IF p_role = 'super_admin'::public.app_role THEN
    RAISE EXCEPTION 'Cannot create super_admin via this RPC' USING ERRCODE = '42501';
  END IF;
  IF p_role = 'admin'::public.app_role AND NOT v_caller_is_super THEN
    RAISE EXCEPTION 'Only super_admin can create admin accounts' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('admin'::public.app_role, 'staff'::public.app_role) THEN
    RAISE EXCEPTION 'Invalid role for sub-admin creation' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = target_user_id
    AND role IN (
      'student'::public.app_role,
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
    can_manage_communications,
    can_manage_engineering
  )
  VALUES (
    target_user_id,
    COALESCE((p_permissions ->> 'can_manage_students')::boolean, false),
    COALESCE((p_permissions ->> 'can_manage_classes')::boolean, false),
    COALESCE((p_permissions ->> 'can_manage_certificates')::boolean, false),
    COALESCE((p_permissions ->> 'can_manage_institutions')::boolean, false),
    COALESCE((p_permissions ->> 'can_view_payments')::boolean, false),
    COALESCE((p_permissions ->> 'can_manage_leads')::boolean, false),
    COALESCE((p_permissions ->> 'can_manage_notifications')::boolean, false),
    COALESCE((p_permissions ->> 'can_manage_assignments')::boolean, false),
    COALESCE((p_permissions ->> 'can_manage_communications')::boolean, false),
    COALESCE((p_permissions ->> 'can_manage_engineering')::boolean, false)
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
    can_manage_communications = EXCLUDED.can_manage_communications,
    can_manage_engineering = EXCLUDED.can_manage_engineering;

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
