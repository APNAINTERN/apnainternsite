-- Add college_name column to payment_success table
ALTER TABLE public.payment_success ADD COLUMN IF NOT EXISTS college_name TEXT;

-- Update existing records if possible (though probably not many yet)
-- No easy way to backfill without joining other tables, will leave as null for now.
