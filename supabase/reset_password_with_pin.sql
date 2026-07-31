-- Function to reset user password using their 4-digit security PIN
CREATE OR REPLACE FUNCTION public.reset_password_with_pin(p_email TEXT, p_pin TEXT, p_new_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_stored_pin TEXT;
BEGIN
  -- 1. Get the user ID from auth.users using the provided email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = p_email;

  IF v_user_id IS NULL THEN
    -- User doesn't exist
    RETURN FALSE;
  END IF;

  -- 2. Get the stored security PIN from public.user_security
  SELECT security_pin INTO v_stored_pin
  FROM public.user_security
  WHERE user_id = v_user_id;

  IF v_stored_pin IS NULL OR v_stored_pin != p_pin THEN
    -- PIN is incorrect or not set
    RETURN FALSE;
  END IF;

  -- 3. PIN is correct, update the user's password in auth.users
  -- Supabase uses bcrypt for password hashing via pgcrypto's crypt function
  UPDATE auth.users 
  SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = v_user_id;

  RETURN TRUE;
END;
$$;

-- Grant access to the RPC function
GRANT EXECUTE ON FUNCTION public.reset_password_with_pin TO anon, authenticated;
