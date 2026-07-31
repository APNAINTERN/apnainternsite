-- Import post-July-6 Supabase exports ("update data ezyintern" folder) into RDS.
-- Insert-only: existing rows are never updated or deleted.
-- Requires the CSVs to be loaded into the import_staging schema first.

BEGIN;

-- 1. auth.users for the new people (needed by profiles / user_roles / certificates FKs).
--    Password comes from students.metadata->>'password' (plaintext stored by the app),
--    or referral_partners.partner_login_secret for the promoter account.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
)
SELECT
  p.id::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated',
  p.email,
  CASE
    WHEN COALESCE(st.metadata::jsonb ->> 'password', '') <> ''
      THEN extensions.crypt(st.metadata::jsonb ->> 'password', extensions.gen_salt('bf'))
    WHEN COALESCE(rp.partner_login_secret, '') <> ''
      THEN extensions.crypt(rp.partner_login_secret, extensions.gen_salt('bf'))
    ELSE NULL
  END,
  p.created_at::timestamptz,
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', p.full_name),
  p.created_at::timestamptz,
  COALESCE(NULLIF(p.updated_at, '')::timestamptz, p.created_at::timestamptz),
  false, false
FROM import_staging.profiles p
LEFT JOIN import_staging.students st ON st.id = p.id
LEFT JOIN import_staging.referral_partners rp ON rp.auth_user_id = p.id
WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = p.id::uuid)
  AND NOT EXISTS (SELECT 1 FROM auth.users a WHERE lower(a.email) = lower(p.email) AND a.is_sso_user = false)
ON CONFLICT (id) DO NOTHING;

-- identities (best-effort, mirrors the local signup path)
INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), p.id::uuid,
       jsonb_build_object('sub', p.id, 'email', p.email),
       'email', p.email, NULL, p.created_at::timestamptz, p.created_at::timestamptz
FROM import_staging.profiles p
WHERE EXISTS (SELECT 1 FROM auth.users a WHERE a.id = p.id::uuid)
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = p.id::uuid AND i.provider = 'email')
ON CONFLICT DO NOTHING;

-- 2. universities
INSERT INTO public.universities (id, name, created_at, logo_url, pisa_fee)
SELECT s.id::uuid, s.name, s.created_at::timestamptz,
       NULLIF(s.logo_url, ''), NULLIF(s.pisa_fee, '')::numeric
FROM import_staging.universities s
WHERE NOT EXISTS (SELECT 1 FROM public.universities u WHERE u.id = s.id::uuid)
  AND NOT EXISTS (SELECT 1 FROM public.universities u WHERE u.name = s.name)
ON CONFLICT DO NOTHING;

-- 3. colleges
INSERT INTO public.colleges (
  id, university_id, name, created_at, registration_fee, pisa_fee,
  fee_base_paise, fee_processing_paise, show_fee_breakdown, fees_managed,
  registration_start_date, registration_end_date
)
SELECT s.id::uuid, s.university_id::uuid, s.name, s.created_at::timestamptz,
       NULLIF(s.registration_fee, '')::numeric, NULLIF(s.pisa_fee, '')::numeric,
       NULLIF(s.fee_base_paise, '')::integer, COALESCE(NULLIF(s.fee_processing_paise, '')::integer, 0),
       COALESCE(NULLIF(s.show_fee_breakdown, '')::boolean, false),
       COALESCE(NULLIF(s.fees_managed, '')::boolean, false),
       NULLIF(s.registration_start_date, '')::date, NULLIF(s.registration_end_date, '')::date
FROM import_staging.colleges s
WHERE NOT EXISTS (SELECT 1 FROM public.colleges c WHERE c.id = s.id::uuid)
  AND NOT EXISTS (SELECT 1 FROM public.colleges c WHERE c.university_id = s.university_id::uuid AND c.name = s.name)
ON CONFLICT DO NOTHING;

-- 4. engineering_university_configs
INSERT INTO public.engineering_university_configs (
  id, university_id, courses, branches_by_course, domains, is_active, created_at, updated_at
)
SELECT s.id::uuid, s.university_id::uuid,
       COALESCE(NULLIF(s.courses, '')::jsonb, '[]'::jsonb),
       COALESCE(NULLIF(s.branches_by_course, '')::jsonb, '{}'::jsonb),
       COALESCE(NULLIF(s.domains, '')::jsonb, '[]'::jsonb),
       COALESCE(NULLIF(s.is_active, '')::boolean, true),
       s.created_at::timestamptz,
       COALESCE(NULLIF(s.updated_at, '')::timestamptz, s.created_at::timestamptz)
