-- Enable RLS on cybercafe_profiles table if not already enabled
ALTER TABLE public.cybercafe_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to avoid conflicts
DROP POLICY IF EXISTS "Admins manage cybercafe profiles" ON public.cybercafe_profiles;
DROP POLICY IF EXISTS "Cybercafe can view own profile" ON public.cybercafe_profiles;
DROP POLICY IF EXISTS "Cybercafe can update own profile" ON public.cybercafe_profiles;
DROP POLICY IF EXISTS "Cybercafe can insert own profile" ON public.cybercafe_profiles;

-- Policy to allow admins and super admins to view and manage all cybercafe_profiles
CREATE POLICY "Admins manage cybercafe profiles" 
ON public.cybercafe_profiles 
FOR ALL 
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'super_admin')
);

-- Policy to allow authenticated users to view their own cybercafe profile
CREATE POLICY "Cybercafe can view own profile" 
ON public.cybercafe_profiles 
FOR SELECT 
USING (auth.uid() = id);

-- Policy to allow authenticated users to update their own cybercafe profile
CREATE POLICY "Cybercafe can update own profile" 
ON public.cybercafe_profiles 
FOR UPDATE 
USING (auth.uid() = id);

-- Policy to allow authenticated users to insert their own cybercafe profile
CREATE POLICY "Cybercafe can insert own profile" 
ON public.cybercafe_profiles 
FOR INSERT 
WITH CHECK (auth.uid() = id);

-- Grant appropriate permissions to authenticated users
GRANT SELECT, INSERT, UPDATE ON public.cybercafe_profiles TO authenticated;
