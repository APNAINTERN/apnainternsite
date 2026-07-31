-- Site Gallery + Consult Letter (Admin-managed public content).
-- Gallery: many images. Consult letter: single active PDF (new upload replaces previous).

CREATE TABLE IF NOT EXISTS public.site_gallery_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  caption text,
  image_url text NOT NULL,
  image_path text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_gallery_active_sort
  ON public.site_gallery_images (is_active, sort_order ASC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.site_consult_letter (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  file_url text,
  file_path text,
  file_name text,
  mime_type text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.site_consult_letter (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.site_gallery_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_consult_letter ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active gallery" ON public.site_gallery_images;
CREATE POLICY "Public read active gallery"
  ON public.site_gallery_images
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Admins manage gallery" ON public.site_gallery_images;
CREATE POLICY "Admins manage gallery"
  ON public.site_gallery_images
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Public read consult letter" ON public.site_consult_letter;
CREATE POLICY "Public read consult letter"
  ON public.site_consult_letter
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins manage consult letter" ON public.site_consult_letter;
CREATE POLICY "Admins manage consult letter"
  ON public.site_consult_letter
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

GRANT SELECT ON public.site_gallery_images TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_gallery_images TO authenticated;
GRANT SELECT ON public.site_consult_letter TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_consult_letter TO authenticated;
