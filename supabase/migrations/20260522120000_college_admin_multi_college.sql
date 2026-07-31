-- College admins: multiple colleges per user; RPCs accept college id arrays.

ALTER TABLE public.college_admin_assignments
  DROP CONSTRAINT IF EXISTS college_admin_assignments_pkey;

ALTER TABLE public.college_admin_assignments
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

UPDATE public.college_admin_assignments
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE public.college_admin_assignments
  ALTER COLUMN id SET NOT NULL,
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.college_admin_assignments
  ADD CONSTRAINT college_admin_assignments_pkey PRIMARY KEY (id);

ALTER TABLE public.college_admin_assignments
  DROP CONSTRAINT IF EXISTS college_admin_assignments_user_college_key;

ALTER TABLE public.college_admin_assignments
  ADD CONSTRAINT college_admin_assignments_user_college_key UNIQUE (user_id, college_id);

CREATE INDEX IF NOT EXISTS idx_college_admin_assignments_user
  ON public.college_admin_assignments (user_id);

COMMENT ON TABLE public.college_admin_assignments IS
  'College portal scope: one row per (user, college). college_admin_code is the shared sign-in secret.';

-- Replace single-college finalize with multi-college version.
DROP FUNCTION IF EXISTS public.finalize_college_admin_creation(uuid, text, text, uuid, text);

CREATE OR REPLACE FUNCTION public.finalize_college_admin_creation(
  target_user_id uuid,
  staff_email text,
  staff_full_name text,
  p_college_ids uuid[],
  p_college_admin_code text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_ok boolean := EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  );
  v_code text := trim(p_college_admin_code);
BEGIN
  IF NOT v_caller_ok THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'target_user_id is required' USING ERRCODE = '22023';
  END IF;

  IF p_college_ids IS NULL OR cardinality(p_college_ids) < 1 THEN
    RAISE EXCEPTION 'At least one college is required' USING ERRCODE = '22023';
  END IF;

  IF v_code IS NULL OR length(v_code) < 6 THEN
    RAISE EXCEPTION 'College admin code must be at least 6 characters' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_college_ids) AS cid
    WHERE NOT EXISTS (SELECT 1 FROM public.colleges c WHERE c.id = cid)
  ) THEN
    RAISE EXCEPTION 'One or more college ids are invalid' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = target_user_id
    AND role IN (
      'student'::public.app_role,
      'admin'::public.app_role,
      'staff'::public.app_role,
      'college_admin'::public.app_role
    );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'college_admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  DELETE FROM public.college_admin_assignments WHERE user_id = target_user_id;

  INSERT INTO public.college_admin_assignments (user_id, college_id, college_admin_code)
  SELECT target_user_id, cid, v_code
  FROM unnest(p_college_ids) AS cid;

  BEGIN
    UPDATE public.profiles
    SET
      full_name = COALESCE(NULLIF(trim(staff_full_name), ''), full_name),
      email = lower(trim(staff_email))
    WHERE id = target_user_id;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN json_build_object('ok', true, 'role', 'college_admin', 'college_count', cardinality(p_college_ids));
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_college_admin_creation(uuid, text, text, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_college_admin_creation(uuid, text, text, uuid[], text) TO authenticated;

-- Edit assignments / profile without re-signup.
CREATE OR REPLACE FUNCTION public.update_college_admin_assignments(
  target_user_id uuid,
  staff_email text,
  staff_full_name text,
  p_college_ids uuid[],
  p_college_admin_code text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_ok boolean := EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  );
  v_code text;
  v_existing text;
BEGIN
  IF NOT v_caller_ok THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'target_user_id is required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = target_user_id
      AND ur.role = 'college_admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'User is not a college administrator' USING ERRCODE = '22023';
  END IF;

  IF p_college_ids IS NULL OR cardinality(p_college_ids) < 1 THEN
    RAISE EXCEPTION 'At least one college is required' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_college_ids) AS cid
    WHERE NOT EXISTS (SELECT 1 FROM public.colleges c WHERE c.id = cid)
  ) THEN
    RAISE EXCEPTION 'One or more college ids are invalid' USING ERRCODE = '22023';
  END IF;

  SELECT caa.college_admin_code INTO v_existing
  FROM public.college_admin_assignments caa
  WHERE caa.user_id = target_user_id
  ORDER BY caa.created_at ASC
  LIMIT 1;

  v_code := COALESCE(NULLIF(trim(p_college_admin_code), ''), v_existing);
  IF v_code IS NULL OR length(v_code) < 6 THEN
    RAISE EXCEPTION 'College admin code must be at least 6 characters' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.college_admin_assignments WHERE user_id = target_user_id;

  INSERT INTO public.college_admin_assignments (user_id, college_id, college_admin_code)
  SELECT target_user_id, cid, v_code
  FROM unnest(p_college_ids) AS cid;

  BEGIN
    UPDATE public.profiles
    SET
      full_name = COALESCE(NULLIF(trim(staff_full_name), ''), full_name),
      email = lower(trim(staff_email))
    WHERE id = target_user_id;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN json_build_object('ok', true, 'college_count', cardinality(p_college_ids));
END;
$$;

REVOKE ALL ON FUNCTION public.update_college_admin_assignments(uuid, text, text, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_college_admin_assignments(uuid, text, text, uuid[], text) TO authenticated;
