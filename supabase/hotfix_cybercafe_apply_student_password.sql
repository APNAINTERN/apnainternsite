-- Cyber café partners register students while logged in; allow password apply for new auth users.

CREATE OR REPLACE FUNCTION public.assert_can_write_student_directory(p_id uuid, p_email text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_auth_email text;
  v_created timestamptz;
BEGIN
  IF p_id IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Student id and email required';
  END IF;

  IF auth.uid() = p_id THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN (
        'admin'::public.app_role,
        'super_admin'::public.app_role,
        'staff'::public.app_role
      )
  ) THEN
    RETURN;
  END IF;

  -- Cyber café partner completing registration for a student they just created.
  IF EXISTS (SELECT 1 FROM public.cybercafe_profiles cp WHERE cp.id = auth.uid()) THEN
    SELECT lower(trim(u.email)), u.created_at
    INTO v_auth_email, v_created
    FROM auth.users u
    WHERE u.id = p_id;

    IF v_auth_email IS NOT NULL
      AND v_auth_email = v_email
      AND (v_created IS NULL OR v_created >= now() - interval '3 hours') THEN
      RETURN;
    END IF;

    RAISE EXCEPTION 'Access denied';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT lower(trim(u.email)), u.created_at
  INTO v_auth_email, v_created
  FROM auth.users u
  WHERE u.id = p_id;

  IF v_auth_email IS NULL THEN
    RAISE EXCEPTION 'Auth account not found';
  END IF;

  IF v_auth_email <> v_email THEN
    RAISE EXCEPTION 'Email does not match auth account';
  END IF;

  IF v_created IS NULL OR v_created < now() - interval '3 hours' THEN
    RAISE EXCEPTION 'Registration window expired; sign in or contact support';
  END IF;
END;
$$;
