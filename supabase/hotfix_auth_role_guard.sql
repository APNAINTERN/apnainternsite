-- ==========================================================
-- HOTFIX: Auth Role Guard + Missing Student Role Backfill
-- Safe for production. Designed to avoid breaking existing users.
-- ==========================================================

BEGIN;

-- 1) Always assign new auth users as student.
--    Do NOT trust raw_user_meta_data.role from client payload.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 2) Ensure signup trigger exists and points to the safe function.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 3) Backfill: give student role only to users with NO existing roles.
--    This keeps existing admin/super_admin/staff assignments intact.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'student'::public.app_role
FROM auth.users u
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
WHERE ur.user_id IS NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- 4) Harden function execute permissions.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

COMMIT;

-- Verification queries (run manually after execution):
-- SELECT user_id, role, COUNT(*) FROM public.user_roles GROUP BY user_id, role ORDER BY user_id;
-- SELECT COUNT(*) AS users_without_role FROM auth.users u LEFT JOIN public.user_roles ur ON ur.user_id = u.id WHERE ur.user_id IS NULL;
