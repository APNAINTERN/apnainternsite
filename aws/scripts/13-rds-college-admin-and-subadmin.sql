-- Finish college-admin portal RPCs on RDS (students.id is text) + fix sub-admin finalize.

CREATE OR REPLACE FUNCTION public.college_admin_student_visible(
  p_admin_id uuid,
  p_student_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    JOIN public.college_admin_assignments caa ON caa.user_id = p_admin_id
    JOIN public.colleges c ON c.id = caa.college_id
    LEFT JOIN public.universities u ON u.id = c.university_id
    WHERE s.id = p_student_id::text
      AND public.college_admin_college_matches_student(
        c.name,
        u.name,
        s.college_name,
        s.university_name
      )
  );
$$;

REVOKE ALL ON FUNCTION public.college_admin_student_visible(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.college_admin_student_visible(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "College admins view their college students" ON public.students;
CREATE POLICY "College admins view their college students"
  ON public.students
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'college_admin'::public.app_role)
    AND public.college_admin_student_in_scope(college_name, university_name)
  );

CREATE OR REPLACE FUNCTION public.college_admin_list_students()
RETURNS SETOF public.students
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.*
  FROM public.students s
  CROSS JOIN public.college_admin_assigned_scope() sc
  WHERE coalesce(trim(s.college_name), '') <> ''
    AND cardinality(sc.institution_keys) + cardinality(sc.exact_college_names) > 0
    AND public.student_university_in_assigned_scope(
      s.university_name,
      sc.university_keys,
      sc.allow_lnmu
    )
    AND (
      lower(trim(s.college_name)) = ANY(sc.exact_college_names)
      OR public.college_institution_key(s.college_name) = ANY(sc.institution_keys)
    )
  ORDER BY s.created_at DESC
  LIMIT 50000;
$$;

ALTER FUNCTION public.college_admin_list_students() SET statement_timeout = '30s';

REVOKE ALL ON FUNCTION public.college_admin_list_students() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.college_admin_list_students() TO authenticated;

CREATE OR REPLACE FUNCTION public.college_admin_list_students_for_college(p_directory_name text)
RETURNS SETOF public.students
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.*
  FROM public.students s
  CROSS JOIN public.college_admin_assigned_scope() sc
  WHERE trim(s.college_name) = trim(p_directory_name)
    AND public.student_university_in_assigned_scope(
      s.university_name,
      sc.university_keys,
      sc.allow_lnmu
    )
    AND (
      lower(trim(s.college_name)) = ANY(sc.exact_college_names)
      OR public.college_institution_key(s.college_name) = ANY(sc.institution_keys)
    )
  ORDER BY s.created_at DESC
  LIMIT 10000;
$$;

ALTER FUNCTION public.college_admin_list_students_for_college(text) SET statement_timeout = '15s';

REVOKE ALL ON FUNCTION public.college_admin_list_students_for_college(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.college_admin_list_students_for_college(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.college_admin_count_students()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::bigint
  FROM public.students s
  CROSS JOIN public.college_admin_assigned_scope() sc
  WHERE coalesce(trim(s.college_name), '') <> ''
    AND cardinality(sc.institution_keys) + cardinality(sc.exact_college_names) > 0
    AND public.student_university_in_assigned_scope(
      s.university_name,
      sc.university_keys,
      sc.allow_lnmu
    )
    AND (
      lower(trim(s.college_name)) = ANY(sc.exact_college_names)
      OR public.college_institution_key(s.college_name) = ANY(sc.institution_keys)
    );
$$;

CREATE OR REPLACE FUNCTION public.college_admin_count_students_for_college(p_directory_name text)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::bigint
  FROM public.students s
  CROSS JOIN public.college_admin_assigned_scope() sc
  WHERE trim(s.college_name) = trim(p_directory_name)
    AND public.student_university_in_assigned_scope(
      s.university_name,
      sc.university_keys,
      sc.allow_lnmu
    )
    AND (
      lower(trim(s.college_name)) = ANY(sc.exact_college_names)
      OR public.college_institution_key(s.college_name) = ANY(sc.institution_keys)
    );
$$;

REVOKE ALL ON FUNCTION public.college_admin_count_students() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.college_admin_count_students() TO authenticated;
REVOKE ALL ON FUNCTION public.college_admin_count_students_for_college(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.college_admin_count_students_for_college(text) TO authenticated;

-- Sub-admin / staff creation: elevate role (old RDS version only wrote admin_staff rows).
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
