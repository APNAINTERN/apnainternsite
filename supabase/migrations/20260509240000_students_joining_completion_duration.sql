-- Offer letter + profile edits store internship window and duration on students;
-- client upserts these columns — without them PostgREST returns schema cache errors.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS joining_date TEXT,
  ADD COLUMN IF NOT EXISTS completion_date TEXT,
  ADD COLUMN IF NOT EXISTS internship_duration TEXT;

COMMENT ON COLUMN public.students.joining_date IS 'Internship start (typically ISO date from UI)';
COMMENT ON COLUMN public.students.completion_date IS 'Internship end (typically ISO date from UI)';
COMMENT ON COLUMN public.students.internship_duration IS 'Human-readable duration e.g. 120 Hours';
