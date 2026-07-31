-- Cyber café partners register students while authenticated; direct registration_leads upsert was 403 (anon-only write policy).

CREATE OR REPLACE FUNCTION public.assert_may_upsert_registration_lead(p_cybercafe_email text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cybercafe_profiles cp WHERE cp.id = auth.uid()
  ) THEN
    SELECT lower(trim(cp.email)) INTO v_partner_email
    FROM public.cybercafe_profiles cp
    WHERE cp.id = auth.uid();

    IF p_cybercafe_email IS NOT NULL AND trim(p_cybercafe_email) <> '' THEN
      IF lower(trim(p_cybercafe_email)) IS DISTINCT FROM v_partner_email THEN
        RAISE EXCEPTION 'Cyber cafe email mismatch' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN (
        'admin'::public.app_role,
        'super_admin'::public.app_role,
        'staff'::public.app_role
      )
  ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'Not allowed to save registration draft' USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_registration_lead(
  p_email text,
  p_phone text DEFAULT NULL,
  p_step integer DEFAULT 1,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_cybercafe_shop_name text DEFAULT NULL,
  p_cybercafe_email text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_id uuid;
BEGIN
  IF v_email = '' OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'Valid email required';
  END IF;

  PERFORM public.assert_may_upsert_registration_lead(p_cybercafe_email);

  INSERT INTO public.registration_leads (
    email,
    phone,
    step,
    payload,
    cybercafe_shop_name,
    cybercafe_email,
    updated_at
  )
  VALUES (
    v_email,
    NULLIF(trim(p_phone), ''),
    GREATEST(1, COALESCE(p_step, 1)),
    COALESCE(p_payload, '{}'::jsonb),
    NULLIF(trim(p_cybercafe_shop_name), ''),
    NULLIF(lower(trim(p_cybercafe_email)), ''),
    now()
  )
  ON CONFLICT (email) DO UPDATE SET
    phone = EXCLUDED.phone,
    step = EXCLUDED.step,
    payload = EXCLUDED.payload,
    cybercafe_shop_name = COALESCE(EXCLUDED.cybercafe_shop_name, public.registration_leads.cybercafe_shop_name),
    cybercafe_email = COALESCE(EXCLUDED.cybercafe_email, public.registration_leads.cybercafe_email),
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_registration_lead(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(p_email));
BEGIN
  IF v_email = '' THEN
    RETURN;
  END IF;

  PERFORM public.assert_may_upsert_registration_lead(NULL);

  DELETE FROM public.registration_leads WHERE email = v_email;
END;
$$;

DROP POLICY IF EXISTS "Cyber cafe partners manage registration leads" ON public.registration_leads;
CREATE POLICY "Cyber cafe partners manage registration leads"
  ON public.registration_leads
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.cybercafe_profiles cp WHERE cp.id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.cybercafe_profiles cp WHERE cp.id = auth.uid())
  );

REVOKE ALL ON FUNCTION public.assert_may_upsert_registration_lead(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_registration_lead(text, text, integer, jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_registration_lead(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.assert_may_upsert_registration_lead(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_registration_lead(text, text, integer, jsonb, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_registration_lead(text) TO anon, authenticated;
