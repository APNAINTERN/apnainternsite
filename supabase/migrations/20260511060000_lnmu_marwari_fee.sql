-- LNMU Marwari College students pay a flat ₹549 (₹500 + ₹49 GST + processing).
-- Stored in paise on the college row so the existing registration flow
-- (college.pisa_fee → university.pisa_fee → payment_config.amount_paise) picks it up.

UPDATE public.colleges c
SET pisa_fee = 54900
FROM public.universities u
WHERE c.university_id = u.id
  AND c.name ILIKE '%marwari%'
  AND (
    u.name ILIKE '%lalit%narayan%'
    OR u.name ILIKE '%lnmu%'
    OR u.name ILIKE '%mithila%'
  );
