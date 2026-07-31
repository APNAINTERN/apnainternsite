-- Create ID Card Generations table
CREATE TABLE IF NOT EXISTS public.id_card_generations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    card_number text UNIQUE NOT NULL,
    user_id text,
    user_name text,
    user_email text,
    category text,
    generated_by text,
    generated_at timestamptz DEFAULT now(),
    status text DEFAULT 'generated',
    metadata jsonb
);

-- Enable RLS
ALTER TABLE public.id_card_generations ENABLE ROW LEVEL SECURITY;

-- Admins can manage all records
CREATE POLICY "Admins can manage id_card_generations"
    ON public.id_card_generations
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role IN ('admin', 'super_admin')
        )
    );

-- Create a table to track serial numbers per category
CREATE TABLE IF NOT EXISTS public.id_card_sequences (
    category_code text PRIMARY KEY,
    current_serial integer DEFAULT 0
);

-- Enable RLS for sequences
ALTER TABLE public.id_card_sequences ENABLE ROW LEVEL SECURITY;

-- Function to generate the next ID card number
CREATE OR REPLACE FUNCTION generate_id_card_number(p_category_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    next_serial integer;
    padded_serial text;
BEGIN
    -- Increment or initialize the serial for the given category code
    INSERT INTO public.id_card_sequences (category_code, current_serial)
    VALUES (p_category_code, 1)
    ON CONFLICT (category_code)
    DO UPDATE SET current_serial = public.id_card_sequences.current_serial + 1
    RETURNING current_serial INTO next_serial;
    
    -- Pad the serial to 3 digits (e.g., 001, 012, 123)
    padded_serial := LPAD(next_serial::text, 3, '0');
    
    RETURN 'EZI/' || UPPER(p_category_code) || '/' || padded_serial;
END;
$$;
