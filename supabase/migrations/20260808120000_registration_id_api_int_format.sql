-- New enrollment format: API/INT/{year}/{5-digit seq} e.g. API/INT/2026/00001
-- Legacy IDs (API/{year}/INT/…, EZY/{year}/INT/…) are left unchanged.

CREATE OR REPLACE FUNCTION public.allocate_next_registration_id(p_year integer DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year integer := COALESCE(p_year, extract(year FROM now())::integer);
  v_next integer;
BEGIN
  SELECT COALESCE(
    MAX(
      CASE
        WHEN registration_id ~ ('^API/INT/' || v_year::text || '/[0-9]+$')
        THEN NULLIF(split_part(registration_id, '/', 4), '')::integer
        ELSE NULL
      END
    ),
    0
  ) + 1
  INTO v_next
  FROM public.students;

  RETURN format('API/INT/%s/%s', v_year, lpad(v_next::text, 5, '0'));
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_next_registration_id(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_next_registration_id(integer) TO anon, authenticated;
