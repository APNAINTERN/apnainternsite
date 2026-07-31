-- Sub-admin creation fails on RDS with 42P10 because admin_permissions.user_id
-- has no unique/PK constraint, so ON CONFLICT (user_id) has nothing to match.

ALTER TABLE public.admin_permissions
  ALTER COLUMN user_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.admin_permissions'::regclass
      AND contype IN ('p', 'u')
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_attribute
         WHERE attrelid = 'public.admin_permissions'::regclass
           AND attname = 'user_id')
      ]
  ) THEN
    ALTER TABLE public.admin_permissions
      ADD CONSTRAINT admin_permissions_user_id_key UNIQUE (user_id);
  END IF;
END $$;
