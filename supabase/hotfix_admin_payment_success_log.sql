-- Run in Supabase SQL Editor so paid registrations appear in Admin → Transactions & Revenue.

ALTER TABLE public.payment_success ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.payment_success ADD COLUMN IF NOT EXISTS college_name TEXT;
ALTER TABLE public.payment_success ADD COLUMN IF NOT EXISTS cybercafe_shop_name TEXT;
ALTER TABLE public.payment_success ADD COLUMN IF NOT EXISTS cybercafe_email TEXT;

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
