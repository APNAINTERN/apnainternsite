-- Lead Assignment CRM: employee_code, lead_crm, events, targets, assign/update RPCs.

-- 1) Employee code on admin_staff
ALTER TABLE public.admin_staff
  ADD COLUMN IF NOT EXISTS employee_code text;

CREATE UNIQUE INDEX IF NOT EXISTS admin_staff_employee_code_uidx
  ON public.admin_staff (employee_code)
  WHERE employee_code IS NOT NULL;

WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at NULLS LAST, id) AS rn
  FROM public.admin_staff
  WHERE employee_code IS NULL OR btrim(employee_code) = ''
)
UPDATE public.admin_staff s
SET employee_code = 'EMP-' || lpad(n.rn::text, 4, '0')
FROM numbered n
WHERE s.id = n.id;

-- 2) lead_crm
CREATE TABLE IF NOT EXISTS public.lead_crm (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL
    CHECK (source_type IN ('registration_lead', 'payment_cancelled', 'payment_success')),
  source_id uuid NOT NULL,
  email text,
  full_name text,
  phone text,
  college_name text,
  course text,
  state text,
  city text,
  source text,
  assigned_staff_id uuid REFERENCES public.admin_staff(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'unassigned'
    CHECK (status IN (
      'unassigned', 'pending', 'contacted', 'interested', 'not_interested',
      'follow_up', 'converted', 'closed', 'wrong_number', 'not_reachable'
    )),
  priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high')),
  remarks text,
  follow_up_at timestamptz,
  assigned_at timestamptz,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id)
);

CREATE INDEX IF NOT EXISTS lead_crm_assigned_staff_idx ON public.lead_crm (assigned_staff_id);
CREATE INDEX IF NOT EXISTS lead_crm_status_idx ON public.lead_crm (status);
CREATE INDEX IF NOT EXISTS lead_crm_email_idx ON public.lead_crm (lower(email));
CREATE INDEX IF NOT EXISTS lead_crm_follow_up_idx ON public.lead_crm (follow_up_at)
  WHERE follow_up_at IS NOT NULL;

ALTER TABLE public.lead_crm ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage lead_crm" ON public.lead_crm;
CREATE POLICY "Admins manage lead_crm" ON public.lead_crm
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Staff read assigned lead_crm" ON public.lead_crm;
CREATE POLICY "Staff read assigned lead_crm" ON public.lead_crm
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'staff'::public.app_role)
    AND assigned_staff_id = auth.uid()
  );

DROP POLICY IF EXISTS "Staff update assigned lead_crm" ON public.lead_crm;
CREATE POLICY "Staff update assigned lead_crm" ON public.lead_crm
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'staff'::public.app_role)
    AND assigned_staff_id = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'staff'::public.app_role)
    AND assigned_staff_id = auth.uid()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_crm TO authenticated;

-- 3) lead_crm_events
CREATE TABLE IF NOT EXISTS public.lead_crm_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_crm_id uuid NOT NULL REFERENCES public.lead_crm(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.admin_staff(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_crm_events_lead_idx ON public.lead_crm_events (lead_crm_id);
CREATE INDEX IF NOT EXISTS lead_crm_events_staff_created_idx
  ON public.lead_crm_events (staff_id, created_at DESC);

ALTER TABLE public.lead_crm_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage lead_crm_events" ON public.lead_crm_events;
CREATE POLICY "Admins manage lead_crm_events" ON public.lead_crm_events
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Staff read own lead_crm_events" ON public.lead_crm_events;
CREATE POLICY "Staff read own lead_crm_events" ON public.lead_crm_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'staff'::public.app_role)
    AND staff_id = auth.uid()
  );

DROP POLICY IF EXISTS "Staff insert own lead_crm_events" ON public.lead_crm_events;
CREATE POLICY "Staff insert own lead_crm_events" ON public.lead_crm_events
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'staff'::public.app_role)
    AND staff_id = auth.uid()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_crm_events TO authenticated;

