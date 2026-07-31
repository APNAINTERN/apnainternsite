-- =============================================================================
-- Students who could use the dashboard WITHOUT a real registration payment
-- Run in Supabase → SQL Editor → Export CSV
--
-- "Dashboard access" here means: they have a student account and can sign in
-- to /dashboard. The app did not log page visits; we infer from missing/invalid
-- payment_success (same rules as StudentDashboardGate in the app).
-- =============================================================================

WITH latest_payment AS (
  SELECT DISTINCT ON (user_id)
    user_id,
    payment_id,
    amount_paise,
    status,
    created_at
  FROM public.payment_success
  ORDER BY user_id, created_at DESC
),
student_accounts AS (
  SELECT
    u.id AS user_id,
    u.email,
    u.last_sign_in_at,
    u.created_at AS account_created,
    s.full_name,
    s.registration_id,
    s.university_name,
    s.college_name,
    lp.payment_id,
    lp.amount_paise,
    lp.status AS payment_status,
    lp.created_at AS payment_logged_at,
    CASE
      WHEN lp.payment_id IS NULL THEN 'no_payment_record'
      WHEN trim(lp.payment_id) = '' THEN 'empty_payment_id'
      WHEN lower(coalesce(lp.status, '')) NOT IN ('', 'success') THEN 'payment_not_success'
      WHEN lp.payment_id ~* '^(pay_admin_|admin_|ADMIN_TRANS_)' THEN 'admin_added_not_student_fee'
      WHEN lp.amount_paise IS NULL OR lp.amount_paise < 100 THEN 'no_real_amount_under_1_inr'
      WHEN lp.payment_id !~* '^pay_' THEN 'invalid_payment_id'
      ELSE 'paid_ok'
    END AS payment_category
  FROM auth.users u
  INNER JOIN public.user_roles ur ON ur.user_id = u.id AND ur.role = 'student'
  LEFT JOIN public.students s ON s.id = u.id
  LEFT JOIN latest_payment lp ON lp.user_id = u.id
)

-- MAIN LIST: not paid (real fee) but still a student who could open /dashboard
SELECT
  email,
  full_name,
  registration_id,
  university_name,
  college_name,
  last_sign_in_at AS last_login,
  account_created,
  payment_id,
  round(coalesce(amount_paise, 0) / 100.0, 2) AS amount_rupees,
  payment_status,
  payment_category AS why_unpaid,
  'Student login allowed; no valid Razorpay registration payment' AS dashboard_note
FROM student_accounts
WHERE payment_category IN (
  'no_payment_record',
  'empty_payment_id',
  'payment_not_success',
  'no_real_amount_under_1_inr',
  'invalid_payment_id'
)
ORDER BY last_sign_in_at DESC NULLS LAST, account_created DESC;

-- -----------------------------------------------------------------------------
-- SUMMARY (run separately if you only want counts)
-- -----------------------------------------------------------------------------
/*
SELECT
  payment_category,
  count(*) AS student_count
FROM student_accounts
GROUP BY payment_category
ORDER BY student_count DESC;
*/

-- -----------------------------------------------------------------------------
-- ONLY: never paid + signed in at least once (strongest "used dashboard" signal)
-- -----------------------------------------------------------------------------
/*
SELECT
  email,
  full_name,
  last_sign_in_at,
  payment_category
FROM student_accounts
WHERE payment_category IN (
  'no_payment_record',
  'empty_payment_id',
  'no_real_amount_under_1_inr'
)
  AND last_sign_in_at IS NOT NULL
ORDER BY last_sign_in_at DESC;
*/
