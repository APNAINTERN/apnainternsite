-- Login / forgot-password: resolve email, phone, roll number, or registration ID.
-- Run once in Supabase SQL Editor, then reload API schema.

CREATE OR REPLACE FUNCTION public.resolve_login_email(p_identifier text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_raw text := trim(COALESCE(p_identifier, ''));
  v_digits text;
  v_tail text;
  v_emails text[];
BEGIN
  IF v_raw = '' THEN
    RETURN NULL;
  END IF;

  -- Email
  IF position('@' in v_raw) > 0 THEN
    RETURN lower(v_raw);
  END IF;

  -- Registration ID, roll number, or metadata roll (before phone — avoids 12-digit roll being treated as mobile)
  SELECT array_agg(DISTINCT e ORDER BY e)
  INTO v_emails
  FROM (
    SELECT lower(trim(s.email)) AS e
    FROM public.students s
    WHERE s.email IS NOT NULL
      AND trim(s.email) <> ''
      AND (
        lower(trim(s.registration_id)) = lower(v_raw)
        OR trim(s.roll_number) = v_raw
        OR trim(COALESCE(s.metadata->>'rollNo', '')) = v_raw
        OR trim(COALESCE(s.metadata->>'roll_number', '')) = v_raw
        OR trim(COALESCE(s.metadata->>'registration_id', '')) = v_raw
      )
  ) reg_matches;

  IF v_emails IS NOT NULL AND array_length(v_emails, 1) = 1 THEN
    RETURN v_emails[1];
  END IF;

  IF v_emails IS NOT NULL AND array_length(v_emails, 1) > 1 THEN
    RAISE EXCEPTION 'Multiple accounts match this registration or roll number. Contact support.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Phone: only valid Indian mobile shapes (10 digits, 0 + 10, or 91 + 10)
  v_digits := regexp_replace(v_raw, '\D', '', 'g');
  IF length(v_digits) = 10
     OR (length(v_digits) = 11 AND left(v_digits, 1) = '0')
     OR (length(v_digits) = 12 AND left(v_digits, 2) = '91') THEN
    v_tail := public.normalize_phone_tail(v_raw);
    IF v_tail IS NOT NULL THEN
      SELECT array_agg(DISTINCT e ORDER BY e)
      INTO v_emails
      FROM (
        SELECT lower(trim(s.email)) AS e
        FROM public.students s
        WHERE s.email IS NOT NULL
          AND trim(s.email) <> ''
          AND public.normalize_phone_tail(s.contact_number) = v_tail
        UNION
        SELECT lower(trim(p.email)) AS e
        FROM public.profiles p
        WHERE p.email IS NOT NULL
          AND trim(p.email) <> ''
          AND public.normalize_phone_tail(p.contact_number) = v_tail
        UNION
        SELECT lower(trim(rp.email)) AS e
        FROM public.referral_partners rp
        WHERE rp.email IS NOT NULL
          AND trim(rp.email) <> ''
          AND public.normalize_phone_tail(rp.contact_number) = v_tail
      ) phone_matches;

      IF v_emails IS NULL OR array_length(v_emails, 1) IS NULL THEN
        RETURN NULL;
      END IF;

      IF array_length(v_emails, 1) > 1 THEN
        RAISE EXCEPTION 'Multiple accounts are linked to this phone number. Please sign in with your email address instead.'
          USING ERRCODE = 'P0001';
      END IF;

      RETURN v_emails[1];
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
