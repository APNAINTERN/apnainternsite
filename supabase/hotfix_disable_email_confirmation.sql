-- Disable email verification behaviour for student registration (no confirmation email required).
-- Run once in Supabase SQL Editor.
--
-- ALSO in Dashboard: Authentication → Providers → Email → turn OFF "Confirm email"
-- (both together is best; the trigger below auto-confirms even if a confirm email was queued)

-- 1) Confirm existing accounts that never clicked the link
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
WHERE email_confirmed_at IS NULL;

-- 2) Auto-confirm every new signup (students can log in immediately after registration)
CREATE OR REPLACE FUNCTION public.auto_confirm_auth_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_auto_confirm_email ON auth.users;
CREATE TRIGGER on_auth_user_auto_confirm_email
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_auth_email();
