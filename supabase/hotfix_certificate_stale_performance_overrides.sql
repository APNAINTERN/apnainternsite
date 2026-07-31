-- Remove stale attendance/marks/hours overrides saved from old real-data fetch (e.g. 0.0%, 0 Hours).
UPDATE public.certificates
SET display_overrides = display_overrides
  - 'attendancePercent'
  - 'totalHours'
  - 'marksPercent'
  - 'assessmentRating'
WHERE display_overrides ?| array['attendancePercent', 'totalHours', 'marksPercent', 'assessmentRating']
  AND (
    coalesce(display_overrides->>'attendancePercent', '') ~* '^0(\.0+)?%?$'
    OR coalesce(display_overrides->>'totalHours', '') ~* '^0\s*Hours?$'
    OR (
      coalesce(display_overrides->>'attendancePercent', '') <> ''
      AND coalesce(
        nullif(regexp_replace(display_overrides->>'attendancePercent', '[^0-9.]', '', 'g'), '')::numeric,
        -1
      ) NOT IN (85, 90, 95, 100)
    )
    OR (
      coalesce(display_overrides->>'marksPercent', '') <> ''
      AND coalesce(
        nullif(regexp_replace(display_overrides->>'marksPercent', '[^0-9.]', '', 'g'), '')::numeric,
        -1
      ) NOT IN (85, 90, 95, 100)
    )
  );
