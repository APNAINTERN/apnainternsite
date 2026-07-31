-- Allow staff members to manage student attendance
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage student attendance" ON public.attendance;
CREATE POLICY "Staff manage student attendance" 
ON public.attendance 
FOR ALL 
TO authenticated 
USING (
  public.has_role(auth.uid(), 'staff')
);
