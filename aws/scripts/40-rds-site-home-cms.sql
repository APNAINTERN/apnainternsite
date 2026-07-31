-- Home page CMS: sample certificates, expert team, MOUs, offline programs, testimonials.
-- Public reads active rows only; admins (admin|super_admin) manage all.

-- 1) Sample certificates (image or PDF)
CREATE TABLE IF NOT EXISTS public.site_sample_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  description text,
  file_url text NOT NULL,
  file_path text,
  file_name text,
  mime_type text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_site_sample_certs_active_sort
  ON public.site_sample_certificates (is_active, sort_order ASC, created_at DESC);

-- 2) Expert team
CREATE TABLE IF NOT EXISTS public.site_expert_team (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL DEFAULT '',
  designation text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  bio text,
  photo_url text,
  photo_path text,
  social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_site_expert_team_active_sort
  ON public.site_expert_team (is_active, sort_order ASC, created_at DESC);

-- 3) MOUs
CREATE TABLE IF NOT EXISTS public.site_mous (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_name text NOT NULL DEFAULT '',
  description text,
  logo_url text,
  logo_path text,
  website_url text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_site_mous_active_sort
  ON public.site_mous (is_active, sort_order ASC, created_at DESC);

-- 4) Offline training & internship
CREATE TABLE IF NOT EXISTS public.site_offline_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  description text,
  duration text,
  location text,
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  image_url text,
  image_path text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_site_offline_programs_active_sort
  ON public.site_offline_programs (is_active, sort_order ASC, created_at DESC);

-- 5) Testimonials
CREATE TABLE IF NOT EXISTS public.site_testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL DEFAULT '',
  designation text,
  review text NOT NULL DEFAULT '',
  rating integer NOT NULL DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
  photo_url text,
  photo_path text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_site_testimonials_active_sort
  ON public.site_testimonials (is_active, sort_order ASC, created_at DESC);

-- RLS helpers (same pattern as site_gallery_images)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'site_sample_certificates',
    'site_expert_team',
    'site_mous',
    'site_offline_programs',
    'site_testimonials'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Public read active ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (is_active = true)',
      'Public read active ' || t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Admins manage ' || t, t);
    EXECUTE format(
      $pol$
      CREATE POLICY %I ON public.%I
        FOR ALL TO authenticated
        USING (
          public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
        )
        WITH CHECK (
          public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
        )
      $pol$,
      'Admins manage ' || t, t
    );

    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;
