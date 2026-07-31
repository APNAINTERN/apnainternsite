-- BNMU colleges: flat ₹249 (24900 paise).
-- Client override: src/lib/feeRules.ts (BNMU_FLAT_249_COLLEGES).

UPDATE public.colleges c
SET pisa_fee = 24900
FROM public.universities u
WHERE
  u.id = c.university_id
  AND (
    u.name ILIKE '%bnmu%'
    OR u.name ILIKE '%bhupendra%narayan%mand%'
  )
  AND (
  -- Manohar Lal Tekriwal (MLT) College, Saharsa
    (
      c.name ILIKE '%saharsa%'
      AND (
        c.name ILIKE '%tekriwal%'
        OR c.name ~* 'm\.?\s*l\.?\s*t'
        OR c.name ILIKE '%manohar%lal%'
      )
    )
    OR
  -- Sarb Narayan Singh Ram Kumar Singh College, Saharsa
    (
      c.name ILIKE '%saharsa%'
      AND c.name ILIKE '%sarb%narayan%'
      AND c.name ILIKE '%ram%kumar%'
    )
    OR
  -- Bhupendra Narayan Mandal Vanijya Mahavidyalaya, Madhepura
    (
      c.name ILIKE '%madhepura%'
      AND c.name ILIKE '%vanijya%'
    )
  );
