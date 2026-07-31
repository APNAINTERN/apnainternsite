-- Fix L. N. J. College place-name typo only: Jhanjharupr → Jhanjharpur
-- Does NOT change P.L.M. College (separate LNMU college). Safe to re-run.

UPDATE public.colleges
SET name = regexp_replace(name, 'jhanjharupr', 'Jhanjharpur', 'gi')
WHERE name ~* 'jhanjharupr'
  AND name ~* 'l\.?\s*n\.?\s*j\.?';

UPDATE public.students
SET college_name = regexp_replace(college_name, 'jhanjharupr', 'Jhanjharpur', 'gi')
WHERE college_name ~* 'jhanjharupr'
  AND college_name ~* 'l\.?\s*n\.?\s*j\.?';

UPDATE public.prefilled_students
SET college_name = regexp_replace(college_name, 'jhanjharupr', 'Jhanjharpur', 'gi')
WHERE college_name ~* 'jhanjharupr'
  AND college_name ~* 'l\.?\s*n\.?\s*j\.?';

UPDATE public.payment_success
SET college_name = regexp_replace(college_name, 'jhanjharupr', 'Jhanjharpur', 'gi')
WHERE college_name ~* 'jhanjharupr'
  AND college_name ~* 'l\.?\s*n\.?\s*j\.?';
