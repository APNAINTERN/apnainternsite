-- Ensure admin_permissions has every staff Service Access flag (partial table was dropping upserts).
ALTER TABLE public.admin_permissions
  ADD COLUMN IF NOT EXISTS can_manage_non_engineering boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_attendance boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_employee_attendance boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_staff boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_id_cards boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_uploads boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_fees boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_cybercafe boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_referrals boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_college_rosters boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_settings boolean DEFAULT false;
