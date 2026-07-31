-- Let signed-in students recover dashboard access when Razorpay paid but payment_success was never logged.

CREATE OR REPLACE FUNCTION public.student_recover_paid_enrollment(
  p_payment_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_pay_id text := NULLIF(trim(p_payment_id), '');
  v_amount bigint;
  v_order_email text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT lower(trim(u.email)) INTO v_email
  FROM auth.users u
  WHERE u.id = v_uid;

  IF v_email IS NULL OR v_email = '' THEN
    RETURN FALSE;
  END IF;

  IF public.student_has_paid_enrollment(v_uid) THEN
    RETURN TRUE;
  END IF;

  IF v_pay_id IS NOT NULL THEN
    SELECT po.amount, lower(trim(coalesce(po.user_email, po.metadata->>'email', '')))
    INTO v_amount, v_order_email
    FROM public.payment_orders po
    WHERE po.status = 'success'
      AND (po.payment_id = v_pay_id OR po.order_id = v_pay_id)
    ORDER BY po.created_at DESC
    LIMIT 1;
  ELSE
    SELECT po.payment_id, po.amount, lower(trim(coalesce(po.user_email, po.metadata->>'email', '')))
    INTO v_pay_id, v_amount, v_order_email
    FROM public.payment_orders po
    WHERE po.status = 'success'
      AND (
        lower(trim(coalesce(po.user_email, ''))) = v_email
        OR lower(trim(coalesce(po.metadata->>'email', ''))) = v_email
      )
    ORDER BY po.created_at DESC
    LIMIT 1;
  END IF;

  IF v_pay_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_order_email IS NOT NULL AND v_order_email <> '' AND v_order_email <> v_email THEN
    RETURN FALSE;
  END IF;

  PERFORM public.ensure_payment_success_log(
    jsonb_build_object(
      'user_id', v_uid::text,
      'payment_id', v_pay_id,
      'amount_paise', GREATEST(coalesce(v_amount, 0), 100),
      'email', v_email,
      'full_name', 'Student',
      'status', 'success'
    )
  );

  RETURN public.student_has_paid_enrollment(v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.student_recover_paid_enrollment(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_recover_paid_enrollment(text) TO authenticated;