FROM import_staging.engineering_university_configs s
WHERE NOT EXISTS (SELECT 1 FROM public.engineering_university_configs e WHERE e.id = s.id::uuid)
  AND NOT EXISTS (SELECT 1 FROM public.engineering_university_configs e WHERE e.university_id = s.university_id::uuid)
ON CONFLICT DO NOTHING;

-- 5. students (RDS table is all-text; keep values as exported)
INSERT INTO public.students (
  id, email, full_name, gender, parent_name, contact_number, university_name,
  college_name, course, degree, department, class_semester, academic_session,
  roll_number, internship_domain, emergency_name, emergency_contact,
  emergency_relation, status, created_at, registration_id, metadata,
  cybercafe_shop_name, cybercafe_email, joining_date, completion_date,
  internship_duration, referral_code
)
SELECT
  s.id, s.email, s.full_name, s.gender, s.parent_name, s.contact_number, s.university_name,
  s.college_name, s.course, s.degree, s.department, s.class_semester, s.academic_session,
  s.roll_number, s.internship_domain, s.emergency_name, s.emergency_contact,
  s.emergency_relation, s.status, s.created_at, s.registration_id, s.metadata,
  s.cybercafe_shop_name, s.cybercafe_email, s.joining_date, s.completion_date,
  s.internship_duration, s.referral_code
FROM import_staging.students s
WHERE NOT EXISTS (SELECT 1 FROM public.students t WHERE t.id = s.id)
ON CONFLICT DO NOTHING;

-- 6. profiles
INSERT INTO public.profiles (id, full_name, gender, parent_name, contact_number, email, created_at, updated_at)
SELECT s.id::uuid, s.full_name, NULLIF(s.gender, ''), NULLIF(s.parent_name, ''),
       NULLIF(s.contact_number, ''), s.email, s.created_at::timestamptz,
       COALESCE(NULLIF(s.updated_at, '')::timestamptz, s.created_at::timestamptz)
FROM import_staging.profiles s
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = s.id::uuid)
  AND EXISTS (SELECT 1 FROM auth.users a WHERE a.id = s.id::uuid)
ON CONFLICT DO NOTHING;

-- 7. user_roles
INSERT INTO public.user_roles (id, user_id, role, created_at)
SELECT s.id::uuid, s.user_id::uuid, s.role::public.app_role, s.created_at::timestamptz
FROM import_staging.user_roles s
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.id = s.id::uuid)
  AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = s.user_id::uuid AND r.role = s.role::public.app_role)
  AND EXISTS (SELECT 1 FROM auth.users a WHERE a.id = s.user_id::uuid)
ON CONFLICT DO NOTHING;

-- 8. certificates
INSERT INTO public.certificates (
  id, certificate_id, student_name, user_id, internship_name, duration,
  status, issue_date, created_at, display_overrides
)
SELECT s.id::uuid, s.certificate_id, s.student_name,
       CASE WHEN COALESCE(s.user_id, '') <> ''
              AND EXISTS (SELECT 1 FROM auth.users a WHERE a.id = s.user_id::uuid)
            THEN s.user_id::uuid ELSE NULL END,
       s.internship_name, s.duration, s.status,
       NULLIF(s.issue_date, '')::date, s.created_at::timestamptz,
       NULLIF(s.display_overrides, '')::jsonb
FROM import_staging.certificates s
WHERE NOT EXISTS (SELECT 1 FROM public.certificates c WHERE c.id = s.id::uuid)
  AND NOT EXISTS (SELECT 1 FROM public.certificates c WHERE c.certificate_id = s.certificate_id)
ON CONFLICT DO NOTHING;

