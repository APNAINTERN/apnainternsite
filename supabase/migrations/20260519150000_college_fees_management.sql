-- Per-college fee breakdown (admin-managed). Backfill mirrors src/lib/feeRules.ts.

ALTER TABLE public.colleges
  ADD COLUMN IF NOT EXISTS fee_base_paise INTEGER,
  ADD COLUMN IF NOT EXISTS fee_processing_paise INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS show_fee_breakdown BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fees_managed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.colleges.fee_base_paise IS 'Registration/course component (paise); used when show_fee_breakdown is true.';
COMMENT ON COLUMN public.colleges.fee_processing_paise IS 'Processing/GST component (paise).';
COMMENT ON COLUMN public.colleges.show_fee_breakdown IS 'When true, students see base + processing lines before total.';
COMMENT ON COLUMN public.colleges.fees_managed IS 'When true, registration uses DB fee fields instead of code feeRules.';

-- 1) Non-LNMU / non-special: flat total from existing pisa_fee (or ₹500 default).
UPDATE public.colleges c
SET
  pisa_fee = COALESCE(NULLIF(c.pisa_fee, 0), 50000),
  fee_base_paise = COALESCE(NULLIF(c.pisa_fee, 0), 50000),
  fee_processing_paise = 0,
  show_fee_breakdown = false,
  fees_managed = true
FROM public.universities u
WHERE u.id = c.university_id
  AND NOT (
    u.name ~* 'lalit\s*narayan|lnmu|mithila|bnmu|bhupendra\s*narayan\s*mandal'
  );

-- 2) BNMU flat ₹249 colleges
UPDATE public.colleges c
SET
  pisa_fee = 24900,
  fee_base_paise = 24900,
  fee_processing_paise = 0,
  show_fee_breakdown = false,
  fees_managed = true
FROM public.universities u
WHERE
  u.id = c.university_id
  AND (u.name ILIKE '%bnmu%' OR u.name ILIKE '%bhupendra%narayan%mand%')
  AND (
    (
      c.name ILIKE '%saharsa%'
      AND (
        c.name ILIKE '%tekriwal%'
        OR c.name ~* 'm\.?\s*l\.?\s*t'
        OR c.name ILIKE '%manohar%lal%'
      )
    )
    OR (
      c.name ILIKE '%saharsa%'
      AND c.name ILIKE '%sarb%narayan%'
      AND c.name ILIKE '%ram%kumar%'
    )
    OR (c.name ILIKE '%madhepura%' AND c.name ILIKE '%vanijya%')
  );

-- 3) Other BNMU: keep pisa_fee, flat display
UPDATE public.colleges c
SET
  pisa_fee = COALESCE(NULLIF(c.pisa_fee, 0), 50000),
  fee_base_paise = COALESCE(NULLIF(c.pisa_fee, 0), 50000),
  fee_processing_paise = 0,
  show_fee_breakdown = false,
  fees_managed = true
FROM public.universities u
WHERE
  u.id = c.university_id
  AND (u.name ILIKE '%bnmu%' OR u.name ILIKE '%bhupendra%narayan%mand%')
  AND c.fees_managed IS NOT TRUE;

-- 4) LNMU flat ₹500
UPDATE public.colleges c
SET
  pisa_fee = 50000,
  fee_base_paise = 50000,
  fee_processing_paise = 0,
  show_fee_breakdown = false,
  fees_managed = true
FROM public.universities u
WHERE
  u.id = c.university_id
  AND (u.name ~* 'lalit\s*narayan|lnmu|mithila')
  AND (
    (
      c.name ~* 'dalsinghsarai|dalsighsarai'
      AND c.name ~* 'r[\s.]*b'
    )
    OR (c.name ILIKE '%rahika%' AND c.name ~* 'b[\s.]*m')
    OR c.name ILIKE '%millat%'
  );

-- 5) LNMU flat ₹499 (MRSM)
UPDATE public.colleges c
SET
  pisa_fee = 49900,
  fee_base_paise = 49900,
  fee_processing_paise = 0,
  show_fee_breakdown = false,
  fees_managed = true
FROM public.universities u
WHERE
  u.id = c.university_id
  AND (u.name ~* 'lalit\s*narayan|lnmu|mithila')
  AND c.name ILIKE '%mrsm%';

-- 6) LNMU GKPD ₹549 with breakdown
UPDATE public.colleges c
SET
  pisa_fee = 54900,
  fee_base_paise = 50000,
  fee_processing_paise = 4900,
  show_fee_breakdown = true,
  fees_managed = true
FROM public.universities u
WHERE
  u.id = c.university_id
  AND (u.name ~* 'lalit\s*narayan|lnmu|mithila')
  AND c.name ~* 'karpoori'
  AND c.name ~* 'g[\s.]*k[\s.]*p[\s.]*d';

-- 7) LNMU ₹600 exceptions (Marwari, JK Biraul, RCSS Bihat, MRJD Begusarai)
UPDATE public.colleges c
SET
  pisa_fee = 60000,
  fee_base_paise = 55100,
  fee_processing_paise = 4900,
  show_fee_breakdown = true,
  fees_managed = true
FROM public.universities u
WHERE
  u.id = c.university_id
  AND (u.name ~* 'lalit\s*narayan|lnmu|mithila')
  AND (
    c.name ILIKE '%marwari%'
    OR (c.name ILIKE '%biraul%' AND c.name ~* 'j[\s.]*k')
    OR (c.name ILIKE '%bihat%' AND c.name ~* 'r[\s.]*c[\s.]*s[\s.]*s')
    OR (c.name ILIKE '%begusarai%' AND c.name ~* 'm[\s.]*r[\s.]*j[\s.]*d')
  );

-- 8) LNMU default ₹549 with breakdown (remaining LNMU colleges)
UPDATE public.colleges c
SET
  pisa_fee = 54900,
  fee_base_paise = 50000,
  fee_processing_paise = 4900,
  show_fee_breakdown = true,
  fees_managed = true
FROM public.universities u
WHERE
  u.id = c.university_id
  AND (u.name ~* 'lalit\s*narayan|lnmu|mithila')
  AND c.fees_managed IS NOT TRUE;

-- Ensure fee_base is always set when managed
UPDATE public.colleges
SET fee_base_paise = GREATEST(0, pisa_fee - fee_processing_paise)
WHERE fees_managed = true AND fee_base_paise IS NULL;
