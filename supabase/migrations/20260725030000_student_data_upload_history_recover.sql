-- Recover missing Student Data Upload history rows from students.metadata.upload_id,
-- and add an admin RPC to upsert history reliably (avoids REST Prefer/upsert gaps).
-- Note: public.students.created_at is text in this schema.

CREATE OR REPLACE FUNCTION public.admin_student_data_upload_save_history(
  p_upload_id uuid,
  p_mode text,
  p_file_name text DEFAULT NULL,
  p_total_rows integer DEFAULT 0,
  p_imported_count integer DEFAULT 0,
  p_skipped_count integer DEFAULT 0,
  p_failed_count integer DEFAULT 0,
  p_failed_rows jsonb DEFAULT '[]'::jsonb,
  p_imported_user_ids jsonb DEFAULT '[]'::jsonb,
  p_uploaded_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_mode text := lower(trim(coalesce(p_mode, 'paid')));
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

  IF v_mode NOT IN ('paid', 'unpaid') THEN
    v_mode := 'paid';
  END IF;

  INSERT INTO public.student_data_uploads (
    id, uploaded_by, upload_mode, file_name,
    total_rows, imported_count, skipped_count, failed_count,
    failed_rows, imported_user_ids
  ) VALUES (
    p_upload_id,
    p_uploaded_by,
    v_mode,
    nullif(trim(coalesce(p_file_name, '')), ''),
    greatest(coalesce(p_total_rows, 0), 0),
    greatest(coalesce(p_imported_count, 0), 0),
    greatest(coalesce(p_skipped_count, 0), 0),
    greatest(coalesce(p_failed_count, 0), 0),
    coalesce(p_failed_rows, '[]'::jsonb),
    coalesce(p_imported_user_ids, '[]'::jsonb)
  )
  ON CONFLICT (id) DO UPDATE SET
    uploaded_by = COALESCE(EXCLUDED.uploaded_by, public.student_data_uploads.uploaded_by),
    upload_mode = EXCLUDED.upload_mode,
    file_name = COALESCE(EXCLUDED.file_name, public.student_data_uploads.file_name),
    total_rows = EXCLUDED.total_rows,
    imported_count = EXCLUDED.imported_count,
    skipped_count = EXCLUDED.skipped_count,
    failed_count = EXCLUDED.failed_count,
    failed_rows = EXCLUDED.failed_rows,
    imported_user_ids = EXCLUDED.imported_user_ids;

  RETURN jsonb_build_object('ok', true, 'upload_id', p_upload_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_student_data_upload_save_history(
  uuid, text, text, integer, integer, integer, integer, jsonb, jsonb, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_student_data_upload_save_history(
  uuid, text, text, integer, integer, integer, integer, jsonb, jsonb, uuid
) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_student_data_upload_backfill_history()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  r record;
  v_created int := 0;
  v_mode text;
  v_min_created timestamptz;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Access denied: admin or super_admin only' USING ERRCODE = '42501';
  END IF;

  FOR r IN
    SELECT
      public.safe_text_to_jsonb(s.metadata)->>'upload_id' AS upload_id,
      count(*)::int AS cnt,
      min(NULLIF(trim(coalesce(s.created_at::text, '')), '')::timestamptz) AS first_at,
      bool_or(
        coalesce(public.safe_text_to_jsonb(s.metadata)->>'payment_required', 'false') IN ('true', 't', '1')
        OR coalesce(public.safe_text_to_jsonb(s.metadata)->>'bulk_upload_paid', 'true') IN ('false', 'f', '0')
      ) AS any_unpaid,
      jsonb_agg(s.id ORDER BY s.id) AS user_ids
    FROM public.students s
    WHERE s.metadata ILIKE '%admin_student_data_upload%'
      AND nullif(trim(coalesce(public.safe_text_to_jsonb(s.metadata)->>'upload_id', '')), '') IS NOT NULL
    GROUP BY 1
  LOOP
    BEGIN
      v_min_created := coalesce(r.first_at, now());
      IF EXISTS (
        SELECT 1 FROM public.student_data_uploads u WHERE u.id = r.upload_id::uuid
      ) THEN
        UPDATE public.student_data_uploads u
        SET
          imported_count = greatest(u.imported_count, r.cnt),
          total_rows = greatest(u.total_rows, r.cnt),
          imported_user_ids = CASE
            WHEN jsonb_typeof(u.imported_user_ids) = 'array'
              AND jsonb_array_length(u.imported_user_ids) >= r.cnt
            THEN u.imported_user_ids
            ELSE r.user_ids
          END,
          file_name = coalesce(nullif(trim(u.file_name), ''), 'recovered-upload')
        WHERE u.id = r.upload_id::uuid;
        CONTINUE;
      END IF;

      v_mode := CASE WHEN r.any_unpaid THEN 'unpaid' ELSE 'paid' END;

      INSERT INTO public.student_data_uploads (
        id, upload_mode, file_name,
        total_rows, imported_count, skipped_count, failed_count,
        failed_rows, imported_user_ids, created_at
      ) VALUES (
        r.upload_id::uuid,
        v_mode,
        'recovered-upload',
        r.cnt,
        r.cnt,
        0,
        0,
        '[]'::jsonb,
        r.user_ids,
        v_min_created
      );
      v_created := v_created + 1;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'backfill skipped for %: %', r.upload_id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'created_sheets', v_created);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_student_data_upload_backfill_history() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_student_data_upload_backfill_history() TO authenticated;