-- 9. payment_success (no FK on user_id; keep values verbatim)
INSERT INTO public.payment_success (
  id, user_id, payment_id, amount_paise, email, full_name, created_at,
  college_name, status, failure_reason, user_phone, metadata,
  cybercafe_email, cybercafe_shop_name
)
SELECT s.id::uuid, NULLIF(s.user_id, '')::uuid, NULLIF(s.payment_id, ''),
       NULLIF(s.amount_paise, '')::bigint, s.email, s.full_name, s.created_at::timestamptz,
       NULLIF(s.college_name, ''), NULLIF(s.status, ''), NULLIF(s.failure_reason, ''),
       NULLIF(s.user_phone, ''), NULLIF(s.metadata, '')::jsonb,
       NULLIF(s.cybercafe_email, ''), NULLIF(s.cybercafe_shop_name, '')
FROM import_staging.payment_success s
WHERE NOT EXISTS (SELECT 1 FROM public.payment_success p WHERE p.id = s.id::uuid)
ON CONFLICT DO NOTHING;

-- 10. referral_partners
INSERT INTO public.referral_partners (
  id, full_name, email, contact_number, referral_code, active, created_at,
  updated_at, created_by, auth_user_id, partner_login_secret, city,
  college_name, referral_type
)
SELECT s.id::uuid, s.full_name, s.email, NULLIF(s.contact_number, ''), s.referral_code,
       COALESCE(NULLIF(s.active, '')::boolean, true), s.created_at::timestamptz,
       COALESCE(NULLIF(s.updated_at, '')::timestamptz, s.created_at::timestamptz),
       CASE WHEN COALESCE(s.created_by, '') <> ''
              AND EXISTS (SELECT 1 FROM auth.users a WHERE a.id = s.created_by::uuid)
            THEN s.created_by::uuid ELSE NULL END,
       CASE WHEN COALESCE(s.auth_user_id, '') <> ''
              AND EXISTS (SELECT 1 FROM auth.users a WHERE a.id = s.auth_user_id::uuid)
            THEN s.auth_user_id::uuid ELSE NULL END,
       NULLIF(s.partner_login_secret, ''), NULLIF(s.city, ''),
       NULLIF(s.college_name, ''), NULLIF(s.referral_type, '')
FROM import_staging.referral_partners s
WHERE NOT EXISTS (SELECT 1 FROM public.referral_partners r WHERE r.id = s.id::uuid)
  AND NOT EXISTS (SELECT 1 FROM public.referral_partners r WHERE r.referral_code = s.referral_code)
ON CONFLICT DO NOTHING;

-- 11. beu_details (table did not exist on RDS yet; students.id is text here)
CREATE TABLE IF NOT EXISTS public.beu_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL UNIQUE REFERENCES public.students(id) ON DELETE CASCADE,
  college text,
  course text NOT NULL,
  branch_subject text NOT NULL,
  specialization text,
  section_type text NOT NULL CHECK (section_type IN ('Hours', 'Weeks')),
  section_duration text NOT NULL,
  academic_session text,
  registration_number text,
  internship_domain text,
  mode text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS beu_details_student_id_idx ON public.beu_details(student_id);
CREATE INDEX IF NOT EXISTS beu_details_course_idx ON public.beu_details(course);
CREATE INDEX IF NOT EXISTS beu_details_branch_subject_idx ON public.beu_details(branch_subject);

GRANT SELECT, INSERT, UPDATE ON public.beu_details TO authenticated;

INSERT INTO public.beu_details (
  id, student_id, college, course, branch_subject, specialization, section_type,
  section_duration, academic_session, registration_number, internship_domain,
  mode, created_at, updated_at
)
SELECT s.id::uuid, s.student_id, NULLIF(s.college, ''), s.course, s.branch_subject,
       NULLIF(s.specialization, ''), s.section_type, s.section_duration,
       NULLIF(s.academic_session, ''), NULLIF(s.registration_number, ''),
       NULLIF(s.internship_domain, ''), NULLIF(s.mode, ''),
       s.created_at::timestamptz,
       COALESCE(NULLIF(s.updated_at, '')::timestamptz, s.created_at::timestamptz)
FROM import_staging.beu_details s
WHERE EXISTS (SELECT 1 FROM public.students t WHERE t.id = s.student_id)
  AND NOT EXISTS (SELECT 1 FROM public.beu_details b WHERE b.id = s.id::uuid)
  AND NOT EXISTS (SELECT 1 FROM public.beu_details b WHERE b.student_id = s.student_id)
ON CONFLICT DO NOTHING;

COMMIT;
