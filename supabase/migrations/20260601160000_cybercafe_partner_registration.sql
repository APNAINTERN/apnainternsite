-- Cyber cafe partner self-registration (see hotfix_cybercafe_partner_registration.sql).

CREATE OR REPLACE FUNCTION public.register_cybercafe_partner(
  p_user_id uuid,
  p_owner_name text,
  p_email text,
  p_phone text,
  p_shop_name text,
  p_location text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(p_email));
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id required';
  END IF;
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Sign in required to complete partner registration' USING ERRCODE = '42501';
  END IF;
  IF v_email = '' OR trim(p_shop_name) = '' THEN
    RAISE EXCEPTION 'Email and shop name are required';
  END IF;

  INSERT INTO public.profiles (id, full_name, email, contact_number)
  VALUES (
    p_user_id,
    COALESCE(NULLIF(trim(p_owner_name), ''), 'Partner'),
    v_email,
    COALESCE(NULLIF(trim(p_phone), ''), '')
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name),
    email = EXCLUDED.email,
    contact_number = COALESCE(NULLIF(EXCLUDED.contact_number, ''), public.profiles.contact_number);

  INSERT INTO public.cybercafe_profiles (
    id,
    owner_name,
    email,
    phone,
    shop_name,
    location,
    status
  )
  VALUES (
    p_user_id,
    COALESCE(NULLIF(trim(p_owner_name), ''), 'Owner'),
    v_email,
    COALESCE(NULLIF(trim(p_phone), ''), ''),
    trim(p_shop_name),
    COALESCE(NULLIF(trim(p_location), ''), ''),
    'pending_approval'
  )
  ON CONFLICT (id) DO UPDATE SET
    owner_name = EXCLUDED.owner_name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    shop_name = EXCLUDED.shop_name,
    location = EXCLUDED.location,
    status = COALESCE(public.cybercafe_profiles.status, 'pending_approval');

  RETURN jsonb_build_object('ok', true, 'id', p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.register_cybercafe_partner(uuid, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_cybercafe_partner(uuid, text, text, text, text, text) TO authenticated;
