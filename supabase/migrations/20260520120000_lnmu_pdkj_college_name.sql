-- LNMU: shorten Prof. Chandra Shekhar Jha PDKJ college title for display and matching.

UPDATE public.colleges c
SET name = 'PDKJ College'
FROM public.universities u
WHERE
  u.id = c.university_id
  AND (
    u.name ILIKE '%lnmu%'
    OR u.name ILIKE '%lalit%narayan%mithila%'
    OR u.name ILIKE '%mithila%university%'
  )
  AND (
    c.name ILIKE '%pdkj%'
    OR (
      c.name ILIKE '%chandra%shekhar%jha%'
      AND c.name ILIKE '%prof%'
    )
  )
  AND c.name IS DISTINCT FROM 'PDKJ College';

-- Align stored student college_name with the canonical label.
UPDATE public.students s
SET college_name = 'PDKJ College'
WHERE
  s.college_name ILIKE '%pdkj%'
  AND s.college_name ILIKE '%prof%chandra%shekhar%jha%';

-- Roster rows use college_id (public.college_student_rosters); renaming colleges above is enough.
