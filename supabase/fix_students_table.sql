-- Add missing columns to students table to match Register.tsx insertion logic
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS emergency_name TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact TEXT,
ADD COLUMN IF NOT EXISTS emergency_relation TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Ensure RLS policies allow authenticated users to insert their own record
-- (These should already exist based on full_setup.sql, but re-applying to be sure)
DROP POLICY IF EXISTS "Users insert own student record" ON public.students;
CREATE POLICY "Users insert own student record" ON public.students FOR INSERT WITH CHECK (auth.uid() = id);

-- Grant permissions (if not already granted)
GRANT ALL ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;
