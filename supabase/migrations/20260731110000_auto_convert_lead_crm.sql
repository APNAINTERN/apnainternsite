-- Auto-convert Lead Assignment CRM when email enrolls / pays successfully.

BEGIN;

CREATE OR REPLACE FUNCTION public.mark_lead_crm_converted_by_email(
  p_email text,
  p_detail text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_detail text := NULLIF(trim(COALESCE(p_detail, '')), '');
  v_updated int := 0;
  v_created int := 0;
  v_row public.lead_crm%ROWTYPE;
  v_source_type text;
  v_source_id uuid;
  v_full_name text;
  v_phone text;
  v_college text;
  v_course text;
  v_id uuid;
  v_from text;
BEGIN
  IF v_email = '' OR v_email !~ '@' THEN
    RETURN jsonb_build_object('ok', false, 'updated', 0, 'created', 0, 'reason', 'invalid_email');
  END IF;

  IF v_detail IS NULL THEN
    v_detail := 'Auto-converted: registration / payment success';
  END IF;

  -- 1) Convert every existing CRM row for this email
  FOR v_row IN
    SELECT *
    FROM public.lead_crm
    WHERE lower(trim(COALESCE(email, ''))) = v_email
      AND status IS DISTINCT FROM 'converted'
    FOR UPDATE
  LOOP
    v_from := v_row.status;
    UPDATE public.lead_crm
    SET
      status = 'converted',
      updated_at = now()
    WHERE id = v_row.id;

    INSERT INTO public.lead_crm_events (
      lead_crm_id, staff_id, event_type, from_status, to_status, detail
    )
    VALUES (
      v_row.id,
      v_row.assigned_staff_id,
      'auto_converted',
      v_from,
      'converted',
      v_detail
    );
    v_updated := v_updated + 1;
  END LOOP;

  -- Already converted rows count as success (idempotent)
  IF v_updated = 0 AND EXISTS (
    SELECT 1 FROM public.lead_crm
    WHERE lower(trim(COALESCE(email, ''))) = v_email
      AND status = 'converted'
  ) THEN
    RETURN jsonb_build_object('ok', true, 'updated', 0, 'created', 0, 'already', true);
  END IF;

  IF v_updated > 0 THEN
    RETURN jsonb_build_object('ok', true, 'updated', v_updated, 'created', 0);
  END IF;

  -- 2) No CRM row yet — create one from a known source so Converted has a row
  SELECT 'payment_success', ps.id, ps.full_name, NULL, ps.college_name, NULL
  INTO v_source_type, v_source_id, v_full_name, v_phone, v_college, v_course
  FROM public.payment_success ps
  WHERE lower(trim(COALESCE(ps.email, ''))) = v_email
    AND lower(trim(COALESCE(ps.status, ''))) = 'success'
  ORDER BY ps.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_source_id IS NULL THEN
    SELECT 'registration_lead', rl.id,
           COALESCE(rl.payload->>'fullName', rl.payload->>'full_name'),
           COALESCE(rl.phone, rl.payload->>'contact', rl.payload->>'contact_number'),
           COALESCE(rl.payload->>'college', rl.payload->>'college_name'),
           COALESCE(rl.payload->>'course', rl.payload->>'internship_domain')
    INTO v_source_type, v_source_id, v_full_name, v_phone, v_college, v_course
    FROM public.registration_leads rl
    WHERE lower(trim(COALESCE(rl.email, ''))) = v_email
    ORDER BY rl.updated_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_source_id IS NULL THEN
    SELECT 'payment_cancelled', pc.id,
           COALESCE(pc.metadata->>'fullName', pc.metadata->>'full_name', pc.user_email),
           pc.user_phone,
           COALESCE(pc.metadata->>'college', pc.metadata->>'college_name'),
           COALESCE(pc.metadata->>'course', pc.metadata->>'internship_domain')
    INTO v_source_type, v_source_id, v_full_name, v_phone, v_college, v_course
    FROM public.payment_cancelled pc
    WHERE lower(trim(COALESCE(pc.user_email, ''))) = v_email
    ORDER BY pc.created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_source_id IS NULL THEN
    -- Last resort: failed payment_success rows still in hub
    SELECT 'payment_success', ps.id, ps.full_name, NULL, ps.college_name, NULL
    INTO v_source_type, v_source_id, v_full_name, v_phone, v_college, v_course
    FROM public.payment_success ps
    WHERE lower(trim(COALESCE(ps.email, ''))) = v_email
    ORDER BY ps.created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_source_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'updated', 0, 'created', 0, 'reason', 'no_lead_source');
  END IF;

  INSERT INTO public.lead_crm (
    source_type, source_id, email, full_name, phone,
    college_name, course, source, status, priority
  )
  VALUES (
    v_source_type,
    v_source_id,
    v_email,
    NULLIF(trim(COALESCE(v_full_name, '')), ''),
    NULLIF(trim(COALESCE(v_phone, '')), ''),
    NULLIF(trim(COALESCE(v_college, '')), ''),
    NULLIF(trim(COALESCE(v_course, '')), ''),
    'auto_converted',
    'converted',
    'medium'
  )
  ON CONFLICT (source_type, source_id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, lead_crm.email),
    full_name = COALESCE(EXCLUDED.full_name, lead_crm.full_name),
    status = 'converted',
    updated_at = now()
  RETURNING id INTO v_id;

  INSERT INTO public.lead_crm_events (
    lead_crm_id, staff_id, event_type, from_status, to_status, detail
  )
  VALUES (
    v_id,
    NULL,
    'auto_converted',
    'unassigned',
    'converted',
    v_detail
  );

  v_created := 1;
  RETURN jsonb_build_object('ok', true, 'updated', 0, 'created', v_created, 'lead_crm_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_lead_crm_converted_by_email(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_lead_crm_converted_by_email(text, text)
  TO anon, authenticated, service_role;

-- Bulk sync: any CRM email that is already a student or has a successful payment
CREATE OR REPLACE FUNCTION public.sync_lead_crm_converted_from_enrollments()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.lead_crm%ROWTYPE;
  v_count int := 0;
  v_from text;
BEGIN
  FOR v_row IN
    SELECT lc.*
    FROM public.lead_crm lc
    WHERE lc.status IS DISTINCT FROM 'converted'
      AND NULLIF(trim(COALESCE(lc.email, '')), '') IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.students s
          WHERE lower(trim(COALESCE(s.email, ''))) = lower(trim(lc.email))
        )
        OR EXISTS (
          SELECT 1 FROM public.payment_success ps
          WHERE lower(trim(COALESCE(ps.email, ''))) = lower(trim(lc.email))
            AND lower(trim(COALESCE(ps.status, ''))) = 'success'
        )
      )
    FOR UPDATE
  LOOP
    v_from := v_row.status;
    UPDATE public.lead_crm
    SET status = 'converted', updated_at = now()
    WHERE id = v_row.id;

    INSERT INTO public.lead_crm_events (
      lead_crm_id, staff_id, event_type, from_status, to_status, detail
    )
    VALUES (
      v_row.id,
      v_row.assigned_staff_id,
      'auto_converted',
      v_from,
      'converted',
      'Auto-converted: existing registration / successful payment'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'updated', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_lead_crm_converted_from_enrollments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_lead_crm_converted_from_enrollments()
  TO authenticated, service_role;

COMMIT;
