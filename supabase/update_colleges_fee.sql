-- Add registration_fee column to colleges table
ALTER TABLE public.colleges ADD COLUMN IF NOT EXISTS registration_fee INTEGER DEFAULT 50000;

-- Update existing colleges to have 50000 if null (though DEFAULT should handle it)
UPDATE public.colleges SET registration_fee = 50000 WHERE registration_fee IS NULL;

-- Special case for J. K. College, Biraul, Darbhanga
UPDATE public.colleges SET registration_fee = 60000 WHERE name = 'J. K. College, Biraul, Darbhanga';
