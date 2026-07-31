-- Add pisa_fee column to universities table (Default 500 INR = 50000 Paise)
ALTER TABLE public.universities ADD COLUMN IF NOT EXISTS pisa_fee INTEGER DEFAULT 50000;

-- Add pisa_fee column to colleges table (Default 500 INR = 50000 Paise)
ALTER TABLE public.colleges ADD COLUMN IF NOT EXISTS pisa_fee INTEGER DEFAULT 50000;

-- Update existing records to have 50000 if null or 0
UPDATE public.universities SET pisa_fee = 50000 WHERE pisa_fee IS NULL OR pisa_fee = 0;
UPDATE public.colleges SET pisa_fee = 50000 WHERE pisa_fee IS NULL OR pisa_fee = 0;
