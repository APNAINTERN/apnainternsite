-- One-time repair for a student who paid but cannot log in or open /dashboard.
-- Replace v_email and v_payment_id, then run entire file in Supabase SQL Editor.

DO $$
DECLARE
  v_email text := 'student@example.com';
  v_payment_id text := 'pay_XXXXXXXXXXXX';
  v_amount bigint := 9900;
  v_uid uuid;
  v_plain text;
BEGIN
  SELECT u.id INTO v_uid FROM auth.users u WHERE lower(trim(u.email)) = lower(trim(v_email));
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No auth user for %', v_email;
  END IF;

  SELECT coalesce(po.amount, v_amount) INTO v_amount
  FROM public.payment_orders po
  WHERE po.status = 'success'
    AND (po.payment_id = v_payment_id OR lower(trim(coalesce(po.user_email, po.metadata->>'email', ''))) = lower(v_email))
  ORDER BY po.created_at DESC
  LIMIT 1;

  PERFORM public.ensure_payment_success_log(
    jsonb_build_object(
      'user_id', v_uid::text,
      'payment_id', v_payment_id,
      'amount_paise', GREATEST(coalesce(v_amount, 0), 100),
      'email', lower(trim(v_email)),
      'full_name', 'Student',
      'status', 'success'
    )
  );

  SELECT nullif(trim(s.metadata->>'password'), '') INTO v_plain
  FROM public.students s
  WHERE s.id = v_uid;

  IF v_plain IS NOT NULL AND length(v_plain) >= 5 THEN
    PERFORM public.apply_student_registration_password(v_uid, lower(trim(v_email)), v_plain);
  END IF;

  RAISE NOTICE 'student_has_paid_enrollment = %', public.student_has_paid_enrollment(v_uid);
END $$;
