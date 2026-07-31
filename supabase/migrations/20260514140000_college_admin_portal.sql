-- College portal: role + assignment + finalize RPC + scoped RLS + login helpers.
-- Enum label `college_admin` is added in 20260514135500_college_admin_app_role_enum.sql
-- (separate migration / transaction — required by Postgres 55P04).

CREATE OR REPLACE FUNCTION public.normalize_space_label(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(trim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g')))
$$;

CREATE TABLE IF NOT EXISTS public.college_admin_assignments (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  college_id uuid NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
  college_admin_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT college_admin_assignments_code_key UNIQUE (college_admin_code)
);

CREATE INDEX IF NOT EXISTS idx_college_admin_assignments_college
  ON public.college_admin_assignments (college_id);

COMMENT ON TABLE public.college_admin_assignments IS
  'College portal accounts: one row per auth user; college_admin_code is the initial Supabase password (College Admin ID).';

ALTER TABLE public.college_admin_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "College admin reads own assignment" ON public.college_admin_assignments;
CREATE POLICY "College admin reads own assignment"
  ON public.college_admin_assignments
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage college admin assignments" ON public.college_admin_assignments;
CREATE POLICY "Admins manage college admin assignments"
  ON public.college_admin_assignments
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

GRANT SELECT ON public.college_admin_assignments TO authenticated;

-- ---------------------------------------------------------------------------
-- finalize_college_admin_creation: anon signup → elevate under admin JWT.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_college_admin_creation(
  target_user_id uuid,
  staff_email text,
  staff_full_name text,
  p_college_id uuid,
  p_college_admin_code text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_ok boolean := EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  );
BEGIN
  IF NOT v_caller_ok THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  IF p_college_id IS NULL THEN
    RAISE EXCEPTION 'College is required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.colleges WHERE id = p_college_id) THEN
    RAISE EXCEPTION 'Invalid college_id' USING ERRCODE = '22023';
  END IF;

  IF p_college_admin_code IS NULL OR length(trim(p_college_admin_code)) < 6 THEN
    RAISE EXCEPTION 'College admin code must be at least 6 characters' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = target_user_id
    AND role IN (
      'student'::public.app_role,
      'admin'::public.app_role,
      'staff'::public.app_role,
      'college_admin'::public.app_role
    );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'college_admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.college_admin_assignments (user_id, college_id, college_admin_code)
  VALUES (target_user_id, p_college_id, trim(p_college_admin_code))
  ON CONFLICT (user_id) DO UPDATE SET
    college_id = EXCLUDED.college_id,
    college_admin_code = EXCLUDED.college_admin_code;

  BEGIN
    UPDATE public.profiles
    SET
      full_name = COALESCE(NULLIF(trim(staff_full_name), ''), full_name),
      email = lower(trim(staff_email))
    WHERE id = target_user_id;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN json_build_object('ok', true, 'role', 'college_admin');
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_college_admin_creation(uuid, text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_college_admin_creation(uuid, text, text, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Login routing: college admins use /college/login only; block wrong portals.
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
              'college_admin'::public.app_role
            )
        )
        OR EXISTS (SELECT 1 FROM public.cybercafe_profiles c WHERE c.id = u.id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.account_may_use_college_login(check_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    JOIN public.user_roles ur ON ur.user_id = u.id AND ur.role = 'college_admin'::public.app_role
    WHERE lower(trim(u.email)) = lower(trim(check_email))
  );
$$;

GRANT EXECUTE ON FUNCTION public.account_may_use_college_login(text) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.account_requires_admin_login(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_is_student_only(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Students: college admins see rows where roster college name matches assignment.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "College admins view their college students" ON public.students;
CREATE POLICY "College admins view their college students"
  ON public.students
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'college_admin'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.college_admin_assignments caa
      JOIN public.colleges c ON c.id = caa.college_id
      WHERE caa.user_id = auth.uid()
        AND public.normalize_space_label(c.name)
          = public.normalize_space_label(public.students.college_name)
    )
  );

-- Profiles (read-only for assigned college learners)
DROP POLICY IF EXISTS "College admins view profiles of their college students" ON public.profiles;
CREATE POLICY "College admins view profiles of their college students"
  ON public.profiles
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'college_admin'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.college_admin_assignments caa ON caa.user_id = auth.uid()
      JOIN public.colleges c ON c.id = caa.college_id
      WHERE s.id = public.profiles.id
        AND public.normalize_space_label(c.name)
          = public.normalize_space_label(s.college_name)
    )
  );