-- 4) staff_lead_targets
CREATE TABLE IF NOT EXISTS public.staff_lead_targets (
  staff_id uuid PRIMARY KEY REFERENCES public.admin_staff(id) ON DELETE CASCADE,
  daily_calls int NOT NULL DEFAULT 0 CHECK (daily_calls >= 0),
  weekly_calls int NOT NULL DEFAULT 0 CHECK (weekly_calls >= 0),
  monthly_calls int NOT NULL DEFAULT 0 CHECK (monthly_calls >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.staff_lead_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage staff_lead_targets" ON public.staff_lead_targets;
CREATE POLICY "Admins manage staff_lead_targets" ON public.staff_lead_targets
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Staff read own lead targets" ON public.staff_lead_targets;
CREATE POLICY "Staff read own lead targets" ON public.staff_lead_targets
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'staff'::public.app_role)
    AND staff_id = auth.uid()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_lead_targets TO authenticated;

-- 5) Ensure CRM rows exist for assignment (admin)
CREATE OR REPLACE FUNCTION public.admin_ensure_lead_crm(
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
  v_row jsonb;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_id uuid;
  v_source_type text;
  v_source_id uuid;
BEGIN
  v_ok := public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role);
  IF NOT v_ok THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN '[]'::jsonb;
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_source_type := nullif(trim(coalesce(v_row->>'source_type', '')), '');
    BEGIN
      v_source_id := (v_row->>'source_id')::uuid;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;
    IF v_source_type IS NULL OR v_source_id IS NULL THEN
      CONTINUE;
    END IF;
    IF v_source_type NOT IN ('registration_lead', 'payment_cancelled', 'payment_success') THEN
      CONTINUE;
    END IF;

    INSERT INTO public.lead_crm (
      source_type, source_id, email, full_name, phone,
      college_name, course, state, city, source, status, priority
    )
    VALUES (
      v_source_type,
      v_source_id,
      nullif(lower(trim(coalesce(v_row->>'email', ''))), ''),
      nullif(trim(coalesce(v_row->>'full_name', '')), ''),
      nullif(trim(coalesce(v_row->>'phone', '')), ''),
      nullif(trim(coalesce(v_row->>'college_name', '')), ''),
      nullif(trim(coalesce(v_row->>'course', '')), ''),
      nullif(trim(coalesce(v_row->>'state', '')), ''),
      nullif(trim(coalesce(v_row->>'city', '')), ''),
      nullif(trim(coalesce(v_row->>'source', '')), ''),
      'unassigned',
      COALESCE(nullif(trim(coalesce(v_row->>'priority', '')), ''), 'medium')
    )
    ON CONFLICT (source_type, source_id) DO UPDATE SET
      email = COALESCE(EXCLUDED.email, lead_crm.email),
      full_name = COALESCE(EXCLUDED.full_name, lead_crm.full_name),
      phone = COALESCE(EXCLUDED.phone, lead_crm.phone),
      college_name = COALESCE(EXCLUDED.college_name, lead_crm.college_name),
      course = COALESCE(EXCLUDED.course, lead_crm.course),
      state = COALESCE(EXCLUDED.state, lead_crm.state),
      city = COALESCE(EXCLUDED.city, lead_crm.city),
      source = COALESCE(EXCLUDED.source, lead_crm.source),
      updated_at = now()
    RETURNING id INTO v_id;

    v_ids := array_append(v_ids, v_id);
  END LOOP;

  RETURN to_jsonb(v_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_ensure_lead_crm(jsonb) TO authenticated;

-- 6) Assign leads (custom = 1 staff, equal = split across staff)
CREATE OR REPLACE FUNCTION public.admin_assign_leads(
  p_staff_ids uuid[],
  p_lead_crm_ids uuid[],
  p_mode text DEFAULT 'custom'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
  v_mode text;
  v_staff_count int;
  v_lead_count int;
  v_i int;
  v_staff_id uuid;
  v_lead_id uuid;
  v_assigned int := 0;
BEGIN
  v_ok := public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role);
  IF NOT v_ok THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  v_mode := lower(trim(coalesce(p_mode, 'custom')));
  IF v_mode NOT IN ('custom', 'equal') THEN
    RAISE EXCEPTION 'Invalid mode' USING ERRCODE = '22023';
  END IF;

  p_staff_ids := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_staff_ids, ARRAY[]::uuid[])) AS x WHERE x IS NOT NULL);
  p_lead_crm_ids := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_lead_crm_ids, ARRAY[]::uuid[])) AS x WHERE x IS NOT NULL);

  v_staff_count := coalesce(array_length(p_staff_ids, 1), 0);
  v_lead_count := coalesce(array_length(p_lead_crm_ids, 1), 0);

  IF v_staff_count < 1 OR v_lead_count < 1 THEN
    RAISE EXCEPTION 'Select at least one staff and one lead' USING ERRCODE = '22023';
  END IF;

  IF v_mode = 'custom' AND v_staff_count <> 1 THEN
    RAISE EXCEPTION 'Custom assign requires exactly one staff' USING ERRCODE = '22023';
  END IF;

  IF v_mode = 'equal' AND v_staff_count < 2 THEN
    RAISE EXCEPTION 'Auto equal assign requires at least two staff' USING ERRCODE = '22023';
  END IF;

  -- Validate staff exist
  IF (
    SELECT count(*) FROM public.admin_staff WHERE id = ANY(p_staff_ids) AND coalesce(is_blocked, false) = false
  ) <> v_staff_count THEN
    RAISE EXCEPTION 'One or more staff are invalid or blocked' USING ERRCODE = '22023';
  END IF;

  FOR v_i IN 1..v_lead_count LOOP
    v_lead_id := p_lead_crm_ids[v_i];
    IF v_mode = 'custom' THEN
      v_staff_id := p_staff_ids[1];
    ELSE
      v_staff_id := p_staff_ids[((v_i - 1) % v_staff_count) + 1];
    END IF;

    UPDATE public.lead_crm
    SET
      assigned_staff_id = v_staff_id,
      status = CASE WHEN status = 'unassigned' THEN 'pending' ELSE status END,
      assigned_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
    WHERE id = v_lead_id;

    IF FOUND THEN
      INSERT INTO public.lead_crm_events (lead_crm_id, staff_id, event_type, to_status, detail)
      VALUES (v_lead_id, v_staff_id, 'assigned', 'pending', 'Assigned by admin (' || v_mode || ')');
      v_assigned := v_assigned + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('assigned', v_assigned, 'mode', v_mode);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_assign_leads(uuid[], uuid[], text) TO authenticated;

