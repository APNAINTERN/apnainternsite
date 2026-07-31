-- Fix post-payment password apply on RDS (2026-07-22).
-- _set_auth_user_password_internal compared students.id (text) to uuid and
-- treated metadata as jsonb → "operator does not exist: text = uuid".
-- That error was also mislabeled as "password setup is missing" by the API adapter.

BEGIN;

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
  v_meta jsonb;
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

  -- students.id and metadata are text on RDS (CSV import); never compare uuid to text.
  BEGIN
    SELECT public.safe_text_to_jsonb(s.metadata::text)
    INTO v_meta
    FROM public.students s
    WHERE s.id = p_user_id::text
    LIMIT 1;

    IF FOUND THEN
      UPDATE public.students
      SET metadata = (COALESCE(v_meta, '{}'::jsonb) || jsonb_build_object('password', v_plain))::text
      WHERE id = p_user_id::text;
    END IF;
  EXCEPTION WHEN others THEN
    -- Auth password is already set; directory copy is best-effort.
    NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_student_registration_password(
  p_user_id uuid,
  p_email text,
  p_plain text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, auth
AS $$
BEGIN
  PERFORM public.assert_can_write_student_directory(p_user_id, p_email);
  PERFORM public._set_auth_user_password_internal(p_user_id, p_email, p_plain);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.repair_student_auth_login(
  p_email text,
  p_plain text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, auth
AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_plain text := trim(p_plain);
  v_uid uuid;
  v_meta_pw text;
BEGIN
  IF v_email = '' OR v_plain = '' OR length(v_plain) < 5 THEN
    RETURN FALSE;
  END IF;

  SELECT u.id INTO v_uid
  FROM auth.users u
  WHERE lower(trim(u.email)) = v_email;

  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT NULLIF(trim(public.safe_text_to_jsonb(s.metadata::text)->>'password'), '')
  INTO v_meta_pw
  FROM public.students s
  WHERE lower(trim(s.email)) = v_email
    AND NULLIF(trim(public.safe_text_to_jsonb(s.metadata::text)->>'password'), '') = v_plain
  ORDER BY (s.id = v_uid::text) DESC, s.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_meta_pw IS NULL THEN
    SELECT NULLIF(trim(po.metadata->>'password'), '')
    INTO v_meta_pw
    FROM public.payment_orders po
    WHERE lower(trim(COALESCE(po.user_email, po.metadata->>'email', ''))) = v_email
      AND po.status = 'success'
      AND NULLIF(trim(po.metadata->>'password'), '') = v_plain
    ORDER BY po.updated_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_meta_pw IS NULL OR v_meta_pw <> v_plain THEN
    RETURN FALSE;
  END IF;

  PERFORM public._set_auth_user_password_internal(v_uid, v_email, v_plain);
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public._set_auth_user_password_internal(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_student_registration_password(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repair_student_auth_login(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.apply_student_registration_password(uuid, text, text)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.repair_student_auth_login(text, text)
  TO anon, authenticated, service_role;

COMMIT;
