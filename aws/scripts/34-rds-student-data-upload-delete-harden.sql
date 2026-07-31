-- Harden Student Data Upload sheet delete so imported students are always removed.
-- Also keep payment_success cleanup for paid bulk uploads.

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

  -- Merge history ids + students tagged with this upload_id (metadata JSON text).
  SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::text[])
  INTO v_ids
  FROM (
    SELECT unnest(coalesce(v_ids, ARRAY[]::text[])) AS x
    UNION
    SELECT s.id
    FROM public.students s
    WHERE public.safe_text_to_jsonb(s.metadata)->>'source' = 'admin_student_data_upload'
      AND public.safe_text_to_jsonb(s.metadata)->>'upload_id' = p_upload_id::text
    UNION
    SELECT s.id
    FROM public.students s
    WHERE s.metadata ILIKE ('%' || p_upload_id::text || '%')
      AND s.metadata ILIKE '%admin_student_data_upload%'
  ) merged
  WHERE nullif(trim(x), '') IS NOT NULL;

  FOREACH v_id IN ARRAY coalesce(v_ids, ARRAY[]::text[])
  LOOP
    BEGIN
      v_uuid := NULLIF(trim(v_id), '')::uuid;
    EXCEPTION WHEN others THEN
      v_uuid := NULL;
    END;

    -- Best-effort related cleanup (ignore missing tables / rows).
    BEGIN
      DELETE FROM public.payment_success
      WHERE user_id::text = v_id
         OR (metadata IS NOT NULL AND metadata::text ILIKE ('%' || v_id || '%'));
    EXCEPTION WHEN undefined_table THEN
      NULL;
    WHEN others THEN
      NULL;
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

-- Remove all students created via Student Data Upload (used for leftover cleanup).
CREATE OR REPLACE FUNCTION public.admin_student_data_upload_delete_all_imported()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, auth
AS $$
DECLARE
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

  FOR v_id IN
    SELECT s.id
    FROM public.students s
    WHERE s.metadata ILIKE '%admin_student_data_upload%'
       OR public.safe_text_to_jsonb(s.metadata)->>'source' = 'admin_student_data_upload'
  LOOP
    BEGIN
      v_uuid := NULLIF(trim(v_id), '')::uuid;
    EXCEPTION WHEN others THEN
      v_uuid := NULL;
    END;

    BEGIN
      DELETE FROM public.payment_success WHERE user_id::text = v_id;
    EXCEPTION WHEN others THEN
      NULL;
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

  DELETE FROM public.student_data_uploads;

  RETURN jsonb_build_object('ok', true, 'deleted_students', v_deleted);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_student_data_upload_delete_all_imported() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_student_data_upload_delete_all_imported() TO authenticated;

-- Delete selected imported students by id list (auth + directory cleanup).
CREATE OR REPLACE FUNCTION public.admin_student_data_upload_delete_students(p_ids text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, auth
AS $$
DECLARE
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

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'deleted_students', 0);
  END IF;

  FOREACH v_id IN ARRAY p_ids
  LOOP
    IF nullif(trim(v_id), '') IS NULL THEN
      CONTINUE;
    END IF;

    -- Only remove students that came from Student Data Upload.
    IF NOT EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = trim(v_id)
        AND (
          s.metadata ILIKE '%admin_student_data_upload%'
          OR public.safe_text_to_jsonb(s.metadata)->>'source' = 'admin_student_data_upload'
        )
    ) THEN
      CONTINUE;
    END IF;

    BEGIN
      v_uuid := NULLIF(trim(v_id), '')::uuid;
    EXCEPTION WHEN others THEN
      v_uuid := NULL;
    END;

    BEGIN
      DELETE FROM public.payment_success WHERE user_id::text = trim(v_id);
    EXCEPTION WHEN others THEN
      NULL;
    END;

    DELETE FROM public.user_roles WHERE user_id::text = trim(v_id);
    DELETE FROM public.profiles WHERE id::text = trim(v_id);
    DELETE FROM public.students WHERE id = trim(v_id);
    IF v_uuid IS NOT NULL THEN
      DELETE FROM auth.identities WHERE user_id = v_uuid;
      DELETE FROM auth.users WHERE id = v_uuid;
    END IF;
    v_deleted := v_deleted + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'deleted_students', v_deleted);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_student_data_upload_delete_students(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_student_data_upload_delete_students(text[]) TO authenticated;
