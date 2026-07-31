-- Tag students added earlier via Add Registration so they appear in Added Registrations
-- and show "Added through Registration" in the student directory.
-- Safe to run more than once.

-- 1) From admin audit logs (most accurate for manual adds)
UPDATE public.students s
SET metadata = coalesce(s.metadata, '{}'::jsonb) || jsonb_build_object('source', 'admin_add_registration')
WHERE coalesce(trim(s.metadata->>'source'), '') = ''
  AND EXISTS (
    SELECT 1
    FROM public.admin_logs l
    WHERE l.description ILIKE '%added minimal registration%'
      AND (
        coalesce(l.metadata->>'student_id', '') = s.id::text
        OR lower(l.description) LIKE '%' || lower(trim(s.email)) || '%'
      )
  );

-- 2) Legacy rows: admin-created manual payment id, not already tagged as bulk upload
UPDATE public.students s
SET metadata = coalesce(s.metadata, '{}'::jsonb) || jsonb_build_object('source', 'admin_add_registration')
WHERE coalesce(trim(s.metadata->>'source'), '') = ''
  AND coalesce(s.metadata->>'razorpay_payment_id', '') LIKE 'pay_admin_manual_%'
  AND coalesce(s.metadata->>'source', '') <> 'admin_bulk_upload';

NOTIFY pgrst, 'reload schema';
