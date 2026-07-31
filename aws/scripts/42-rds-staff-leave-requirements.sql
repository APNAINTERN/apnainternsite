-- Staff leave requests + requirement requests (staff submit; admins approve/reject).

-- ── 1) Leave requests ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leave_type text NOT NULL DEFAULT 'casual'
    CHECK (leave_type IN ('casual', 'sick', 'earned', 'unpaid', 'other')),
  from_date date NOT NULL,
  to_date date NOT NULL,
  reason text NOT NULL DEFAULT '',
  attachment_url text,
  attachment_path text,
  attachment_name text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_remarks text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_leave_dates_ok CHECK (to_date >= from_date)
);

CREATE INDEX IF NOT EXISTS idx_staff_leave_staff_created
  ON public.staff_leave_requests (staff_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_leave_status
  ON public.staff_leave_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_leave_dates
  ON public.staff_leave_requests (from_date, to_date);

ALTER TABLE public.staff_leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage staff_leave_requests" ON public.staff_leave_requests;
CREATE POLICY "Admins manage staff_leave_requests" ON public.staff_leave_requests
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

DROP POLICY IF EXISTS "Staff insert own leave" ON public.staff_leave_requests;
CREATE POLICY "Staff insert own leave" ON public.staff_leave_requests
FOR INSERT TO authenticated
WITH CHECK (
  staff_id = auth.uid()
  AND (
    public.has_role(auth.uid(), 'staff'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Staff read own leave" ON public.staff_leave_requests;
CREATE POLICY "Staff read own leave" ON public.staff_leave_requests
FOR SELECT TO authenticated
USING (
  staff_id = auth.uid()
  AND (
    public.has_role(auth.uid(), 'staff'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Staff update own pending leave" ON public.staff_leave_requests;
CREATE POLICY "Staff update own pending leave" ON public.staff_leave_requests
FOR UPDATE TO authenticated
USING (
  staff_id = auth.uid()
  AND status = 'pending'
)
WITH CHECK (
  staff_id = auth.uid()
  AND status = 'pending'
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_leave_requests TO authenticated;

-- ── 2) Requirement requests ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_requirement_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('equipment', 'access', 'software', 'stationery', 'travel', 'other')),
  description text NOT NULL DEFAULT '',
  attachment_url text,
  attachment_path text,
  attachment_name text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_remarks text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_req_staff_created
  ON public.staff_requirement_requests (staff_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_req_status
  ON public.staff_requirement_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_req_category
  ON public.staff_requirement_requests (category, created_at DESC);

ALTER TABLE public.staff_requirement_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage staff_requirement_requests" ON public.staff_requirement_requests;
CREATE POLICY "Admins manage staff_requirement_requests" ON public.staff_requirement_requests
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

DROP POLICY IF EXISTS "Staff insert own requirements" ON public.staff_requirement_requests;
CREATE POLICY "Staff insert own requirements" ON public.staff_requirement_requests
FOR INSERT TO authenticated
WITH CHECK (
  staff_id = auth.uid()
  AND (
    public.has_role(auth.uid(), 'staff'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Staff read own requirements" ON public.staff_requirement_requests;
CREATE POLICY "Staff read own requirements" ON public.staff_requirement_requests
FOR SELECT TO authenticated
USING (
  staff_id = auth.uid()
  AND (
    public.has_role(auth.uid(), 'staff'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Staff update own pending requirements" ON public.staff_requirement_requests;
CREATE POLICY "Staff update own pending requirements" ON public.staff_requirement_requests
FOR UPDATE TO authenticated
USING (
  staff_id = auth.uid()
  AND status = 'pending'
)
WITH CHECK (
  staff_id = auth.uid()
  AND status = 'pending'
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_requirement_requests TO authenticated;
