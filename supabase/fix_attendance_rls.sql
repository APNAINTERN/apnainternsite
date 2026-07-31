-- Enable RLS on attendance table if not already enabled
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Policy to allow admins and super admins to insert/update/delete attendance records
CREATE POLICY "Admins manage attendance" 
ON public.attendance 
FOR ALL 
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'super_admin')
);
