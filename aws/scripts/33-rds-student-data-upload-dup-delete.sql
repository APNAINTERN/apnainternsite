-- Student Data Upload: allow duplicate email/phone (reg unique only),
-- tag imports with upload_id, and delete an entire uploaded sheet at once.
-- Does not change public registration / Add Registration uniqueness checks.

ALTER TABLE public.student_data_uploads
  ADD COLUMN IF NOT EXISTS imported_user_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Drop prior overload so we can add p_upload_id.
DROP FUNCTION IF EXISTS public.admin_student_data_upload_import(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean
);
DROP FUNCTION IF EXISTS public.admin_student_data_upload_import(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, uuid
);

CREATE OR REPLACE FUNCTION public.admin_student_data_upload_import(
  p_email text,
  p_password text,
  p_phone text,
  p_full_name text DEFAULT NULL,
  p_gender text DEFAULT NULL,
  p_parent_name text DEFAULT NULL,
  p_university_name text DEFAULT NULL,
  p_college_name text DEFAULT NULL,
  p_degree text DEFAULT NULL,
  p_department text DEFAULT NULL,
  p_subject text DEFAULT NULL,
  p_session text DEFAULT NULL,
  p_semester text DEFAULT NULL,
  p_registration_number text DEFAULT NULL,
  p_roll_number text DEFAULT NULL,
  p_internship_domain text DEFAULT NULL,
  p_mode text DEFAULT NULL,
  p_paid boolean DEFAULT true,
  p_upload_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, auth
AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_password text := trim(p_password);
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  v_name text := coalesce(nullif(trim(p_full_name), ''), 'Student');
  v_gender text := coalesce(nullif(trim(p_gender), ''), 'Other');
  v_parent text := nullif(trim(coalesce(p_parent_name, '')), '');
  v_uni text := nullif(trim(coalesce(p_university_name, '')), '');
  v_college text := nullif(trim(coalesce(p_college_name, '')), '');
  v_degree text := nullif(trim(coalesce(p_degree, '')), '');
  v_dept text := nullif(trim(coalesce(p_department, '')), '');
  v_subject text := nullif(trim(coalesce(p_subject, '')), '');
  v_session text := nullif(trim(coalesce(p_session, '')), '');
  v_semester text := nullif(trim(coalesce(p_semester, '')), '');
  v_reg text := nullif(trim(coalesce(p_registration_number, '')), '');
  v_roll text := nullif(trim(coalesce(p_roll_number, '')), '');
  v_domain text := nullif(trim(coalesce(p_internship_domain, '')), '');
  v_mode text := nullif(trim(coalesce(p_mode, '')), '');
  v_uid uuid;
  v_auth_email text;
  v_email_taken boolean := false;
  v_pay_id text;
  v_meta jsonb;
  v_meta_text text;
  v_reg_slug text;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Access denied: admin or super_admin only' USING ERRCODE = '42501';
  END IF;

  IF v_email IS NULL OR v_email = '' OR v_email NOT LIKE '%@%' THEN
    RAISE EXCEPTION 'Valid email required';
  END IF;
  IF v_password IS NULL OR length(v_password) < 5 THEN
    RAISE EXCEPTION 'Password must be at least 5 characters';
  END IF;
  IF v_phone IS NULL OR length(v_phone) < 10 THEN
    RAISE EXCEPTION 'Valid contact number required';
  END IF;
  v_phone := right(v_phone, 10);

  IF v_reg IS NULL THEN
    RAISE EXCEPTION 'Registration Number is required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.students s
    WHERE lower(trim(coalesce(s.registration_id, ''))) = lower(v_reg)
  ) THEN
    RAISE EXCEPTION 'Duplicate Registration Number';
  END IF;

  -- Email/phone duplicates are allowed for Student Data Upload only.
  -- auth.users.email is still unique, so reuse sheet email when free;
  -- otherwise use a synthetic unique auth login email. students.email keeps the sheet value.
  SELECT EXISTS (
    SELECT 1 FROM auth.users u WHERE lower(trim(u.email)) = v_email
  ) INTO v_email_taken;

  v_uid := gen_random_uuid();
  IF v_email_taken THEN
    v_reg_slug := lower(regexp_replace(v_reg, '[^a-zA-Z0-9]+', '', 'g'));
    IF v_reg_slug IS NULL OR v_reg_slug = '' THEN
      v_reg_slug := replace(v_uid::text, '-', '');
    END IF;
    v_auth_email := 'sdu.' || left(v_reg_slug, 40) || '.' || left(replace(v_uid::text, '-', ''), 8)
      || '@studentdata.ezyintern.local';
  ELSE
    v_auth_email := v_email;
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_uid, 'authenticated', 'authenticated', v_auth_email,
    extensions.crypt(v_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', v_name),
    now(), now(), '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_uid::text, v_uid,
    jsonb_build_object(
      'sub', v_uid::text,
      'email', v_auth_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email', now(), now(), now()
  );

  v_meta := jsonb_build_object(
    'password', v_password,
    'source', 'admin_student_data_upload',
    'created_by', auth.uid()::text,
    'payment_required', (NOT p_paid),
    'bulk_upload_paid', p_paid,
    'department', v_dept,
    'subject', v_subject,
    'internship_mode', v_mode,
    'sheet_email', v_email,
    'auth_email', v_auth_email
  );
  IF p_upload_id IS NOT NULL THEN
    v_meta := v_meta || jsonb_build_object('upload_id', p_upload_id::text);
  END IF;
  IF p_paid THEN
    v_pay_id := 'pay_admin_data_upload_' || replace(gen_random_uuid()::text, '-', '');
    v_meta := v_meta || jsonb_build_object('razorpay_payment_id', v_pay_id);
  END IF;
  v_meta_text := v_meta::text;

  INSERT INTO public.students (
    id, email, full_name, gender, parent_name, contact_number,
    university_name, college_name, course, degree, department,
    class_semester, academic_session, roll_number, internship_domain,
    status, registration_id, metadata
  ) VALUES (
    v_uid::text, v_email, v_name, v_gender, v_parent, v_phone,
    coalesce(v_uni, ''), coalesce(v_college, ''),
    coalesce(v_domain, 'Internship'),
    coalesce(v_degree, ''),
    coalesce(v_dept, ''),
    coalesce(v_semester, ''),
    coalesce(v_session, ''),
    coalesce(v_roll, ''),
    coalesce(v_domain, coalesce(v_degree, 'Internship')),
    'Active',
    v_reg,
    v_meta_text
  );

  INSERT INTO public.profiles (id, full_name, email, contact_number)
  VALUES (v_uid, v_name, v_email, v_phone)
  ON CONFLICT (id) DO UPDATE SET
    full_name = excluded.full_name,
    email = excluded.email,
    contact_number = excluded.contact_number;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'student'::public.app_role)
  ON CONFLICT DO NOTHING;

  IF p_paid THEN
    PERFORM public.ensure_payment_success_log(jsonb_build_object(
      'user_id', v_uid::text,
      'payment_id', v_pay_id,
      'amount_paise', 50000,
      'email', v_email,
      'full_name', v_name,
      'status', 'success'
    ));
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', v_uid::text,
    'email', v_email,
    'auth_email', v_auth_email,
    'registration_id', v_reg,
    'paid', p_paid,
    'upload_id', p_upload_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_student_data_upload_import(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_student_data_upload_import(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, uuid
) TO authenticated;

-- Delete one uploaded sheet: students from that batch + history row + auth accounts.
CREATE OR REPLACE FUNCTION public.admin_student_data_upload_delete_batch(p_upload_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, auth
AS $$
DECLARE
  v_ids text[] := ARRAY[]::text[];
  v_from_history jsonb;
  v_id text;
  v_uuid uuid;
  v_deleted int := 0;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Access denied: admin or super_admin only' USING ERRCODE = '42501';
  END IF;

  IF p_upload_id IS NULL THEN
    RAISE EXCEPTION 'upload_id is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.student_data_uploads WHERE id = p_upload_id) THEN
    RAISE EXCEPTION 'Upload sheet not found';
  END IF;

  SELECT imported_user_ids INTO v_from_history
  FROM public.student_data_uploads
  WHERE id = p_upload_id;

  IF v_from_history IS NOT NULL AND jsonb_typeof(v_from_history) = 'array' THEN
    SELECT coalesce(array_agg(x), ARRAY[]::text[])
    INTO v_ids
    FROM (
      SELECT DISTINCT trim(value #>> '{}') AS x
      FROM jsonb_array_elements(v_from_history)
      WHERE trim(coalesce(value #>> '{}', '')) <> ''
    ) t;
  END IF;

  -- Also pick up students tagged with this upload_id in metadata.
  SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::text[])
  INTO v_ids
  FROM (
    SELECT unnest(coalesce(v_ids, ARRAY[]::text[])) AS x
    UNION
    SELECT s.id
    FROM public.students s
    WHERE public.safe_text_to_jsonb(s.metadata)->>'source' = 'admin_student_data_upload'
      AND public.safe_text_to_jsonb(s.metadata)->>'upload_id' = p_upload_id::text
  ) merged;

  FOREACH v_id IN ARRAY coalesce(v_ids, ARRAY[]::text[])
  LOOP
    BEGIN
      v_uuid := NULLIF(trim(v_id), '')::uuid;
    EXCEPTION WHEN others THEN
      v_uuid := NULL;
    END;

    DELETE FROM public.user_roles WHERE user_id::text = v_id;
    DELETE FROM public.profiles WHERE id::text = v_id;
    DELETE FROM public.students WHERE id = v_id;
    IF v_uuid IS NOT NULL THEN
      DELETE FROM auth.identities WHERE user_id = v_uuid;
      DELETE FROM auth.users WHERE id = v_uuid;
    END IF;
    v_deleted := v_deleted + 1;
  END LOOP;

  DELETE FROM public.student_data_uploads WHERE id = p_upload_id;

  RETURN jsonb_build_object(
    'ok', true,
    'upload_id', p_upload_id,
    'deleted_students', v_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_student_data_upload_delete_batch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_student_data_upload_delete_batch(uuid) TO authenticated;

-- Registration/roll login must resolve the matched student row's auth email
-- (not any other student sharing the same sheet email).
CREATE OR REPLACE FUNCTION public.resolve_login_email(p_identifier text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_raw text := trim(COALESCE(p_identifier, ''));
  v_email text;
  v_digits text;
  v_tail text;
  v_emails text[];
  v_auth_email text;
  v_student_id text;
BEGIN
  IF v_raw = '' THEN
    RETURN NULL;
  END IF;

  IF position('@' in v_raw) > 0 THEN
    v_email := lower(v_raw);

    SELECT lower(trim(u.email))
    INTO v_auth_email
    FROM auth.users u
    WHERE lower(trim(u.email)) = v_email
    ORDER BY u.created_at DESC
    LIMIT 1;
    IF v_auth_email IS NOT NULL THEN
      RETURN v_auth_email;
    END IF;

    SELECT array_agg(DISTINCT NULLIF(trim(s.id), '') ORDER BY NULLIF(trim(s.id), ''))
    INTO v_emails
    FROM public.students s
    WHERE lower(trim(s.email)) = v_email
      AND NULLIF(trim(s.id), '') IS NOT NULL;

    IF v_emails IS NOT NULL AND array_length(v_emails, 1) > 1 THEN
      RAISE EXCEPTION 'Multiple accounts use this email. Please sign in with your registration number instead.'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_emails IS NOT NULL AND array_length(v_emails, 1) = 1 THEN
      SELECT lower(trim(u.email))
      INTO v_auth_email
      FROM auth.users u
      WHERE u.id::text = v_emails[1]
      LIMIT 1;
      RETURN coalesce(v_auth_email, v_email);
    END IF;

    RETURN v_email;
  END IF;

  SELECT s.id
  INTO v_student_id
  FROM public.students s
  WHERE (
    lower(trim(coalesce(s.registration_id, ''))) = lower(v_raw)
    OR trim(coalesce(s.roll_number, '')) = v_raw
    OR lower(trim(coalesce(
         public.safe_text_to_jsonb(s.metadata)->>'registration_id', ''
       ))) = lower(v_raw)
    OR trim(coalesce(
         public.safe_text_to_jsonb(s.metadata)->>'roll_number', ''
       )) = v_raw
    OR trim(coalesce(
         public.safe_text_to_jsonb(s.metadata)->>'rollNo', ''
       )) = v_raw
  )
  ORDER BY s.created_at DESC NULLS LAST
  LIMIT 2;

  IF FOUND THEN
    -- Detect ambiguity: second match?
    IF (
      SELECT count(*)::int
      FROM public.students s
      WHERE (
        lower(trim(coalesce(s.registration_id, ''))) = lower(v_raw)
        OR trim(coalesce(s.roll_number, '')) = v_raw
        OR lower(trim(coalesce(
             public.safe_text_to_jsonb(s.metadata)->>'registration_id', ''
           ))) = lower(v_raw)
        OR trim(coalesce(
             public.safe_text_to_jsonb(s.metadata)->>'roll_number', ''
           )) = v_raw
        OR trim(coalesce(
             public.safe_text_to_jsonb(s.metadata)->>'rollNo', ''
           )) = v_raw
      )
    ) > 1 THEN
      RAISE EXCEPTION 'Multiple accounts match this registration or roll number. Contact support.'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT lower(trim(u.email))
    INTO v_auth_email
    FROM auth.users u
    WHERE u.id::text = NULLIF(trim(v_student_id), '')
    LIMIT 1;

    IF v_auth_email IS NOT NULL THEN
      RETURN v_auth_email;
    END IF;

    SELECT lower(trim(s.email))
    INTO v_auth_email
    FROM public.students s
    WHERE s.id = v_student_id
    LIMIT 1;
    RETURN v_auth_email;
  END IF;

  v_digits := regexp_replace(v_raw, '\D', '', 'g');
  IF length(v_digits) = 10
     OR (length(v_digits) = 11 AND left(v_digits, 1) = '0')
     OR (length(v_digits) = 12 AND left(v_digits, 2) = '91') THEN
    v_tail := public.normalize_phone_tail(v_raw);
    IF v_tail IS NOT NULL THEN
      SELECT array_agg(DISTINCT e ORDER BY e)
      INTO v_emails
      FROM (
        SELECT lower(trim(s.email)) AS e
        FROM public.students s
        WHERE s.email IS NOT NULL
          AND trim(s.email) <> ''
          AND public.normalize_phone_tail(s.contact_number) = v_tail
        UNION
        SELECT lower(trim(p.email)) AS e
        FROM public.profiles p
        WHERE p.email IS NOT NULL
          AND trim(p.email) <> ''
          AND public.normalize_phone_tail(p.contact_number) = v_tail
      ) phone_matches;

      IF v_emails IS NULL OR array_length(v_emails, 1) IS NULL THEN
        RETURN NULL;
      END IF;

      IF array_length(v_emails, 1) > 1 THEN
        RAISE EXCEPTION 'Multiple accounts are linked to this phone number. Please sign in with your email or registration number instead.'
          USING ERRCODE = 'P0001';
      END IF;

      SELECT lower(trim(u.email))
      INTO v_auth_email
      FROM public.students s
      JOIN auth.users u ON u.id::text = NULLIF(trim(s.id), '')
      WHERE lower(trim(s.email)) = v_emails[1]
      ORDER BY s.created_at DESC NULLS LAST
      LIMIT 1;
      RETURN coalesce(v_auth_email, v_emails[1]);
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_login_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO anon, authenticated;
