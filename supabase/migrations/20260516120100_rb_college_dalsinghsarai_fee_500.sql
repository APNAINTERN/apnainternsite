-- R. B. / RB College, Dalsinghsarai (LNMU): flat ₹500 (50000 paise).
-- Run after universities exist; scoped to LNMU-like university names.

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
  AND (
    c.name ILIKE '%dalsinghsarai%'
    OR c.name ILIKE '%dalsighsarai%'
  )
  AND (
    c.name ILIKE '%r. b.%'
    OR c.name ILIKE '%r.b.%'
    OR c.name ~* 'R[.\s]*B[.\s]*College'
    OR (c.name ILIKE '%rb%' AND c.name ILIKE '%college%')
  );
