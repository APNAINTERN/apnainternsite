-- Set default registration fee for all colleges under Engineering Management:
-- ₹500 registration + ₹49 processing = ₹549 total (fees_managed).
-- Updates:
--   • colleges not yet fee-managed / with no fee
--   • flat ₹500 backfills (no processing fee)
-- Leaves other custom Fees Management amounts (e.g. ₹600) unchanged.
-- Run in Supabase SQL Editor.

-- Preview:
SELECT c.id, c.name, u.name AS university_name,
       c.pisa_fee, c.fee_processing_paise, c.fees_managed, c.show_fee_breakdown
FROM public.colleges c
JOIN public.universities u ON u.id = c.university_id
WHERE EXISTS (
  SELECT 1
  FROM public.engineering_university_configs euc
  WHERE euc.university_id = c.university_id
)
AND (
  c.fees_managed IS NOT TRUE
  OR COALESCE(c.pisa_fee, 0) <= 0
  OR (c.pisa_fee = 50000 AND COALESCE(c.fee_processing_paise, 0) = 0)
)
ORDER BY u.name, c.name;

-- Apply default ₹549:
UPDATE public.colleges c
SET
  pisa_fee = 54900,
  fee_base_paise = 50000,
  fee_processing_paise = 4900,
  show_fee_breakdown = true,
  fees_managed = true
WHERE EXISTS (
  SELECT 1
  FROM public.engineering_university_configs euc
  WHERE euc.university_id = c.university_id
)
AND (
  c.fees_managed IS NOT TRUE
  OR COALESCE(c.pisa_fee, 0) <= 0
  OR (c.pisa_fee = 50000 AND COALESCE(c.fee_processing_paise, 0) = 0)
);
