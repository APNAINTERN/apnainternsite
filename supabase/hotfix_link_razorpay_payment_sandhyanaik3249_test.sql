-- One-time: link Razorpay payment to sandhyanaik3249+test@gmail.com (run in Supabase SQL Editor).
-- Replace payment_id if your receipt shows a different id.

DO $$
DECLARE
  v_uid uuid;
  v_email text := 'sandhyanaik3249+test@gmail.com';
  v_payment_id text := 'pay_SxwmLSOoo1pzgV';
  v_amount bigint := 200;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(trim(email)) = lower(v_email);
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No auth user for %', v_email;
  END IF;

  SELECT coalesce(po.amount, 200) INTO v_amount
  FROM public.payment_orders po
  WHERE po.status = 'success'
    AND (po.payment_id = v_payment_id OR lower(trim(coalesce(po.user_email, ''))) = lower(v_email))
  ORDER BY po.created_at DESC
  LIMIT 1;

  PERFORM public.ensure_payment_success_log(
    jsonb_build_object(
      'user_id', v_uid::text,
      'payment_id', v_payment_id,
      'amount_paise', GREATEST(v_amount, 100),
      'email', lower(v_email),
      'full_name', 'Student',
      'status', 'success'
    )
  );

  RAISE NOTICE 'student_has_paid_enrollment = %', public.student_has_paid_enrollment(v_uid);
END $$;

SELECT payment_id, amount_paise, user_id, email, status, created_at
FROM public.payment_success
WHERE lower(email) = lower('sandhyanaik3249+test@gmail.com')
ORDER BY created_at DESC;
