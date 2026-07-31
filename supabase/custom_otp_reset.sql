-- Lovable Cloud / Supabase: run this ENTIRE script in the project's SQL editor once.
--
-- Root cause of "gen_salt(unknown) does not exist" + RPC 404:
-- pgcrypto installs crypt/gen_salt into schema "extensions" on hosted Supabase.
-- Our function used search_path = public, auth only → gen_salt invisible → CREATE FUNCTION or
-- runtime fails → reset_user_password never registers → PostgREST returns 404.
--
-- Fix: include "extensions" in search_path and cast literals to text.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. Create a table to store custom OTPs
CREATE TABLE IF NOT EXISTS public.password_resets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  otp TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + interval '15 minutes'
);

-- Enable RLS
ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;

-- Remove restrictive policy from hotfix_forgot_password_otp.sql if present (blocks browser OTP insert).
DROP POLICY IF EXISTS "Service role manages password resets" ON public.password_resets;

-- Policy: Allow anyone to insert (so the app can generate OTPs from the anon browser client)
DROP POLICY IF EXISTS "Anyone can request password reset" ON public.password_resets;
CREATE POLICY "Anyone can request password reset" ON public.password_resets FOR INSERT WITH CHECK (true);

-- Policy: No one can select/update/delete directly (only the RPC can check)
DROP POLICY IF EXISTS "Public cannot view OTPs" ON public.password_resets;
CREATE POLICY "Public cannot view OTPs" ON public.password_resets FOR SELECT USING (false);

-- 2. Reset password (email or phone via resolve_login_email). Directory copy in metadata.password only.
CREATE OR REPLACE FUNCTION public.reset_user_password(p_identifier text, p_otp text, p_new_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_email text;
  v_otp text := trim(p_otp);
  v_pass text := trim(p_new_password);
BEGIN
  v_email := public.resolve_login_email(p_identifier);
  IF v_email IS NULL OR v_otp = '' OR v_pass IS NULL OR length(v_pass) < 6 THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.password_resets
    WHERE lower(trim(email)) = v_email
      AND trim(otp) = v_otp
      AND expires_at > now()
  ) THEN
    RETURN FALSE;
  END IF;

  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(trim(email)) = v_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE auth.users
  SET
    encrypted_password = extensions.crypt(v_pass::text, extensions.gen_salt('bf'::text)),
    updated_at = now()
  WHERE id = v_user_id;

  UPDATE public.students
  SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('password', v_pass)
  WHERE id = v_user_id;

  DELETE FROM public.password_resets WHERE lower(trim(email)) = v_email;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_user_password(text, text, text) TO anon, authenticated;

-- Required for Lovable/managed Supabase + Vercel SMTP-only (no service_role on hosting).
GRANT INSERT ON TABLE public.password_resets TO anon, authenticated;
