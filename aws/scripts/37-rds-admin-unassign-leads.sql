-- Admin: unassign leads from staff (return to pool)
CREATE OR REPLACE FUNCTION public.admin_unassign_leads(
  p_lead_crm_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
  v_ids uuid[];
  v_lead_id uuid;
  v_staff_id uuid;
  v_from text;
  v_removed int := 0;
BEGIN
  v_ok := public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role);
  IF NOT v_ok THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  v_ids := ARRAY(
    SELECT DISTINCT x
    FROM unnest(coalesce(p_lead_crm_ids, ARRAY[]::uuid[])) AS x
    WHERE x IS NOT NULL
  );

  IF coalesce(array_length(v_ids, 1), 0) < 1 THEN
    RAISE EXCEPTION 'Select at least one lead' USING ERRCODE = '22023';
  END IF;

  FOREACH v_lead_id IN ARRAY v_ids
  LOOP
    SELECT assigned_staff_id, status
      INTO v_staff_id, v_from
    FROM public.lead_crm
    WHERE id = v_lead_id
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;
    IF v_staff_id IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.lead_crm
    SET
      assigned_staff_id = NULL,
      assigned_at = NULL,
      status = 'unassigned',
      updated_by = auth.uid(),
      updated_at = now()
    WHERE id = v_lead_id;

    INSERT INTO public.lead_crm_events (
      lead_crm_id, staff_id, event_type, from_status, to_status, detail
    )
    VALUES (
      v_lead_id,
      v_staff_id,
      'unassigned',
      v_from,
      'unassigned',
      'Removed from staff by admin'
    );

    v_removed := v_removed + 1;
  END LOOP;

  RETURN jsonb_build_object('removed', v_removed);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_unassign_leads(uuid[]) TO authenticated;
