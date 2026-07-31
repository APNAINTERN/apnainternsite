-- Paid students: link payment_success to auth user + reliable enrollment check (fixes login → dashboard bounce).

-- Backfill user_id on payment rows logged by email only
UPDATE public.payment_success ps
SET user_id = u.id
FROM auth.users u
WHERE ps.user_id IS NULL
  AND lower(trim(ps.email)) = lower(trim(u.email));

-- Resolve user_id from email when logging new payments
CREATE OR REPLACE FUNCTION public.ensure_payment_success_log(p_row jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_payment_id text := NULLIF(trim(p_row->>'payment_id'), '');
  v_user_id uuid := NULLIF(trim(p_row->>'user_id'), '')::uuid;
  v_email text := lower(trim(COALESCE(p_row->>'email', '')));
  v_amount bigint;
  v_id uuid;
BEGIN
  IF v_payment_id IS NULL OR v_payment_id = '' THEN
    RAISE EXCEPTION 'payment_id required';
  END IF;
  IF v_email = '' THEN
    RAISE EXCEPTION 'email required';
  END IF;

  IF v_user_id IS NULL THEN
    SELECT u.id INTO v_user_id
    FROM auth.users u
    WHERE lower(trim(u.email)) = v_email
    LIMIT 1;
  END IF;

  v_amount := COALESCE((p_row->>'amount_paise')::bigint, 0);
  IF v_amount < 0 THEN
    v_amount := 0;
  END IF;

  SELECT id INTO v_id
  FROM public.payment_success
  WHERE payment_id = v_payment_id
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.payment_success
    SET
      user_id = COALESCE(v_user_id, user_id),
      amount_paise = CASE WHEN v_amount > 0 THEN v_amount ELSE amount_paise END,
      email = v_email,
      full_name = COALESCE(NULLIF(trim(p_row->>'full_name'), ''), full_name),
      college_name = COALESCE(NULLIF(trim(p_row->>'college_name'), ''), college_name),
      status = COALESCE(NULLIF(trim(p_row->>'status'), ''), status, 'success'),
      cybercafe_shop_name = COALESCE(NULLIF(trim(p_row->>'cybercafe_shop_name'), ''), cybercafe_shop_name),
      cybercafe_email = COALESCE(NULLIF(trim(p_row->>'cybercafe_email'), ''), cybercafe_email)
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.payment_success (
    user_id,
    payment_id,
    amount_paise,
    email,
    full_name,
    college_name,
    status,
    cybercafe_shop_name,
    cybercafe_email
  )
  VALUES (
    v_user_id,
    v_payment_id,
    v_amount,
    v_email,
    COALESCE(NULLIF(trim(p_row->>'full_name'), ''), 'Student'),
    NULLIF(trim(p_row->>'college_name'), ''),
    COALESCE(NULLIF(trim(p_row->>'status'), ''), 'success'),
    NULLIF(trim(p_row->>'cybercafe_shop_name'), ''),
    NULLIF(trim(p_row->>'cybercafe_email'), '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_payment_success_log(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_payment_success_log(jsonb) TO anon, authenticated, service_role;

-- Students can read payment rows tied to their account (by user_id or email)
DROP POLICY IF EXISTS "Users can view own payments" ON public.payment_success;
CREATE POLICY "Users can view own payments"
  ON public.payment_success
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR (
      user_id IS NULL
      AND lower(trim(email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    )
    OR lower(trim(email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  );

-- SECURITY DEFINER check used by dashboard gate (same rules as the app)
CREATE OR REPLACE FUNCTION public.student_has_paid_enrollment(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := p_user_id;
  v_email text;
  v_row record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT lower(trim(u.email)) INTO v_email
  FROM auth.users u
  WHERE u.id = v_uid;

  FOR v_row IN
    SELECT ps.payment_id, ps.amount_paise, ps.status
    FROM public.payment_success ps
    WHERE ps.user_id = v_uid
       OR (v_email <> '' AND lower(trim(ps.email)) = v_email)
    ORDER BY ps.created_at DESC
    LIMIT 5
  LOOP
    IF v_row.payment_id IS NULL OR trim(v_row.payment_id) = '' THEN
      CONTINUE;
    END IF;

    IF lower(coalesce(v_row.status, 'success')) NOT IN ('', 'success') THEN
      CONTINUE;
    END IF;

    IF v_row.payment_id ~* '^(pay_admin_|admin_|ADMIN_TRANS_)' THEN
      RETURN TRUE;
    END IF;

    IF v_row.payment_id ~* '^pay_'
       AND coalesce(v_row.amount_paise, 0) >= 100 THEN
      RETURN TRUE;
    END IF;
  END LOOP;

  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.student_has_paid_enrollment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_has_paid_enrollment(uuid) TO anon, authenticated;
