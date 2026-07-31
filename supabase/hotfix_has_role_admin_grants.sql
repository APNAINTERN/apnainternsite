-- Run in Supabase SQL Editor if admin panel loops / logs out with:
--   permission denied for function has_role (code 42501)
-- Safe to re-run.

-- ─── has_role must be executable by logged-in users (RLS policies call it) ───
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role = _role
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO service_role;

-- ─── user_roles: users always read own row (no has_role in this policy) ─────
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;
CREATE POLICY "Users view own roles" ON public.user_roles
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all roles" ON public.user_roles;
CREATE POLICY "Admins view all roles" ON public.user_roles
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.has_role(auth.uid(), 'staff'::public.app_role)
);

GRANT SELECT ON public.user_roles TO authenticated;

-- ─── payment_success (admin dashboard) ─────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_success TO authenticated;

DROP POLICY IF EXISTS "Staff all payment success" ON public.payment_success;
CREATE POLICY "Staff all payment success" ON public.payment_success
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

DROP POLICY IF EXISTS "Users view own payment success" ON public.payment_success;
CREATE POLICY "Users view own payment success" ON public.payment_success
FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR lower(trim(email)) = lower(trim(COALESCE(auth.jwt() ->> 'email', '')))
);
