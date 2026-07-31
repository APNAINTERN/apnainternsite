-- LNMU flat-fee colleges (Marwari, JK College Biraul, MLSM) — ₹600 each.
-- Stored in paise on the college row so the existing registration flow
-- (college.pisa_fee → university.pisa_fee → payment_config.amount_paise)
-- picks it up. The client also applies the same ₹600 (₹551 + ₹49 GST)
-- via src/lib/feeRules.ts as a safety net in case the DB value is missing.
--
-- Supersedes the earlier 20260511060000_lnmu_marwari_fee.sql price (₹549).

UPDATE public.colleges c
SET pisa_fee = 60000
FROM public.universities u
WHERE c.university_id = u.id
  AND (
    u.name ILIKE '%lalit%narayan%'
    OR u.name ILIKE '%lnmu%'
    OR u.name ILIKE '%mithila%'
  )
  AND (
    c.name ILIKE '%marwari%'
    -- MLSM is stored as "M. L. S. M. College, Darbhanga" — allow dots/spaces.
    OR c.name ~* 'm\.?\s*l\.?\s*s\.?\s*m\M'
    OR (c.name ~* '\mj\.?\s*k\M' AND c.name ILIKE '%biraul%')
  );
