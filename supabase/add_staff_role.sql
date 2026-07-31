-- Add 'staff' role to the app_role enum
-- Run this in your Supabase SQL Editor
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'staff';

-- Update the handle_new_user function to ensure it can handle the new role from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Assign role from metadata if present, else default to student
  INSERT INTO public.user_roles (user_id, role) 
  VALUES (
    NEW.id, 
    COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'student'::public.app_role)
  ) 
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN NEW;
END;
$$;
