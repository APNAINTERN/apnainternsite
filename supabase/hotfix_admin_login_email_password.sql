-- Run once in Supabase SQL Editor: primary admin login = ezyintern.in@gmail.com
-- with the new password. Safe when that email already exists as a separate auth user.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
DECLARE
  v_old_emails text[] := ARRAY[
    'admin@ezyintern.in',
    'admin@ezyintern.com',
    'superadmin@ezyintern.com',
    'admin@exyintern.com'
  ];
  v_new_email text := 'ezyintern.in@gmail.com';
  v_new_password text := 'Galaxy@92#Tiger$2026@EzyIntern';
  v_target_id uuid;
  v_old_admin_id uuid;
BEGIN
  -- Prefer the account that already owns the Gmail inbox.
  SELECT u.id INTO v_target_id
  FROM auth.users u
  WHERE lower(trim(u.email)) = lower(trim(v_new_email))
  LIMIT 1;

  -- Legacy admin account (old inbox emails or any super_admin not on Gmail).
  SELECT u.id INTO v_old_admin_id
  FROM auth.users u
  WHERE lower(trim(u.email)) = ANY (
    SELECT lower(trim(e)) FROM unnest(v_old_emails) AS e
  )
  LIMIT 1;

  IF v_old_admin_id IS NULL THEN
    SELECT ur.user_id INTO v_old_admin_id
    FROM public.user_roles ur
    WHERE ur.role = 'super_admin'
      AND ur.user_id IS DISTINCT FROM v_target_id
    ORDER BY ur.created_at
    LIMIT 1;
  END IF;

  IF v_target_id IS NULL AND v_old_admin_id IS NULL THEN
    RAISE EXCEPTION 'No admin auth user found. Create super_admin in auth.users first.';
  END IF;

  IF v_target_id IS NULL THEN
    -- Gmail not taken yet: rename the legacy admin account.
    v_target_id := v_old_admin_id;

    UPDATE auth.users
    SET
      email = v_new_email,
      encrypted_password = extensions.crypt(v_new_password::text, extensions.gen_salt('bf'::text)),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
    WHERE id = v_target_id;

    RAISE NOTICE 'Renamed legacy admin to % (user_id=%)', v_new_email, v_target_id;
  ELSE
    -- Gmail account already exists: set password on that user (do not rename).
    UPDATE auth.users
    SET
      encrypted_password = extensions.crypt(v_new_password::text, extensions.gen_salt('bf'::text)),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
    WHERE id = v_target_id;

    RAISE NOTICE 'Updated password for existing % (user_id=%)', v_new_email, v_target_id;

    IF v_old_admin_id IS NOT NULL AND v_old_admin_id <> v_target_id THEN
      INSERT INTO public.user_roles (user_id, role)
      SELECT v_target_id, ur.role
      FROM public.user_roles ur
      WHERE ur.user_id = v_old_admin_id
        AND ur.role IN ('super_admin'::public.app_role, 'admin'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;

      DELETE FROM public.user_roles
      WHERE user_id = v_old_admin_id
        AND role IN ('super_admin'::public.app_role, 'admin'::public.app_role);

      RAISE NOTICE 'Moved super_admin/admin role from % to %', v_old_admin_id, v_target_id;
    END IF;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_target_id, 'super_admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.students
  SET
    email = v_new_email,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('password', v_new_password)
  WHERE id = v_target_id;

  IF NOT FOUND THEN
    INSERT INTO public.students (id, email, metadata)
    VALUES (
      v_target_id,
      v_new_email,
      jsonb_build_object('password', v_new_password)
    )
    ON CONFLICT (id) DO UPDATE
    SET
      email = EXCLUDED.email,
      metadata = COALESCE(public.students.metadata, '{}'::jsonb) || EXCLUDED.metadata;
  END IF;

  RAISE NOTICE 'Admin login ready: email=%, user_id=%', v_new_email, v_target_id;
END;
$$;
