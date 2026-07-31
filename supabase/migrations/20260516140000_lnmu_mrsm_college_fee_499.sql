-- MRSM College (LNMU): flat ₹499 (49900 paise).
-- Client override: src/lib/feeRules.ts (LNMU_FLAT_499_COLLEGES).

UPDATE public.colleges c
SET pisa_fee = 49900
FROM public.universities u
WHERE
  u.id = c.university_id
  AND (
    u.name ILIKE '%lalit%narayan%'
    OR u.name ILIKE '%lnmu%'
    OR u.name ILIKE '%mithila%'
  )
  AND (
    c.name ILIKE '%mrsm%'
    OR c.name ~* 'm\.?\s*r\.?\s*s\.?\s*m'
  );
