-- One-time: students enrolled 31 May 2026, 11:00–18:00 (India time) → payment_success + dashboard access.
-- Run entire file in Supabase SQL Editor. Adjust the date window below if needed.
--
-- Requires: hotfix_student_paid_enrollment_check.sql (ensure_payment_success_log)
--           hotfix_student_auth_login.sql (optional, for login password repair)

DO $$
DECLARE
  r record;
  v_pay_id text;
  v_amount bigint := 9900;
  v_fixed int := 0;
BEGIN
  FOR r IN
    SELECT
      s.id,
      lower(trim(s.email)) AS email,
      coalesce(nullif(trim(s.full_name), ''), 'Student') AS full_name,
      s.created_at
    FROM public.students s
    WHERE s.email IS NOT NULL
      AND trim(s.email) <> ''
      AND (s.created_at AT TIME ZONE 'Asia/Kolkata') >= timestamptz '2026-05-31 11:00:00+05:30'
      AND (s.created_at AT TIME ZONE 'Asia/Kolkata') <  timestamptz '2026-05-31 18:00:00+05:30'
  LOOP
    SELECT po.payment_id, po.amount
    INTO v_pay_id, v_amount
    FROM public.payment_orders po
    WHERE po.status = 'success'
      AND (
        lower(trim(coalesce(po.user_email, ''))) = r.email
        OR lower(trim(coalesce(po.metadata->>'email', ''))) = r.email
      )
    ORDER BY po.updated_at DESC NULLS LAST, po.created_at DESC
    LIMIT 1;

    IF v_pay_id IS NULL THEN
      SELECT ps.payment_id, ps.amount_paise
      INTO v_pay_id, v_amount
      FROM public.payment_success ps
      WHERE lower(trim(ps.email)) = r.email
        AND ps.payment_id ~* '^pay_'
      ORDER BY ps.created_at DESC
      LIMIT 1;
    END IF;

    IF v_pay_id IS NULL THEN
      v_pay_id := 'pay_admin_may31_' || replace(r.id::text, '-', '');
      v_amount := 9900;
    END IF;

    PERFORM public.ensure_payment_success_log(
      jsonb_build_object(
        'user_id', r.id::text,
        'payment_id', v_pay_id,
        'amount_paise', GREATEST(coalesce(v_amount, 0), 100),
        'email', r.email,
        'full_name', r.full_name,
        'status', 'success'
      )
    );

    UPDATE public.students
    SET status = coalesce(nullif(trim(status), ''), 'Active')
    WHERE id = r.id;

    v_fixed := v_fixed + 1;
  END LOOP;

  RAISE NOTICE 'Fixed payment_success for % students (31 May 2026 11:00–18:00 IST)', v_fixed;
END $$;

-- Preview who was updated (run after the block above)
SELECT
  s.id,
  s.email,
  s.full_name,
  s.status,
  s.created_at AT TIME ZONE 'Asia/Kolkata' AS created_ist,
  ps.payment_id,
  ps.amount_paise,
  ps.status AS payment_status,
  public.student_has_paid_enrollment(s.id) AS dashboard_ok
FROM public.students s
LEFT JOIN LATERAL (
  SELECT payment_id, amount_paise, status
  FROM public.payment_success ps
  WHERE ps.user_id = s.id OR lower(trim(ps.email)) = lower(trim(s.email))
  ORDER BY ps.created_at DESC
  LIMIT 1
) ps ON true
WHERE (s.created_at AT TIME ZONE 'Asia/Kolkata') >= timestamptz '2026-05-31 11:00:00+05:30'
  AND (s.created_at AT TIME ZONE 'Asia/Kolkata') <  timestamptz '2026-05-31 18:00:00+05:30'
ORDER BY s.created_at;