-- 7) Staff update own assigned lead
CREATE OR REPLACE FUNCTION public.staff_update_lead_crm(
  p_lead_crm_id uuid,
  p_status text DEFAULT NULL,
  p_remarks text DEFAULT NULL,
  p_follow_up_at timestamptz DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_clear_follow_up boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ok boolean;
  v_row public.lead_crm%ROWTYPE;
  v_from text;
  v_to text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_ok := public.has_role(v_uid, 'staff'::public.app_role)
    OR public.has_role(v_uid, 'admin'::public.app_role)
    OR public.has_role(v_uid, 'super_admin'::public.app_role);
  IF NOT v_ok THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.lead_crm WHERE id = p_lead_crm_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found' USING ERRCODE = 'P0002';
  END IF;

  IF public.has_role(v_uid, 'staff'::public.app_role)
    AND NOT (
      public.has_role(v_uid, 'admin'::public.app_role)
      OR public.has_role(v_uid, 'super_admin'::public.app_role)
    )
    AND v_row.assigned_staff_id IS DISTINCT FROM v_uid
  THEN
    RAISE EXCEPTION 'Lead not assigned to you' USING ERRCODE = '42501';
  END IF;

  v_from := v_row.status;
  v_to := v_from;

  IF p_status IS NOT NULL AND btrim(p_status) <> '' THEN
    v_to := lower(btrim(p_status));
    IF v_to NOT IN (
      'pending', 'contacted', 'interested', 'not_interested',
      'follow_up', 'converted', 'closed', 'wrong_number', 'not_reachable'
    ) THEN
      RAISE EXCEPTION 'Invalid status' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_priority IS NOT NULL AND btrim(p_priority) <> '' THEN
    IF lower(btrim(p_priority)) NOT IN ('low', 'medium', 'high') THEN
      RAISE EXCEPTION 'Invalid priority' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.lead_crm
  SET
    status = v_to,
    remarks = CASE
      WHEN p_remarks IS NULL THEN remarks
      ELSE nullif(btrim(p_remarks), '')
    END,
    follow_up_at = CASE
      WHEN p_clear_follow_up THEN NULL
      WHEN p_follow_up_at IS NOT NULL THEN p_follow_up_at
      ELSE follow_up_at
    END,
    priority = CASE
      WHEN p_priority IS NULL OR btrim(p_priority) = '' THEN priority
      ELSE lower(btrim(p_priority))
    END,
    updated_by = v_uid,
    updated_at = now()
  WHERE id = p_lead_crm_id;

  INSERT INTO public.lead_crm_events (
    lead_crm_id, staff_id, event_type, from_status, to_status, detail
  )
  VALUES (
    p_lead_crm_id,
    COALESCE(v_row.assigned_staff_id, v_uid),
    CASE
      WHEN v_from IS DISTINCT FROM v_to THEN 'status_change'
      WHEN p_remarks IS NOT NULL THEN 'remark'
      WHEN p_follow_up_at IS NOT NULL OR p_clear_follow_up THEN 'follow_up'
      ELSE 'update'
    END,
    v_from,
    v_to,
    CASE
      WHEN p_remarks IS NOT NULL AND btrim(p_remarks) <> '' THEN btrim(p_remarks)
      ELSE NULL
    END
  );

  RETURN (
    SELECT to_jsonb(l) FROM public.lead_crm l WHERE l.id = p_lead_crm_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_update_lead_crm(uuid, text, text, timestamptz, text, boolean)
  TO authenticated;

-- 8) Admin upsert staff targets
CREATE OR REPLACE FUNCTION public.admin_upsert_staff_lead_targets(
  p_staff_id uuid,
  p_daily_calls int,
  p_weekly_calls int,
  p_monthly_calls int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
BEGIN
  v_ok := public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role);
  IF NOT v_ok THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.staff_lead_targets (staff_id, daily_calls, weekly_calls, monthly_calls, updated_at, updated_by)
  VALUES (
    p_staff_id,
    greatest(coalesce(p_daily_calls, 0), 0),
    greatest(coalesce(p_weekly_calls, 0), 0),
    greatest(coalesce(p_monthly_calls, 0), 0),
    now(),
    auth.uid()
  )
  ON CONFLICT (staff_id) DO UPDATE SET
    daily_calls = EXCLUDED.daily_calls,
    weekly_calls = EXCLUDED.weekly_calls,
    monthly_calls = EXCLUDED.monthly_calls,
    updated_at = now(),
    updated_by = auth.uid();

  RETURN (
    SELECT to_jsonb(t) FROM public.staff_lead_targets t WHERE t.staff_id = p_staff_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_staff_lead_targets(uuid, int, int, int) TO authenticated;
