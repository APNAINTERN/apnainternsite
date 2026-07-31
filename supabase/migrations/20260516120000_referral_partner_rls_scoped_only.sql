-- Referral-only promoters must NOT satisfy broad student/profile policies (those are OR'd with
-- "Referral partners see referred students" under Postgres permissive RLS). Without this,
-- a user who only has referral_partner can still match e.g. "Admins view all students" if that
-- policy includes staff or other roles, and incorrectly see the full roster.

CREATE OR REPLACE FUNCTION public.auth_is_referral_partner_scoped_only(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _uid
      AND ur.role = 'referral_partner'::public.app_role
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur2
    WHERE ur2.user_id = _uid
      AND ur2.role IN (
        'admin'::public.app_role,
        'super_admin'::public.app_role,
        'staff'::public.app_role,
        'college_admin'::public.app_role
      )
  );
$$;

REVOKE ALL ON FUNCTION public.auth_is_referral_partner_scoped_only(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_referral_partner_scoped_only(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- students: tighten broad SELECT / UPDATE so referral-only accounts never match
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins view all students" ON public.students;
CREATE POLICY "Admins view all students"
  ON public.students
  FOR SELECT
  USING (
    NOT public.auth_is_referral_partner_scoped_only(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN (
          'admin'::public.app_role,
          'super_admin'::public.app_role,
          'staff'::public.app_role
        )
    )
  );

DROP POLICY IF EXISTS "Admins update all students" ON public.students;
CREATE POLICY "Admins update all students"
  ON public.students
  FOR UPDATE
  USING (
    NOT public.auth_is_referral_partner_scoped_only(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN (
          'admin'::public.app_role,
          'super_admin'::public.app_role,
          'staff'::public.app_role
        )
    )
  );

DROP POLICY IF EXISTS "College admins view their college students" ON public.students;
CREATE POLICY "College admins view their college students"
  ON public.students
  FOR SELECT
  USING (
    NOT public.auth_is_referral_partner_scoped_only(auth.uid())
    AND public.has_role(auth.uid(), 'college_admin'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.college_admin_assignments caa
      JOIN public.colleges c ON c.id = caa.college_id
      WHERE caa.user_id = auth.uid()
        AND public.normalize_space_label(c.name)
          = public.normalize_space_label(public.students.college_name)
    )
  );

-- ---------------------------------------------------------------------------
-- profiles: same guard on admin-wide SELECT (if present on project)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins view all profiles" ON public.profiles;
CREATE POLICY "Admins view all profiles"
  ON public.profiles
  FOR SELECT
  USING (
    NOT public.auth_is_referral_partner_scoped_only(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "College admins view profiles of their college students" ON public.profiles;
CREATE POLICY "College admins view profiles of their college students"
  ON public.profiles
  FOR SELECT
  USING (
    NOT public.auth_is_referral_partner_scoped_only(auth.uid())
    AND public.has_role(auth.uid(), 'college_admin'::public.app_role)
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

DROP POLICY IF EXISTS "Admins delete students" ON public.students;
CREATE POLICY "Admins delete students"
  ON public.students
  FOR DELETE
  USING (
    NOT public.auth_is_referral_partner_scoped_only(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );
