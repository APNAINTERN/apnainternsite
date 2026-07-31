-- Admin publish/update class links via RPC (avoids PostgREST schema-cache issues on new columns).

CREATE OR REPLACE FUNCTION public.admin_insert_class_link(p_row jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_link_type text;
  v_domain_id uuid;
BEGIN
  PERFORM public.assert_may_admin_list_students();

  v_link_type := NULLIF(trim(p_row->>'link_type'), '');
  IF v_link_type IS NULL OR v_link_type NOT IN ('youtube', 'meet', 'zoom', 'teams', 'url') THEN
    v_link_type := 'meet';
  END IF;

  v_domain_id := NULLIF(trim(p_row->>'domain_id'), '')::uuid;

  INSERT INTO public.classes (
    title,
    description,
    link_type,
    url,
    scheduled_at,
    domain_id,
    target_universities,
    target_colleges,
    target_domains,
    created_by
  )
  VALUES (
    trim(p_row->>'title'),
    NULLIF(trim(p_row->>'description'), ''),
    v_link_type,
    trim(p_row->>'url'),
    (p_row->>'scheduled_at')::timestamptz,
    v_domain_id,
    CASE
      WHEN p_row ? 'target_universities' AND jsonb_typeof(p_row->'target_universities') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_universities'))
      ELSE NULL
    END,
    CASE
      WHEN p_row ? 'target_colleges' AND jsonb_typeof(p_row->'target_colleges') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_colleges'))
      ELSE NULL
    END,
    CASE
      WHEN p_row ? 'target_domains' AND jsonb_typeof(p_row->'target_domains') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_domains'))
      ELSE NULL
    END,
    NULLIF(trim(p_row->>'created_by'), '')::uuid
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_class_link(p_id uuid, p_row jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link_type text;
BEGIN
  PERFORM public.assert_may_admin_list_students();

  v_link_type := NULLIF(trim(p_row->>'link_type'), '');
  IF v_link_type IS NULL OR v_link_type NOT IN ('youtube', 'meet', 'zoom', 'teams', 'url') THEN
    v_link_type := 'meet';
  END IF;

  UPDATE public.classes
  SET
    title = trim(p_row->>'title'),
    description = NULLIF(trim(p_row->>'description'), ''),
    link_type = v_link_type,
    url = trim(p_row->>'url'),
    scheduled_at = (p_row->>'scheduled_at')::timestamptz,
    domain_id = NULLIF(trim(p_row->>'domain_id'), '')::uuid,
    target_universities = CASE
      WHEN p_row ? 'target_universities' AND jsonb_typeof(p_row->'target_universities') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_universities'))
      ELSE NULL
    END,
    target_colleges = CASE
      WHEN p_row ? 'target_colleges' AND jsonb_typeof(p_row->'target_colleges') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_colleges'))
      ELSE NULL
    END,
    target_domains = CASE
      WHEN p_row ? 'target_domains' AND jsonb_typeof(p_row->'target_domains') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_domains'))
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_insert_class_link_minimal(p_row jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_link_type text;
BEGIN
  PERFORM public.assert_may_admin_list_students();
  v_link_type := NULLIF(trim(p_row->>'link_type'), '');
  IF v_link_type IS NULL OR v_link_type NOT IN ('youtube', 'meet') THEN
    v_link_type := 'meet';
  END IF;
  INSERT INTO public.classes (title, link_type, url, scheduled_at, domain_id)
  VALUES (
    trim(p_row->>'title'),
    v_link_type,
    trim(p_row->>'url'),
    (p_row->>'scheduled_at')::timestamptz,
    NULLIF(trim(p_row->>'domain_id'), '')::uuid
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_insert_class_link(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_class_link(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_insert_class_link_minimal(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_insert_class_link(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_class_link(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_insert_class_link_minimal(jsonb) TO authenticated;
