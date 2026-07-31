-- Admin uploads: learning materials + project reports (targeted by uni / college / domain / mode).
-- Run once in Supabase SQL Editor (includes storage bucket + RLS).

CREATE TABLE IF NOT EXISTS public.learning_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  material_type text NOT NULL DEFAULT 'learning_material'
    CHECK (material_type IN ('learning_material', 'project_report')),
  file_path text,
  file_url text,
  file_name text,
  mime_type text,
  target_universities text[] DEFAULT '{}',
  target_colleges text[] DEFAULT '{}',
  target_domains text[] DEFAULT '{}',
  target_modes text[] DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learning_materials_type_active
  ON public.learning_materials (material_type, is_active, created_at DESC);

ALTER TABLE public.learning_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage learning materials" ON public.learning_materials;
CREATE POLICY "Admins manage learning materials"
  ON public.learning_materials
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'staff')
  );

DROP POLICY IF EXISTS "Students read active learning materials" ON public.learning_materials;
CREATE POLICY "Students read active learning materials"
  ON public.learning_materials
  FOR SELECT
  USING (is_active = true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_materials TO authenticated;

-- ─── Storage bucket for admin uploads (notes + project reports) ─────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('learning-materials', 'learning-materials', true, 26214400)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 26214400;

DROP POLICY IF EXISTS "Admins upload learning materials" ON storage.objects;
CREATE POLICY "Admins upload learning materials"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'learning-materials'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'staff')
    )
  );

DROP POLICY IF EXISTS "Anyone read learning materials" ON storage.objects;
CREATE POLICY "Anyone read learning materials"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'learning-materials');

DROP POLICY IF EXISTS "Admins delete learning materials" ON storage.objects;
CREATE POLICY "Admins delete learning materials"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'learning-materials'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'staff')
    )
  );

NOTIFY pgrst, 'reload schema';
