-- MLSM College (under LNMU) drops from ₹600 to ₹500 flat, all-inclusive.
-- Marwari and JK Biraul stay at ₹600 (handled by the earlier
-- 20260512090000_lnmu_flat_fee_600 migration).
--
-- The client also applies the same ₹500 override via src/lib/feeRules.ts as
-- a safety net in case the DB value is missing.

UPDATE public.colleges c
SET pisa_fee = 50000
FROM public.universities u
WHERE c.university_id = u.id
  AND (
    u.name ILIKE '%lalit%narayan%'
    OR u.name ILIKE '%lnmu%'
    OR u.name ILIKE '%mithila%'
  )
  AND c.name ~* 'm\.?\s*l\.?\s*s\.?\s*m\M';
