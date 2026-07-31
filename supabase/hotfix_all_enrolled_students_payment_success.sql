-- One-time: students in public.students without a qualifying payment_success row
-- get payment_success so login / dashboard access works.
--
-- Run ONE step at a time in Supabase SQL Editor (highlight step, Run selection).
-- Do NOT run the whole file at once — preview/summary and the DO block can timeout.
--
-- Prerequisites (run whole file each if Block 1 in hotfix_diagnose_student_login.sql is missing rows):
--   1. hotfix_student_paid_enrollment_check.sql
--   2. hotfix_student_auth_login.sql  (optional — password repair on login)

-- =============================================================================
-- STEP 1 — Link orphan payment_success rows to auth users by email (fast)
-- =============================================================================
UPDATE public.payment_success ps
SET user_id = u.id
FROM auth.users u
WHERE ps.user_id IS NULL
  AND lower(trim(ps.email)) = lower(trim(u.email));

-- =============================================================================
-- STEP 2 — Bump Razorpay rows logged with amount 0 / too low (fast)
-- =============================================================================
UPDATE public.payment_success ps
SET amount_paise = GREATEST(coalesce(ps.amount_paise, 0), 100)
WHERE ps.payment_id ~* '^pay_[a-z0-9]'
  AND coalesce(ps.amount_paise, 0) < 100
  AND lower(coalesce(ps.status, 'success')) = 'success';

-- =============================================================================
-- STEP 3 — Preview counts (no per-row RPC; same rules as student_has_paid_enrollment)
-- =============================================================================
SELECT
  count(*) FILTER (WHERE q.has_qualifying) AS already_ok,
  count(*) FILTER (WHERE NOT q.has_qualifying) AS needs_fix,
  count(*) AS total_students
FROM public.students s
CROSS JOIN LATERAL (
  SELECT EXISTS (
    SELECT 1
    FROM public.payment_success ps
    WHERE (
        ps.user_id = s.id
        OR lower(trim(ps.email)) = lower(trim(s.email))
      )
      AND coalesce(trim(ps.payment_id), '') <> ''
      AND lower(coalesce(ps.status, 'success')) IN ('', 'success')
      AND (
        ps.payment_id ~* '^(pay_admin_|admin_|ADMIN_TRANS_)'
        OR (
          ps.payment_id ~* '^pay_[a-z0-9]'
          AND coalesce(ps.amount_paise, 0) >= 100
        )
      )
  ) AS has_qualifying
) q
WHERE s.email IS NOT NULL
  AND trim(s.email) <> '';

-- =============================================================================
-- STEP 4 — Backfill payment_success for students still blocked (may take several minutes)
-- Run alone. Re-run STEP 3 after; needs_fix should drop toward 0.
-- =============================================================================
DO $$
DECLARE
  r record;
  v_pay_id text;
  v_amount bigint := 9900;
  v_fixed int := 0;
BEGIN
  SET LOCAL statement_timeout = '600s';

  FOR r IN
    SELECT
      s.id,
      lower(trim(s.email)) AS email,
      coalesce(nullif(trim(s.full_name), ''), 'Student') AS full_name,
      nullif(trim(s.college_name), '') AS college_name
    FROM public.students s
    WHERE s.email IS NOT NULL
      AND trim(s.email) <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM public.payment_success ps
        WHERE (
            ps.user_id = s.id
            OR lower(trim(ps.email)) = lower(trim(s.email))
          )
          AND coalesce(trim(ps.payment_id), '') <> ''
          AND lower(coalesce(ps.status, 'success')) IN ('', 'success')
          AND (
            ps.payment_id ~* '^(pay_admin_|admin_|ADMIN_TRANS_)'
            OR (
              ps.payment_id ~* '^pay_[a-z0-9]'
              AND coalesce(ps.amount_paise, 0) >= 100
            )
          )
      )
    ORDER BY s.created_at
  LOOP
    v_pay_id := NULL;
    v_amount := 9900;

    SELECT po.payment_id, po.amount
    INTO v_pay_id, v_amount
    FROM public.payment_orders po
    WHERE po.status = 'success'
      AND po.payment_id IS NOT NULL
      AND trim(po.payment_id) <> ''
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
      WHERE (
          ps.user_id = r.id
          OR lower(trim(ps.email)) = r.email
        )
        AND ps.payment_id ~* '^pay_[a-z0-9]'
      ORDER BY ps.created_at DESC
      LIMIT 1;
    END IF;

    IF v_pay_id IS NULL THEN
      v_pay_id := 'pay_admin_enrolled_' || replace(r.id::text, '-', '');
      v_amount := 9900;
    END IF;

    PERFORM public.ensure_payment_success_log(
      jsonb_build_object(
        'user_id', r.id::text,
        'payment_id', v_pay_id,
        'amount_paise', GREATEST(coalesce(v_amount, 0), 100),
        'email', r.email,
        'full_name', r.full_name,
        'college_name', r.college_name,
        'status', 'success'
      )
    );

    UPDATE public.students
    SET status = coalesce(nullif(trim(status), ''), 'Active')
    WHERE id = r.id;

    v_fixed := v_fixed + 1;
  END LOOP;

  RAISE NOTICE 'payment_success backfill: rows processed=%', v_fixed;
END $$;

-- =============================================================================
-- STEP 5 — Summary after fix (fast; same EXISTS logic as STEP 3)
-- =============================================================================
SELECT
  count(*) FILTER (WHERE q.has_qualifying) AS dashboard_ok,
  count(*) FILTER (WHERE NOT q.has_qualifying) AS still_blocked,
  count(*) AS total
FROM public.students s
CROSS JOIN LATERAL (
  SELECT EXISTS (
    SELECT 1
    FROM public.payment_success ps
    WHERE (
        ps.user_id = s.id
        OR lower(trim(ps.email)) = lower(trim(s.email))
      )
      AND coalesce(trim(ps.payment_id), '') <> ''
      AND lower(coalesce(ps.status, 'success')) IN ('', 'success')
      AND (
        ps.payment_id ~* '^(pay_admin_|admin_|ADMIN_TRANS_)'
        OR (
          ps.payment_id ~* '^pay_[a-z0-9]'
          AND coalesce(ps.amount_paise, 0) >= 100
        )
      )
  ) AS has_qualifying
) q
WHERE s.email IS NOT NULL
  AND trim(s.email) <> '';

-- =============================================================================
-- STEP 6 — Sample still blocked (optional; LIMIT 100)
-- =============================================================================
SELECT s.email, s.id AS student_id, s.created_at
FROM public.students s
WHERE s.email IS NOT NULL
  AND trim(s.email) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.payment_success ps
    WHERE (
        ps.user_id = s.id
        OR lower(trim(ps.email)) = lower(trim(s.email))
      )
      AND coalesce(trim(ps.payment_id), '') <> ''
      AND lower(coalesce(ps.status, 'success')) IN ('', 'success')
      AND (
        ps.payment_id ~* '^(pay_admin_|admin_|ADMIN_TRANS_)'
        OR (
          ps.payment_id ~* '^pay_[a-z0-9]'
          AND coalesce(ps.amount_paise, 0) >= 100
        )
      )
  )
ORDER BY s.created_at
LIMIT 100;
