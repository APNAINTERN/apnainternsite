-- EzyIntern Courses LMS platform: categories, courses, curriculum, enrollments, reviews, leads.

-- Permission columns for staff Service Access
ALTER TABLE public.admin_permissions
  ADD COLUMN IF NOT EXISTS can_manage_courses boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_course_leads boolean DEFAULT false;

CREATE OR REPLACE FUNCTION public.caller_can_manage_courses()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'staff'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.admin_staff s
      WHERE s.id = auth.uid() AND coalesce(s.is_blocked, false) = false
    );
$$;

GRANT EXECUTE ON FUNCTION public.caller_can_manage_courses() TO anon, authenticated;

-- ── Categories ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.course_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  slug text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_categories_active_sort
  ON public.course_categories (is_active, sort_order ASC, name ASC);

-- ── Courses ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  slug text NOT NULL UNIQUE,
  category_id uuid REFERENCES public.course_categories(id) ON DELETE SET NULL,
  subcategory text,
  instructor_name text,
  instructor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  thumbnail_url text,
  banner_url text,
  intro_video_url text,
  short_description text,
  full_description text,
  original_price_paise integer NOT NULL DEFAULT 0,
  discount_price_paise integer NOT NULL DEFAULT 0,
  is_free boolean NOT NULL DEFAULT false,
  duration_text text,
  language text NOT NULL DEFAULT 'English',
  difficulty text CHECK (difficulty IS NULL OR difficulty IN ('beginner', 'intermediate', 'advanced')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'private')),
  is_featured boolean NOT NULL DEFAULT false,
  meta_title text,
  meta_description text,
  meta_keywords text,
  rating_avg numeric NOT NULL DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  students_count integer NOT NULL DEFAULT 0,
  lessons_count integer NOT NULL DEFAULT 0,
  modules_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_courses_status_featured
  ON public.courses (status, is_featured DESC, published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_courses_category
  ON public.courses (category_id, status);
CREATE INDEX IF NOT EXISTS idx_courses_slug
  ON public.courses (slug);

-- ── Curriculum ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.course_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_modules_course_sort
  ON public.course_modules (course_id, sort_order ASC);

CREATE TABLE IF NOT EXISTS public.course_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.course_modules(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  video_url text,
  pdf_path text,
  pdf_url text,
  notes text,
  quiz_json jsonb,
  assignment_text text,
  duration_minutes integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_lessons_module_sort
  ON public.course_lessons (module_id, sort_order ASC);

-- ── List items ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.course_learning_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_course_learning_points_course
  ON public.course_learning_points (course_id, sort_order ASC);

CREATE TABLE IF NOT EXISTS public.course_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_course_requirements_course
  ON public.course_requirements (course_id, sort_order ASC);

CREATE TABLE IF NOT EXISTS public.course_includes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_course_includes_course
  ON public.course_includes (course_id, sort_order ASC);

CREATE TABLE IF NOT EXISTS public.course_target_audience (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_course_target_audience_course
  ON public.course_target_audience (course_id, sort_order ASC);

-- ── Enrollments & progress ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.course_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled')),
  progress_percent numeric NOT NULL DEFAULT 0,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  enrolled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  UNIQUE (course_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_course_enrollments_student
  ON public.course_enrollments (student_id, enrolled_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_course
  ON public.course_enrollments (course_id, status);

CREATE TABLE IF NOT EXISTS public.course_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.course_enrollments(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.course_lessons(id) ON DELETE CASCADE,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  UNIQUE (enrollment_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_course_progress_enrollment
  ON public.course_progress (enrollment_id);

-- ── Reviews ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.course_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_reviews_course_status
  ON public.course_reviews (course_id, status, created_at DESC);

-- ── Certificates ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.course_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL UNIQUE REFERENCES public.course_enrollments(id) ON DELETE CASCADE,
  certificate_code text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  template_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- ── Leads ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.course_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  phone text,
  email text,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),
  assigned_staff_id uuid REFERENCES public.admin_staff(id) ON DELETE SET NULL,
  follow_up_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_leads_status
  ON public.course_leads (status, created_at DESC);

-- ── Wishlist ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.course_wishlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_course_wishlist_student
  ON public.course_wishlist (student_id, created_at DESC);

-- ── Settings (singleton) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.course_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  currency text NOT NULL DEFAULT 'INR',
  default_instructor text,
  default_thumbnail_url text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.course_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ── RLS: categories ──────────────────────────────────────────────────────────
ALTER TABLE public.course_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active course_categories" ON public.course_categories;
CREATE POLICY "Public read active course_categories" ON public.course_categories
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Admins manage course_categories" ON public.course_categories;
CREATE POLICY "Admins manage course_categories" ON public.course_categories
  FOR ALL TO authenticated
  USING (public.caller_can_manage_courses())
  WITH CHECK (public.caller_can_manage_courses());

-- ── RLS: courses ─────────────────────────────────────────────────────────────
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read published courses" ON public.courses;
CREATE POLICY "Public read published courses" ON public.courses
  FOR SELECT TO anon, authenticated
  USING (status = 'published');

DROP POLICY IF EXISTS "Admins manage courses" ON public.courses;
CREATE POLICY "Admins manage courses" ON public.courses
  FOR ALL TO authenticated
  USING (public.caller_can_manage_courses())
  WITH CHECK (public.caller_can_manage_courses());

-- ── RLS helper: published course child rows ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.course_is_published(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = p_course_id AND c.status = 'published'
  );
$$;

GRANT EXECUTE ON FUNCTION public.course_is_published(uuid) TO anon, authenticated;

-- ── RLS: modules & lessons ─────────────────────────────────────────────────────
ALTER TABLE public.course_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read published course_modules" ON public.course_modules;
CREATE POLICY "Public read published course_modules" ON public.course_modules
  FOR SELECT TO anon, authenticated
  USING (public.course_is_published(course_id));

DROP POLICY IF EXISTS "Admins manage course_modules" ON public.course_modules;
CREATE POLICY "Admins manage course_modules" ON public.course_modules
  FOR ALL TO authenticated
  USING (public.caller_can_manage_courses())
  WITH CHECK (public.caller_can_manage_courses());

DROP POLICY IF EXISTS "Public read published course_lessons" ON public.course_lessons;
CREATE POLICY "Public read published course_lessons" ON public.course_lessons
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.course_modules m
      WHERE m.id = module_id AND public.course_is_published(m.course_id)
    )
  );

DROP POLICY IF EXISTS "Admins manage course_lessons" ON public.course_lessons;
CREATE POLICY "Admins manage course_lessons" ON public.course_lessons
  FOR ALL TO authenticated
  USING (public.caller_can_manage_courses())
  WITH CHECK (public.caller_can_manage_courses());

-- ── RLS: list tables ─────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'course_learning_points',
    'course_requirements',
    'course_includes',
    'course_target_audience'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Public read published ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (public.course_is_published(course_id))',
      'Public read published ' || t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Admins manage ' || t, t);
    EXECUTE format(
      $pol$
      CREATE POLICY %I ON public.%I
        FOR ALL TO authenticated
        USING (public.caller_can_manage_courses())
        WITH CHECK (public.caller_can_manage_courses())
      $pol$,
      'Admins manage ' || t, t
    );
  END LOOP;
END $$;

-- ── RLS: enrollments ─────────────────────────────────────────────────────────
ALTER TABLE public.course_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students read own enrollments" ON public.course_enrollments;
CREATE POLICY "Students read own enrollments" ON public.course_enrollments
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Students enroll self" ON public.course_enrollments;
CREATE POLICY "Students enroll self" ON public.course_enrollments
  FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage enrollments" ON public.course_enrollments;
CREATE POLICY "Admins manage enrollments" ON public.course_enrollments
  FOR ALL TO authenticated
  USING (public.caller_can_manage_courses())
  WITH CHECK (public.caller_can_manage_courses());

-- ── RLS: progress ────────────────────────────────────────────────────────────
ALTER TABLE public.course_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students manage own progress" ON public.course_progress;
CREATE POLICY "Students manage own progress" ON public.course_progress
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.course_enrollments e
      WHERE e.id = enrollment_id AND e.student_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.course_enrollments e
      WHERE e.id = enrollment_id AND e.student_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins manage progress" ON public.course_progress;
CREATE POLICY "Admins manage progress" ON public.course_progress
  FOR ALL TO authenticated
  USING (public.caller_can_manage_courses())
  WITH CHECK (public.caller_can_manage_courses());

-- ── RLS: reviews ───────────────────────────────────────────────────────────────
ALTER TABLE public.course_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read approved reviews" ON public.course_reviews;
CREATE POLICY "Public read approved reviews" ON public.course_reviews
  FOR SELECT TO anon, authenticated
  USING (status = 'approved');

DROP POLICY IF EXISTS "Students read own reviews" ON public.course_reviews;
CREATE POLICY "Students read own reviews" ON public.course_reviews
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Students insert own reviews" ON public.course_reviews;
CREATE POLICY "Students insert own reviews" ON public.course_reviews
  FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage reviews" ON public.course_reviews;
CREATE POLICY "Admins manage reviews" ON public.course_reviews
  FOR ALL TO authenticated
  USING (public.caller_can_manage_courses())
  WITH CHECK (public.caller_can_manage_courses());

-- ── RLS: certificates ────────────────────────────────────────────────────────
ALTER TABLE public.course_certificates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students read own certificates" ON public.course_certificates;
CREATE POLICY "Students read own certificates" ON public.course_certificates
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.course_enrollments e
      WHERE e.id = enrollment_id AND e.student_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins manage certificates" ON public.course_certificates;
CREATE POLICY "Admins manage certificates" ON public.course_certificates
  FOR ALL TO authenticated
  USING (public.caller_can_manage_courses())
  WITH CHECK (public.caller_can_manage_courses());

-- ── RLS: leads ─────────────────────────────────────────────────────────────────
ALTER TABLE public.course_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public insert course leads" ON public.course_leads;
CREATE POLICY "Public insert course leads" ON public.course_leads
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins manage course leads" ON public.course_leads;
CREATE POLICY "Admins manage course_leads" ON public.course_leads
  FOR ALL TO authenticated
  USING (public.caller_can_manage_courses())
  WITH CHECK (public.caller_can_manage_courses());

-- ── RLS: wishlist ──────────────────────────────────────────────────────────────
ALTER TABLE public.course_wishlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students manage own wishlist" ON public.course_wishlist;
CREATE POLICY "Students manage own wishlist" ON public.course_wishlist
  FOR ALL TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage wishlist" ON public.course_wishlist;
CREATE POLICY "Admins manage wishlist" ON public.course_wishlist
  FOR ALL TO authenticated
  USING (public.caller_can_manage_courses())
  WITH CHECK (public.caller_can_manage_courses());

-- ── RLS: settings ──────────────────────────────────────────────────────────────
ALTER TABLE public.course_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read course_settings" ON public.course_settings;
CREATE POLICY "Public read course_settings" ON public.course_settings
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins manage course_settings" ON public.course_settings;
CREATE POLICY "Admins manage course_settings" ON public.course_settings
  FOR ALL TO authenticated
  USING (public.caller_can_manage_courses())
  WITH CHECK (public.caller_can_manage_courses());

-- ── Grants ─────────────────────────────────────────────────────────────────────
GRANT SELECT ON public.course_categories TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_categories TO authenticated;

GRANT SELECT ON public.courses TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;

GRANT SELECT ON public.course_modules TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_modules TO authenticated;

GRANT SELECT ON public.course_lessons TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_lessons TO authenticated;

GRANT SELECT ON public.course_learning_points TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_learning_points TO authenticated;

GRANT SELECT ON public.course_requirements TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_requirements TO authenticated;

GRANT SELECT ON public.course_includes TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_includes TO authenticated;

GRANT SELECT ON public.course_target_audience TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_target_audience TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_enrollments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_progress TO authenticated;

GRANT SELECT ON public.course_reviews TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_reviews TO authenticated;

GRANT SELECT ON public.course_certificates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_certificates TO authenticated;

GRANT INSERT ON public.course_leads TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_leads TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_wishlist TO authenticated;

GRANT SELECT ON public.course_settings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_settings TO authenticated;

-- ── Seed categories ────────────────────────────────────────────────────────────
INSERT INTO public.course_categories (id, name, slug, description, is_active, sort_order)
VALUES
  ('a1000001-0001-4001-8001-000000000001', 'Technology', 'technology', 'Programming, cloud, and software skills', true, 1),
  ('a1000001-0001-4001-8001-000000000002', 'Business', 'business', 'Management, marketing, and entrepreneurship', true, 2),
  ('a1000001-0001-4001-8001-000000000003', 'Design', 'design', 'UI/UX, graphics, and creative tools', true, 3),
  ('a1000001-0001-4001-8001-000000000004', 'Career Skills', 'career-skills', 'Interview prep, communication, and soft skills', true, 4)
ON CONFLICT (slug) DO NOTHING;

-- ── Seed courses ───────────────────────────────────────────────────────────────
INSERT INTO public.courses (
  id, title, slug, category_id, subcategory, instructor_name,
  thumbnail_url, short_description, full_description,
  original_price_paise, discount_price_paise, is_free,
  duration_text, language, difficulty, status, is_featured,
  rating_avg, rating_count, students_count, lessons_count, modules_count, published_at
)
VALUES
  (
    'b2000001-0001-4001-8001-000000000001',
    'Full Stack Web Development Bootcamp',
    'full-stack-web-development',
    'a1000001-0001-4001-8001-000000000001',
    'Web Development',
    'Dr. Rajesh Kumar',
    'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800&q=80',
    'Master HTML, CSS, JavaScript, React, and Node.js with hands-on projects.',
    'A comprehensive bootcamp covering front-end and back-end development. Build real-world projects and deploy them to production.',
    499900, 299900, false,
    '12 weeks', 'English', 'intermediate', 'published', true,
    4.7, 128, 842, 24, 4, now() - interval '30 days'
  ),
  (
    'b2000001-0001-4001-8001-000000000002',
    'Python for Data Science',
    'python-for-data-science',
    'a1000001-0001-4001-8001-000000000001',
    'Data Science',
    'Prof. Ananya Sharma',
    'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&q=80',
    'Learn Python, pandas, NumPy, and matplotlib for data analysis.',
    'Start from Python basics and progress to data wrangling, visualization, and introductory machine learning.',
    399900, 199900, false,
    '8 weeks', 'English', 'beginner', 'published', true,
    4.5, 96, 615, 18, 3, now() - interval '14 days'
  ),
  (
    'b2000001-0001-4001-8001-000000000003',
    'Digital Marketing Essentials',
    'digital-marketing-essentials',
    'a1000001-0001-4001-8001-000000000002',
    'Marketing',
    'Ms. Priya Menon',
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80',
    'SEO, social media, content marketing, and analytics for beginners.',
    'Free introductory course on digital marketing fundamentals for UG students and early-career professionals.',
    0, 0, true,
    '4 weeks', 'English', 'beginner', 'published', false,
    4.3, 54, 1203, 12, 2, now() - interval '7 days'
  )
ON CONFLICT (slug) DO NOTHING;

-- Modules & lessons for course 1
INSERT INTO public.course_modules (id, course_id, title, sort_order) VALUES
  ('c3000001-0001-4001-8001-000000000001', 'b2000001-0001-4001-8001-000000000001', 'HTML & CSS Fundamentals', 1),
  ('c3000001-0001-4001-8001-000000000002', 'b2000001-0001-4001-8001-000000000001', 'JavaScript Essentials', 2),
  ('c3000001-0001-4001-8001-000000000003', 'b2000001-0001-4001-8001-000000000001', 'React & Front-end', 3),
  ('c3000001-0001-4001-8001-000000000004', 'b2000001-0001-4001-8001-000000000001', 'Node.js & APIs', 4)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.course_lessons (module_id, title, duration_minutes, sort_order) VALUES
  ('c3000001-0001-4001-8001-000000000001', 'Introduction to the Web', 15, 1),
  ('c3000001-0001-4001-8001-000000000001', 'HTML Structure & Semantics', 25, 2),
  ('c3000001-0001-4001-8001-000000000001', 'CSS Layouts & Flexbox', 30, 3),
  ('c3000001-0001-4001-8001-000000000002', 'Variables & Functions', 20, 1),
  ('c3000001-0001-4001-8001-000000000002', 'DOM Manipulation', 25, 2),
  ('c3000001-0001-4001-8001-000000000003', 'React Components', 30, 1),
  ('c3000001-0001-4001-8001-000000000003', 'State & Hooks', 35, 2),
  ('c3000001-0001-4001-8001-000000000004', 'Building REST APIs', 40, 1),
  ('c3000001-0001-4001-8001-000000000004', 'Deployment Basics', 20, 2)
ON CONFLICT DO NOTHING;

-- Learning points for course 1
INSERT INTO public.course_learning_points (course_id, body, sort_order) VALUES
  ('b2000001-0001-4001-8001-000000000001', 'Build responsive websites from scratch', 1),
  ('b2000001-0001-4001-8001-000000000001', 'Create full-stack applications with React and Node.js', 2),
  ('b2000001-0001-4001-8001-000000000001', 'Deploy projects to cloud hosting', 3)
ON CONFLICT DO NOTHING;

INSERT INTO public.course_requirements (course_id, body, sort_order) VALUES
  ('b2000001-0001-4001-8001-000000000001', 'Basic computer literacy', 1),
  ('b2000001-0001-4001-8001-000000000001', 'No prior programming experience required', 2)
ON CONFLICT DO NOTHING;

INSERT INTO public.course_includes (course_id, body, sort_order) VALUES
  ('b2000001-0001-4001-8001-000000000001', '24 video lessons', 1),
  ('b2000001-0001-4001-8001-000000000001', 'Downloadable resources', 2),
  ('b2000001-0001-4001-8001-000000000001', 'Certificate of completion', 3)
ON CONFLICT DO NOTHING;

INSERT INTO public.course_target_audience (course_id, body, sort_order) VALUES
  ('b2000001-0001-4001-8001-000000000001', 'UG students pursuing CS/IT degrees', 1),
  ('b2000001-0001-4001-8001-000000000001', 'Career switchers entering tech', 2)
ON CONFLICT DO NOTHING;

-- Modules for course 2
INSERT INTO public.course_modules (id, course_id, title, sort_order) VALUES
  ('c3000001-0001-4001-8001-000000000005', 'b2000001-0001-4001-8001-000000000002', 'Python Basics', 1),
  ('c3000001-0001-4001-8001-000000000006', 'b2000001-0001-4001-8001-000000000002', 'Data Analysis with pandas', 2),
  ('c3000001-0001-4001-8001-000000000007', 'b2000001-0001-4001-8001-000000000002', 'Visualization & Insights', 3)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.course_lessons (module_id, title, duration_minutes, sort_order) VALUES
  ('c3000001-0001-4001-8001-000000000005', 'Python Syntax & Data Types', 20, 1),
  ('c3000001-0001-4001-8001-000000000005', 'Control Flow & Functions', 25, 2),
  ('c3000001-0001-4001-8001-000000000006', 'Working with DataFrames', 30, 1),
  ('c3000001-0001-4001-8001-000000000006', 'Data Cleaning Techniques', 25, 2),
  ('c3000001-0001-4001-8001-000000000007', 'matplotlib Charts', 20, 1),
  ('c3000001-0001-4001-8001-000000000007', 'Case Study Project', 45, 2)
ON CONFLICT DO NOTHING;

INSERT INTO public.course_learning_points (course_id, body, sort_order) VALUES
  ('b2000001-0001-4001-8001-000000000002', 'Analyze datasets with Python', 1),
  ('b2000001-0001-4001-8001-000000000002', 'Create insightful visualizations', 2)
ON CONFLICT DO NOTHING;

-- Modules for course 3
INSERT INTO public.course_modules (id, course_id, title, sort_order) VALUES
  ('c3000001-0001-4001-8001-000000000008', 'b2000001-0001-4001-8001-000000000003', 'Marketing Foundations', 1),
  ('c3000001-0001-4001-8001-000000000009', 'b2000001-0001-4001-8001-000000000003', 'Channels & Analytics', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.course_lessons (module_id, title, duration_minutes, sort_order) VALUES
  ('c3000001-0001-4001-8001-000000000008', 'What is Digital Marketing?', 15, 1),
  ('c3000001-0001-4001-8001-000000000008', 'Brand Building Basics', 20, 2),
  ('c3000001-0001-4001-8001-000000000009', 'SEO Fundamentals', 25, 1),
  ('c3000001-0001-4001-8001-000000000009', 'Social Media Strategy', 25, 2)
ON CONFLICT DO NOTHING;
