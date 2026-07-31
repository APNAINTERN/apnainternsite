-- M. K. College, Laheriasarai, Darbhanga (single college name in DB) —
-- internship registration total ₹548 (₹499 + ₹49 processing), in paise.
-- Matches dotted initials "M. K." not the substring "mk".
-- Client: src/lib/feeRules.ts (same patterns).

UPDATE public.colleges c
SET pisa_fee = 54800
FROM public.universities u
WHERE c.university_id = u.id
  AND (
    u.name ILIKE '%lalit%narayan%'
    OR u.name ILIKE '%lnmu%'
    OR u.name ILIKE '%mithila%'
  )
  AND c.name ~* 'm\.?\s*k\.?\s*college'
  AND c.name ILIKE '%laheria%';
