-- Public ID card verification for /verify-id (QR scan target).

CREATE OR REPLACE FUNCTION public.verify_id_card_public(p_card_number text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card text := nullif(trim(p_card_number), '');
  v_row public.id_card_generations%ROWTYPE;
  v_meta jsonb := '{}'::jsonb;
BEGIN
  IF v_card IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT *
  INTO v_row
  FROM public.id_card_generations
  WHERE lower(trim(card_number)) = lower(v_card)
     OR lower(trim(card_number)) = lower(replace(v_card, ' ', ''))
  ORDER BY generated_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  BEGIN
    v_meta := coalesce(v_row.metadata, '{}'::jsonb);
  EXCEPTION WHEN others THEN
    v_meta := '{}'::jsonb;
  END;

  RETURN jsonb_build_object(
    'found', true,
    'card', jsonb_build_object(
      'card_number', v_row.card_number,
      'user_name', v_row.user_name,
      'user_email', v_row.user_email,
      'category', v_row.category,
      'status', v_row.status,
      'generated_at', v_row.generated_at,
      'phone', coalesce(v_meta->>'phone', v_meta->>'user_phone', ''),
      'position', coalesce(v_meta->>'position', '')
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_id_card_public(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_id_card_public(text) TO anon, authenticated;
