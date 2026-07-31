-- Admin-editable certificate field overrides (roll, college, marks, etc.)

ALTER TABLE public.certificates
  ADD COLUMN IF NOT EXISTS display_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
