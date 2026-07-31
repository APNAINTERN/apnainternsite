-- The original migration created a unique *expression index* on
-- lower(reference_number). That works for queries but does NOT satisfy
-- `ON CONFLICT (reference_number)` used by the admin roster import.
-- Adding a regular unique constraint so the upsert path is happy.

ALTER TABLE public.prefilled_students
  ADD CONSTRAINT prefilled_students_reference_number_key UNIQUE (reference_number);
