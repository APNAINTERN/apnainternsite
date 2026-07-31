-- ========================================================
-- ROBUST TRIGGER FIX FOR EZYINTERN
-- This script fixes the 'Database error finding user' error 
-- during signup/staff creation by ensuring the trigger handles
-- all necessary table insertions safely.
-- ========================================================

-- 1. Ensure Profile Defaults exist (fixes NOT NULL violations)
ALTER TABLE public.profiles 
ALTER COLUMN gender SET DEFAULT '',
ALTER COLUMN parent_name SET DEFAULT '',
ALTER COLUMN contact_number SET DEFAULT '',
ALTER COLUMN email SET DEFAULT '';

-- 2. Robust handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    default_role public.app_role := 'student';
    assigned_role public.app_role;
BEGIN
    -- Determine role
    BEGIN
        assigned_role := (NEW.raw_user_meta_data->>'role')::public.app_role;
    EXCEPTION WHEN OTHERS THEN
        assigned_role := default_role;
    END;
    
    IF assigned_role IS NULL THEN
        assigned_role := default_role;
    END IF;

    -- A. Create Role
    INSERT INTO public.user_roles (user_id, role) 
    VALUES (NEW.id, assigned_role) 
    ON CONFLICT (user_id, role) DO NOTHING;
    
    -- B. Create Profile
    INSERT INTO public.profiles (id, full_name, email)
    VALUES (
        NEW.id, 
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, 'User'),
        COALESCE(NEW.email, '')
    ) 
    ON CONFLICT (id) DO NOTHING;

    -- C. Create Admin Permissions if staff or admin
    IF (NEW.raw_user_meta_data->>'is_staff')::boolean = true OR assigned_role IN ('admin', 'super_admin') THEN
        INSERT INTO public.admin_permissions (user_id)
        VALUES (NEW.id)
        ON CONFLICT (user_id) DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$;

-- 3. Ensure trigger is properly linked
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Verify admin_permissions table has defaults for new rows
ALTER TABLE public.admin_permissions 
ALTER COLUMN can_manage_students SET DEFAULT true,
ALTER COLUMN can_manage_classes SET DEFAULT true,
ALTER COLUMN can_manage_certificates SET DEFAULT true,
ALTER COLUMN can_manage_institutions SET DEFAULT true,
ALTER COLUMN can_view_payments SET DEFAULT true,
ALTER COLUMN can_manage_leads SET DEFAULT true,
ALTER COLUMN can_manage_notifications SET DEFAULT true,
ALTER COLUMN can_manage_assignments SET DEFAULT true,
ALTER COLUMN can_manage_communications SET DEFAULT true;

-- SUCCESS: Database trigger and table defaults synchronized.
