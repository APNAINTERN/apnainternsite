-- Postgres requires enum additions to commit before the new label can be used
-- in the same database session. Keep this migration ONLY the ALTER TYPE so
-- `20260514140000_college_admin_portal.sql` runs in a later transaction.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'college_admin';
