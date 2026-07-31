-- Restore Admin Attendance visibility (column defaulted to false on add).

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
