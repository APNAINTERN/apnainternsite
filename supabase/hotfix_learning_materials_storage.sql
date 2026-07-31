-- Fix "Bucket not found" when admin uploads learning materials / project reports.
-- Safe to re-run. Run in Supabase Dashboard → SQL Editor.

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
