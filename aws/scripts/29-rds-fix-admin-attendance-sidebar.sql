-- Fix: can_manage_attendance was added with DEFAULT false, which hid Admin → Attendance
-- for every existing admin_permissions row. Restore for admins who manage students/classes.

UPDATE public.admin_permissions
SET can_manage_attendance = true
WHERE can_manage_attendance IS DISTINCT FROM true
  AND (
    can_manage_students IS TRUE
    OR can_manage_classes IS TRUE
    OR can_manage_certificates IS TRUE
  );

ALTER TABLE public.admin_permissions
  ALTER COLUMN can_manage_attendance SET DEFAULT true;
