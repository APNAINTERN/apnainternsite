-- Reliable sync of students.password + metadata.password after the learner changes Auth password.
-- Browser UPDATE can fail under RLS or race with profile saves; this RPC runs as definer.

CREATE OR REPLACE FUNCTION public.sync_student_directory_password(p_plain TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plain TEXT := trim(p_plain);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_plain IS NULL OR length(v_plain) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;

  UPDATE public.students
  SET
    password = v_plain,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('password', v_plain)
  WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.sync_student_directory_password(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_student_directory_password(TEXT) TO authenticated;
