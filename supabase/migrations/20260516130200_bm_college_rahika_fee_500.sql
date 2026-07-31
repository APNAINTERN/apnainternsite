-- BM College, Rahika (LNMU): flat ₹500 (50000 paise).
-- Client override: src/lib/feeRules.ts (LNMU_FLAT_500_COLLEGES).

UPDATE public.colleges c
SET pisa_fee = 50000
FROM public.universities u
WHERE
  u.id = c.university_id
  AND (
    u.name ILIKE '%lalit%narayan%'
    OR u.name ILIKE '%lnmu%'
    OR u.name ILIKE '%mithila%'
  )
  AND c.name ILIKE '%rahika%'
  AND (
    c.name ~* 'b[.\s]*m[.\s]*college'
    OR (c.name ILIKE '%college%' AND c.name ILIKE '%bm%' AND c.name ILIKE '%rahika%')
  );
