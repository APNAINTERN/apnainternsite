-- Ensure admin/staff Add Registration students are visible in Student Directory
-- (clears unpaid-directory flags that can linger after upsert onto SDU rows).

CREATE OR REPLACE FUNCTION public.mark_student_directory_visible(p_user_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id text := nullif(trim(p_user_id), '');
  v_meta jsonb;
BEGIN
  IF v_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'staff'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT coalesce(public.safe_text_to_jsonb(metadata), '{}'::jsonb)
  INTO v_meta
  FROM public.students
  WHERE id = v_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_meta := v_meta
    || jsonb_build_object(
      'payment_required', false,
      'bulk_upload_paid', true
    );

  UPDATE public.students
  SET metadata = v_meta::text
  WHERE id = v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_student_directory_visible(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_student_directory_visible(text) TO authenticated;
