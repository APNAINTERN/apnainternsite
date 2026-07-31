-- OTP student login — run this ENTIRE file once in Supabase SQL Editor (Lovable Cloud).
-- Safe to re-run (CREATE OR REPLACE). After run, wait ~30s or reload API schema.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ─── Auth helpers (required by student_exchange_login_otp) ─────────────────
CREATE OR REPLACE FUNCTION public.ensure_auth_email_identity(p_user_id uuid, p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, auth
AS $$
DECLARE
  v_email text := lower(trim(p_email));
BEGIN
  IF p_user_id IS NULL OR v_email = '' THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.identities i
    WHERE i.user_id = p_user_id AND i.provider = 'email'
  ) THEN
    BEGIN
      INSERT INTO auth.identities (
        id, provider_id, user_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      )
      VALUES (
        gen_random_uuid(),
        p_user_id::text,
        p_user_id,
        jsonb_build_object(
          'sub', p_user_id::text,
          'email', v_email,
          'email_verified', true,
          'phone_verified', false
        ),
        'email',
        now(),
        now(),
        now()
      );
    EXCEPTION
      WHEN unique_violation THEN
        NULL;
    END;
  END IF;

  UPDATE auth.users
  SET
    raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._set_auth_user_password_internal(
  p_user_id uuid,
  p_email text,
  p_plain text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, auth
AS $$
DECLARE
  v_plain text := trim(p_plain);
  v_email text := lower(trim(p_email));
BEGIN
  IF p_user_id IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'User id and email required';
  END IF;
  IF v_plain IS NULL OR length(v_plain) < 5 THEN
    RAISE EXCEPTION 'Password must be at least 5 characters';
  END IF;

  UPDATE auth.users
  SET
    encrypted_password = extensions.crypt(v_plain::text, extensions.gen_salt('bf'::text)),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
  WHERE id = p_user_id;

  PERFORM public.ensure_auth_email_identity(p_user_id, v_email);

  UPDATE public.students
  SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('password', v_plain)
  WHERE id = p_user_id;
END;
$$;

-- ─── OTP storage (browser inserts; RPC verifies) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.password_resets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  otp TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + interval '15 minutes'
);

ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages password resets" ON public.password_resets;
DROP POLICY IF EXISTS "Anyone can request password reset" ON public.password_resets;
CREATE POLICY "Anyone can request password reset"
  ON public.password_resets FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public cannot view OTPs" ON public.password_resets;
CREATE POLICY "Public cannot view OTPs"
  ON public.password_resets FOR SELECT USING (false);

GRANT INSERT ON TABLE public.password_resets TO anon, authenticated;

-- ─── OTP login exchange (verify code → sync auth password) ─────────────────
CREATE OR REPLACE FUNCTION public.student_exchange_login_otp(p_identifier text, p_otp text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, auth
AS $$
DECLARE
  v_email text;
  v_otp text := trim(p_otp);
  v_uid uuid;
  v_plain text;
BEGIN
  IF position('@' in trim(p_identifier)) > 0 THEN
    v_email := lower(trim(p_identifier));
  ELSIF to_regprocedure('public.resolve_login_email(text)') IS NOT NULL THEN
    v_email := public.resolve_login_email(p_identifier);
  ELSE
    v_email := NULL;
  END IF;

  IF v_email IS NULL OR v_otp = '' OR length(v_otp) <> 6 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(trim(u.email)) = v_email) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_account');
  END IF;

  IF to_regprocedure('public.account_requires_admin_login(text)') IS NOT NULL
     AND public.account_requires_admin_login(v_email) IS TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'admin_portal');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.password_resets pr
    WHERE lower(trim(pr.email)) = v_email
      AND trim(pr.otp) = v_otp
      AND (
        NOT EXISTS (
          SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = 'public' AND c.table_name = 'password_resets' AND c.column_name = 'expires_at'
        )
        OR pr.expires_at > now()
        OR (pr.expires_at IS NULL AND pr.created_at > now() - interval '15 minutes')
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_otp');
  END IF;

  SELECT u.id INTO v_uid
  FROM auth.users u
  WHERE lower(trim(u.email)) = v_email
  LIMIT 1;

  SELECT NULLIF(trim(s.metadata->>'password'), '') INTO v_plain
  FROM public.students s
  WHERE lower(trim(s.email)) = v_email
  ORDER BY (s.id = v_uid) DESC, s.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_plain IS NULL THEN
    SELECT NULLIF(trim(po.metadata->>'password'), '') INTO v_plain
    FROM public.payment_orders po
    WHERE lower(trim(COALESCE(po.user_email, po.metadata->>'email', ''))) = v_email
      AND (
        po.status = 'success'
        OR (po.payment_id IS NOT NULL AND trim(po.payment_id) ~* '^pay_')
      )
      AND NULLIF(trim(po.metadata->>'password'), '') IS NOT NULL
    ORDER BY po.updated_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_plain IS NULL OR length(v_plain) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_password_on_file');
  END IF;

  DELETE FROM public.password_resets WHERE lower(trim(email)) = v_email;

  BEGIN
    PERFORM public._set_auth_user_password_internal(v_uid, v_email, v_plain);
  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object('ok', false, 'error', 'sync_failed', 'detail', left(SQLERRM, 200));
  END;

  RETURN jsonb_build_object('ok', true, 'email', v_email, 'password', v_plain);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'internal', 'detail', left(SQLERRM, 200));
END;
$$;

REVOKE ALL ON FUNCTION public.student_exchange_login_otp(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_exchange_login_otp(text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
