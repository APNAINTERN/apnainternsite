-- Run once in Lovable Cloud → SQL editor (Supabase production).
-- Grants super_admin for apnaintern.in@gmail.com (admin portal login).
-- Safe to re-run.

BEGIN;

DO $$
DECLARE
  v_email CONSTANT TEXT := 'apnaintern.in@gmail.com';
  v_password CONSTANT TEXT := 'Shiva@2028#77';
  v_name CONSTANT TEXT := 'Apna Intern Admin';
  v_uid UUID;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(trim(email)) = lower(v_email);

  IF v_uid IS NULL THEN
    v_uid := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, is_sso_user, is_anonymous
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_uid, 'authenticated', 'authenticated', v_email,
      extensions.crypt(v_password::text, extensions.gen_salt('bf'::text)),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_name, 'role', 'super_admin', 'is_staff', true),
      NOW(), NOW(), false, false
    );
  ELSE
    UPDATE auth.users
    SET
      encrypted_password = extensions.crypt(v_password::text, extensions.gen_salt('bf'::text)),
      email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('full_name', v_name, 'role', 'super_admin', 'is_staff', true),
      updated_at = NOW()
    WHERE id = v_uid;
  END IF;

  INSERT INTO auth.identities (
    id, provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_uid::text, v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
    'email', NOW(), NOW(), NOW()
  )
  ON CONFLICT (provider_id, provider) DO NOTHING;

  INSERT INTO public.profiles (id, full_name, email, contact_number, gender, parent_name)
  VALUES (v_uid, v_name, v_email, '', '', '')
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email;

  DELETE FROM public.user_roles
  WHERE user_id = v_uid AND role = 'student'::public.app_role;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'super_admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.admin_permissions (
    user_id,
    can_manage_students, can_manage_classes, can_manage_certificates,
    can_manage_institutions, can_view_payments, can_manage_leads,
    can_manage_notifications, can_manage_assignments, can_manage_communications
  ) VALUES (
    v_uid, true, true, true, true, true, true, true, true, true
  )
  ON CONFLICT (user_id) DO UPDATE SET
    can_manage_students = true,
    can_manage_classes = true,
    can_manage_certificates = true,
    can_manage_institutions = true,
    can_view_payments = true,
    can_manage_leads = true,
    can_manage_notifications = true,
    can_manage_assignments = true,
    can_manage_communications = true;

  INSERT INTO public.admin_staff (id, email, full_name, role_tag, permissions)
  VALUES (v_uid, v_email, v_name, 'super_admin', '{"all": true}'::jsonb)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role_tag = EXCLUDED.role_tag;

  RAISE NOTICE 'Super admin ready: % (id=%)', v_email, v_uid;
END $$;

COMMIT;

-- Verify:
-- SELECT public.account_is_student_only('apnaintern.in@gmail.com');  -- should be false
-- SELECT public.account_requires_admin_login('apnaintern.in@gmail.com');  -- should be true
