-- OTP-gated college fee update (Fees Management).

CREATE OR REPLACE FUNCTION public.admin_update_college_fees(
  p_college_id uuid,
  p_otp text,
  p_pisa_fee bigint,
  p_fee_base_paise bigint DEFAULT NULL,
  p_fee_processing_paise bigint DEFAULT NULL,
  p_show_fee_breakdown boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text;
  v_otp text := nullif(trim(p_otp), '');
  v_uid uuid := auth.uid();
  v_total bigint := coalesce(p_pisa_fee, 0);
  v_base bigint;
  v_proc bigint;
  v_show boolean := coalesce(p_show_fee_breakdown, false);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'admin'::public.app_role)
    OR public.has_role(v_uid, 'super_admin'::public.app_role)
    OR public.has_role(v_uid, 'staff'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_college_id IS NULL THEN
    RAISE EXCEPTION 'college id required';
  END IF;

  IF v_otp IS NULL OR length(v_otp) <> 6 THEN
    RAISE EXCEPTION 'invalid otp';
  END IF;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'total fee must be greater than zero';
  END IF;

  SELECT lower(trim(u.email))
  INTO v_email
  FROM auth.users u
  WHERE u.id = v_uid;

  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'admin email not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.password_resets pr
    WHERE lower(trim(pr.email)) = v_email
      AND trim(pr.otp) = v_otp
      AND pr.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'invalid or expired otp';
  END IF;

  DELETE FROM public.password_resets
  WHERE lower(trim(email)) = v_email
    AND trim(otp) = v_otp;

  v_base := coalesce(p_fee_base_paise, v_total);
  v_proc := coalesce(p_fee_processing_paise, 0);
  IF NOT v_show THEN
    v_base := v_total;
    v_proc := 0;
  END IF;

  UPDATE public.colleges
  SET
    pisa_fee = v_total,
    fee_base_paise = v_base,
    fee_processing_paise = v_proc,
    show_fee_breakdown = v_show,
    fees_managed = true
  WHERE id = p_college_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'college not found';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'college_id', p_college_id,
    'pisa_fee', v_total,
    'fee_base_paise', v_base,
    'fee_processing_paise', v_proc,
    'show_fee_breakdown', v_show
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_college_fees(uuid, text, bigint, bigint, bigint, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_college_fees(uuid, text, bigint, bigint, bigint, boolean) TO authenticated;
