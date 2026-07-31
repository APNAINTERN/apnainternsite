-- ==========================================================
-- HOTFIX: Forgot Password via Email OTP
-- Run once in Supabase SQL Editor
-- ==========================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.password_resets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  otp TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '15 minutes')
);

ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages password resets" ON public.password_resets;
CREATE POLICY "Service role manages password resets"
ON public.password_resets
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_password_resets_email_expires
ON public.password_resets (email, expires_at DESC);

CREATE OR REPLACE FUNCTION public.get_user_id_by_email(email_text text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found_id uuid;
BEGIN
  SELECT id INTO found_id
  FROM auth.users
  WHERE lower(email) = lower(email_text)
  LIMIT 1;

  RETURN found_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO authenticated, service_role;

COMMIT;
