-- Student login diagnostics — run ONE query at a time (highlight lines, Run selection only).
-- Do NOT run the whole file at once — Lovable often fails on multi-statement scripts.

-- =============================================================================
-- BLOCK 1 — Copy and run ONLY these 8 lines (function check)
-- =============================================================================
SELECT routine_name AS function_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_type = 'FUNCTION'
  AND routine_name IN (
    'student_has_paid_enrollment',
    'ensure_payment_success_log',
    'student_recover_paid_enrollment',
    'repair_student_auth_login',
    'student_exchange_login_otp',
    'get_user_id_by_email'
  )
ORDER BY 1;

-- Expected: 6 rows. If fewer, run on production (whole file each):
--   supabase/hotfix_student_paid_enrollment_check.sql
--   supabase/hotfix_student_auth_login.sql

-- =============================================================================
-- BLOCK 2 — Basic counts (public tables only, fast)
-- =============================================================================
SELECT count(*) AS total_students
FROM public.students
WHERE coalesce(trim(email), '') <> '';

SELECT count(*) AS total_payment_success
FROM public.payment_success;

SELECT count(*) AS payment_success_missing_user_id
FROM public.payment_success
WHERE user_id IS NULL AND coalesce(trim(email), '') <> '';

-- =============================================================================
-- BLOCK 3 — Dashboard gate WITHOUT calling RPC per row (fast, no timeout)
-- Same rules as student_has_paid_enrollment in app code
-- =============================================================================
SELECT
  count(*) AS students_with_qualifying_payment
FROM public.students s
WHERE coalesce(trim(s.email), '') <> ''
  AND EXISTS (
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
  );

SELECT
  count(*) AS students_missing_qualifying_payment
FROM public.students s
WHERE coalesce(trim(s.email), '') <> ''
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
  );

-- =============================================================================
-- BLOCK 4 — Auth vs student directory (uses auth.users; skip if permission error)
-- =============================================================================
SELECT
  count(*) FILTER (WHERE u.id IS NOT NULL) AS student_has_auth_user,
  count(*) FILTER (WHERE u.id IS NULL) AS student_no_auth_user,
  count(*) FILTER (WHERE u.id IS NOT NULL AND s.id <> u.id) AS id_mismatch
FROM public.students s
LEFT JOIN auth.users u ON lower(trim(u.email)) = lower(trim(s.email))
WHERE coalesce(trim(s.email), '') <> '';

SELECT
  count(*) AS students_with_password_in_metadata
FROM public.students s
WHERE nullif(trim(s.metadata->>'password'), '') IS NOT NULL;

-- =============================================================================
-- BLOCK 5 — RPC check on ONE sample student (only if Block 1 shows function exists)
-- Replace email below, then run
-- =============================================================================
-- SELECT
--   s.id,
--   s.email,
--   public.student_has_paid_enrollment(s.id) AS paid_rpc
-- FROM public.students s
-- WHERE lower(trim(s.email)) = lower(trim('student@example.com'))
-- LIMIT 1;

-- =============================================================================
-- BLOCK 6 — Sample blocked students (simpler; run alone if Block 3 count is high)
-- =============================================================================
SELECT s.email, s.id AS student_id, s.created_at
FROM public.students s
WHERE coalesce(trim(s.email), '') <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.payment_success ps
    WHERE ps.user_id = s.id OR lower(trim(ps.email)) = lower(trim(s.email))
  )
ORDER BY s.created_at DESC
LIMIT 20;
