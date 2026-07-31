-- Consent / NoC letter uploads for registration (anon) + student dashboard (authenticated).
-- Safe to re-run. Run in Supabase Dashboard → SQL Editor.
-- Fixes 400/403 on storage/v1/object/consent-forms/... during public engineering registration.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'consent-forms',
  'consent-forms',
  true,
  10485760,
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/gif'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/gif'
  ]::text[];

-- Drop old / conflicting policies
DROP POLICY IF EXISTS "Authenticated upload consent forms" ON storage.objects;
DROP POLICY IF EXISTS "Public upload consent forms" ON storage.objects;
DROP POLICY IF EXISTS "Anon and authenticated upload consent forms" ON storage.objects;
DROP POLICY IF EXISTS "Anyone read consent forms" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update own consent forms" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete consent forms" ON storage.objects;

-- Registration happens before login → anon must be allowed to INSERT.
CREATE POLICY "Anon and authenticated upload consent forms"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'consent-forms'
    AND (name LIKE 'consent-%' OR name LIKE 'consent/%' OR name LIKE 'noc-%' OR name LIKE 'noc/%')
  );

CREATE POLICY "Anyone read consent forms"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'consent-forms');

CREATE POLICY "Authenticated update own consent forms"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'consent-forms');

CREATE POLICY "Authenticated delete consent forms"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'consent-forms');

NOTIFY pgrst, 'reload schema';
