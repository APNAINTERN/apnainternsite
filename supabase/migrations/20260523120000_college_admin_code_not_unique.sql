-- One college admin has the same sign-in code on every assigned college row.
-- Global UNIQUE(college_admin_code) caused: duplicate key violates unique constraint
-- "college_admin_assignments_code_key" when assigning 2+ colleges.

ALTER TABLE public.college_admin_assignments
  DROP CONSTRAINT IF EXISTS college_admin_assignments_code_key;
