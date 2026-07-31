-- Plaintext copy for admin “Resend credentials” (login truth remains in auth.users).
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS password TEXT;

COMMENT ON COLUMN public.students.password IS 'Optional directory copy of login password for admin emails; not the auth hash.';
