-- Cleanup helper: engineering college names that were wrongly split on commas
-- (e.g. "Government Engineering College, Patna" → "Government Engineering College" + "Patna").
-- Review rows before deleting. Run in Supabase SQL Editor after the app fix is deployed.
--
-- 1) Find likely location-only orphan college names (short / city-like) under engineering unis:

SELECT c.id, c.name AS college_name, u.name AS university_name, c.created_at
FROM public.colleges c
JOIN public.universities u ON u.id = c.university_id
WHERE EXISTS (
  SELECT 1
  FROM public.engineering_university_configs euc
  WHERE euc.university_id = c.university_id
)
AND (
  length(trim(c.name)) <= 40
  AND c.name !~* 'college|institute|university|polytechnic|technology|engineering|school'
)
ORDER BY u.name, c.name;

-- 2) After confirming orphans, delete specific ids (example — replace with real ids):
-- DELETE FROM public.colleges WHERE id IN ('...');

-- 3) Re-save the Eng. Management config with correct full names (one per line) so missing
--    "Name, City" colleges are inserted again.
