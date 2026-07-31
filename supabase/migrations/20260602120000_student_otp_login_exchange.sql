-- Student OTP login without Vercel service role: verify OTP, sync auth password, return credentials for signInWithPassword.

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
      AND pr.expires_at > now()
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
      AND po.status = 'success'
      AND NULLIF(trim(po.metadata->>'password'), '') IS NOT NULL
    ORDER BY po.updated_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_plain IS NULL OR length(v_plain) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_password_on_file');
  END IF;

  DELETE FROM public.password_resets WHERE lower(trim(email)) = v_email;

  PERFORM public._set_auth_user_password_internal(v_uid, v_email, v_plain);
  PERFORM public.ensure_auth_email_identity(v_uid, v_email);

  RETURN jsonb_build_object('ok', true, 'email', v_email, 'password', v_plain);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'internal');
END;
$$;

REVOKE ALL ON FUNCTION public.student_exchange_login_otp(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_exchange_login_otp(text, text) TO anon, authenticated;
