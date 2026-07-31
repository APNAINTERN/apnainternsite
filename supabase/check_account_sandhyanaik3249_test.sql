-- =============================================================================
-- Account check: sandhyanaik3249+test@gmail.com
-- Run in Supabase Dashboard → SQL Editor (uses service role; sees all rows).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Auth user (can they log in?)
-- -----------------------------------------------------------------------------
SELECT
  id,
  email,
  email_confirmed_at IS NOT NULL AS email_confirmed,
  created_at,
  last_sign_in_at
FROM auth.users
WHERE lower(email) = lower('sandhyanaik3249+test@gmail.com');

-- -----------------------------------------------------------------------------
-- 2) Profile (dashboard personal block — partial data)
-- -----------------------------------------------------------------------------
SELECT
  id,
  email,
  full_name,
  contact_number,
  gender,
  parent_name
FROM public.profiles
WHERE lower(email) = lower('sandhyanaik3249+test@gmail.com');

-- -----------------------------------------------------------------------------
-- 3) Students row (dashboard academic + offer letter — MAIN CHECK)
-- -----------------------------------------------------------------------------
SELECT
  id,
  email,
  full_name,
  contact_number,
  gender,
  parent_name,
  university_name,
  college_name,
  degree,
  department,
  class_semester,
  academic_session,
  roll_number,
  course,
  internship_domain,
  internship_mode,
  emergency_name,
  emergency_contact,
  emergency_relation,
  registration_id,
  status,
  metadata,
  created_at,
  updated_at
FROM public.students
WHERE lower(email) = lower('sandhyanaik3249+test@gmail.com');

-- -----------------------------------------------------------------------------
-- 4) Role (must be student for /dashboard)
-- -----------------------------------------------------------------------------
SELECT ur.user_id, ur.role
FROM public.user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE lower(u.email) = lower('sandhyanaik3249+test@gmail.com');

-- -----------------------------------------------------------------------------
-- 5) Payment log
-- -----------------------------------------------------------------------------
SELECT
  user_id,
  payment_id,
  amount_paise,
  email,
  full_name,
  college_name,
  status,
  created_at
FROM public.payment_success
WHERE lower(email) = lower('sandhyanaik3249+test@gmail.com')
ORDER BY created_at DESC;

-- -----------------------------------------------------------------------------
-- 6) Draft lead (usually empty — app disables draft save by default)
-- -----------------------------------------------------------------------------
SELECT email, step, payload, updated_at
FROM public.registration_leads
WHERE lower(email) = lower('sandhyanaik3249+test@gmail.com');

-- -----------------------------------------------------------------------------
-- 7) Payment order metadata (only if order API was used)
-- -----------------------------------------------------------------------------
SELECT order_id, status, user_email, metadata, created_at
FROM public.payment_orders
WHERE lower(user_email) = lower('sandhyanaik3249+test@gmail.com')
   OR lower(metadata->>'email') = lower('sandhyanaik3249+test@gmail.com')
ORDER BY created_at DESC
LIMIT 3;

-- -----------------------------------------------------------------------------
-- 8) College roster match (recovery only if they auto-filled from roster)
-- -----------------------------------------------------------------------------
SELECT
  r.college_id,
  c.name AS college_name,
  r.full_name,
  r.email,
  r.phone,
  r.degree,
  r.department,
  r.subject,
  r.class_semester,
  r.academic_session,
  r.registration_number,
  r.claimed_user_id
FROM public.college_student_rosters r
LEFT JOIN public.colleges c ON c.id = r.college_id
WHERE lower(r.email) = lower('sandhyanaik3249+test@gmail.com')
   OR r.claimed_user_id IN (
     SELECT id FROM auth.users
     WHERE lower(email) = lower('sandhyanaik3249+test@gmail.com')
   );

-- -----------------------------------------------------------------------------
-- Summary: one row — what's missing for dashboard / offer letter?
-- -----------------------------------------------------------------------------
SELECT
  u.id AS auth_user_id,
  (s.id IS NOT NULL) AS has_students_row,
  NULLIF(trim(s.university_name), '') IS NOT NULL AS has_university,
  NULLIF(trim(s.college_name), '') IS NOT NULL AS has_college,
  NULLIF(trim(s.degree), '') IS NOT NULL AS has_degree,
  (s.metadata IS NOT NULL AND s.metadata <> '{}'::jsonb) AS has_metadata,
  (ps.payment_id IS NOT NULL) AS has_payment_success,
  (rl.email IS NOT NULL) AS has_registration_lead
FROM auth.users u
LEFT JOIN public.students s ON s.id = u.id
LEFT JOIN LATERAL (
  SELECT payment_id FROM public.payment_success
  WHERE lower(email) = lower('sandhyanaik3249+test@gmail.com')
  ORDER BY created_at DESC LIMIT 1
) ps ON true
LEFT JOIN public.registration_leads rl
  ON lower(rl.email) = lower('sandhyanaik3249+test@gmail.com')
WHERE lower(u.email) = lower('sandhyanaik3249+test@gmail.com');
