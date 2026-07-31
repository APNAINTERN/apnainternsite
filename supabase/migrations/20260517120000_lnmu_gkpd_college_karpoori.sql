-- G.K.P.D. College, Karpoori Gram, Samastipur (LNMU): ₹549 (50000 + 4900 paise).
-- Client: src/lib/feeRules.ts (LNMU_REGISTRATION_549_COLLEGES).

INSERT INTO public.colleges (university_id, name, pisa_fee)
SELECT u.id, 'G.K.P.D. College Karpoori Gram, Samastipur', 54900
FROM public.universities u
WHERE
  u.name ILIKE '%lalit%narayan%'
  OR u.name ILIKE '%lnmu%'
  OR u.name ILIKE '%mithila%'
ORDER BY u.created_at
LIMIT 1
ON CONFLICT (university_id, name) DO UPDATE
SET pisa_fee = EXCLUDED.pisa_fee;

-- Align fee if college already exists under a slightly different spelling.
UPDATE public.colleges c
SET pisa_fee = 54900
FROM public.universities u
WHERE
  c.university_id = u.id
  AND (
    u.name ILIKE '%lalit%narayan%'
    OR u.name ILIKE '%lnmu%'
    OR u.name ILIKE '%mithila%'
  )
  AND c.name ILIKE '%karpoori%'
  AND c.name ~* 'g[.\s]*k[.\s]*p[.\s]*d';
