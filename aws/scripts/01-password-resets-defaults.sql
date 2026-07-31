-- Fix password_resets after CSV import (NOT NULL id with no default → OTP insert fails).
-- Run against AWS RDS once:
--   psql "$DATABASE_URL" -f aws/scripts/01-password-resets-defaults.sql

ALTER TABLE public.password_resets
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.password_resets
  ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.password_resets
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '15 minutes');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'password_resets'
      AND column_name = 'otp'
      AND data_type = 'bigint'
  ) THEN
    ALTER TABLE public.password_resets
      ALTER COLUMN otp TYPE text USING otp::text;
  END IF;
END $$;

ALTER TABLE public.password_resets ALTER COLUMN email SET NOT NULL;
ALTER TABLE public.password_resets ALTER COLUMN otp SET NOT NULL;
