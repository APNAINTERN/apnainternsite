-- Let students choose simple passwords (e.g. 12345) at registration without Supabase Auth strength API.
-- Browser signUp uses a temporary strong password; this RPC sets the real password in auth.users.

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
DECLARE
  v_plain text := trim(p_plain);
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id required';
  END IF;
  IF v_plain IS NULL OR length(v_plain) < 5 THEN
    RAISE EXCEPTION 'Password must be at least 5 characters';
  END IF;

  PERFORM public.assert_can_write_student_directory(p_user_id, p_email);

  PERFORM public.assert_can_write_student_directory(p_user_id, p_email);

  UPDATE auth.users
  SET
    encrypted_password = extensions.crypt(v_plain::text, extensions.gen_salt('bf'::text)),
    updated_at = now()
  WHERE id = p_user_id;

  UPDATE public.students
  SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('password', v_plain)
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_student_registration_password(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_student_registration_password(uuid, text, text) TO anon, authenticated;
