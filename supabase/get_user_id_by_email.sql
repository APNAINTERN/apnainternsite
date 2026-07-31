CREATE OR REPLACE FUNCTION get_user_id_by_email(email_text text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found_id uuid;
BEGIN
  SELECT id INTO found_id
  FROM auth.users
  WHERE email = email_text
  LIMIT 1;
  
  RETURN found_id;
END;
$$;
