-- Base tables created in Lovable Cloud but missing from supabase/migrations.
-- Safe to run multiple times (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS public.cybercafe_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  shop_name TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending_approval',
  rejection_reason TEXT,
  profile_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cybercafe_profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_present BOOLEAN NOT NULL DEFAULT true,
  marked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_attendance_student_marked
  ON public.attendance (student_id, marked_at DESC);

CREATE TABLE IF NOT EXISTS public.attendance_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  min_percentage INTEGER NOT NULL DEFAULT 75,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attendance_settings_one_row CHECK (id = 1)
);
ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.attendance_settings (id, min_percentage)
VALUES (1, 75)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.beu_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.beu_details ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cybercafe_profiles TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_settings TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beu_details TO authenticated, service_role;
