-- Fix referral admin / promoter student search by phone (digits only, ignores spaces/+91).

CREATE OR REPLACE FUNCTION public.referral_text_matches_search(p_haystack text, p_search text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_search IS NULL
    OR trim(p_search) = ''
    OR lower(coalesce(p_haystack, '')) LIKE '%' || lower(trim(p_search)) || '%'
    OR (
      length(regexp_replace(trim(p_search), '[^0-9]', '', 'g')) >= 3
      AND regexp_replace(coalesce(p_haystack, ''), '[^0-9]', '', 'g')
        LIKE '%' || regexp_replace(trim(p_search), '[^0-9]', '', 'g') || '%'
    );
$$;

CREATE OR REPLACE FUNCTION public.referral_partner_list_students(
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0,
  p_search text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_limit int;
  v_offset int;
  v_search text;
  v_total bigint;
  v_rows json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated', 'rows', '[]'::json, 'total', 0);
  END IF;

  SELECT rp.referral_code INTO v_code
  FROM public.referral_partners rp
  WHERE rp.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_code IS NULL THEN
    RETURN json_build_object('error', 'no_partner', 'rows', '[]'::json, 'total', 0);
  END IF;

  v_limit := greatest(1, least(coalesce(p_limit, 20), 100));
  v_offset := greatest(coalesce(p_offset, 0), 0);
  v_search := nullif(trim(coalesce(p_search, '')), '');

  SELECT count(*)::bigint INTO v_total
  FROM public.students s
  WHERE lower(trim(COALESCE(s.referral_code, ''))) = lower(trim(v_code))
    AND (
      v_search IS NULL
      OR public.referral_text_matches_search(s.full_name, v_search)
      OR public.referral_text_matches_search(s.email, v_search)
      OR public.referral_text_matches_search(s.contact_number, v_search)
      OR public.referral_text_matches_search(s.college_name, v_search)
      OR public.referral_text_matches_search(s.university_name, v_search)
      OR public.referral_text_matches_search(s.registration_id, v_search)
    );

  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v_rows
  FROM (
    SELECT
      s.id,
      s.full_name,
      s.email,
      s.contact_number,
      s.college_name,
      s.university_name,
      s.course,
      s.degree,
      s.department,
      s.gender,
      s.class_semester,
      s.academic_session,
      s.roll_number,
      s.parent_name,
      s.registration_id,
      s.internship_domain,
      s.emergency_name,
      s.emergency_contact,
      s.emergency_relation,
      s.status,
      s.created_at,
      s.referral_code
    FROM public.students s
    WHERE lower(trim(COALESCE(s.referral_code, ''))) = lower(trim(v_code))
      AND (
        v_search IS NULL
        OR public.referral_text_matches_search(s.full_name, v_search)
        OR public.referral_text_matches_search(s.email, v_search)
        OR public.referral_text_matches_search(s.contact_number, v_search)
        OR public.referral_text_matches_search(s.college_name, v_search)
        OR public.referral_text_matches_search(s.university_name, v_search)
        OR public.referral_text_matches_search(s.registration_id, v_search)
      )
    ORDER BY s.created_at DESC NULLS LAST
    LIMIT v_limit
    OFFSET v_offset
  ) t;

  RETURN json_build_object(
    'rows', coalesce(v_rows, '[]'::json),
    'total', coalesce(v_total, 0),
    'limit', v_limit,
    'offset', v_offset
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_referral_partner_students(
  p_partner_id uuid,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0,
  p_search text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
  v_code text;
  v_limit int;
  v_offset int;
  v_search text;
  v_total bigint;
  v_rows json;
BEGIN
  v_ok := public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role);
  IF NOT v_ok THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  SELECT rp.referral_code INTO v_code
  FROM public.referral_partners rp
  WHERE rp.id = p_partner_id;

  IF v_code IS NULL THEN
    RETURN json_build_object('error', 'partner_not_found', 'rows', '[]'::json, 'total', 0);
  END IF;

  v_limit := greatest(1, least(coalesce(p_limit, 20), 100));
  v_offset := greatest(coalesce(p_offset, 0), 0);
  v_search := nullif(trim(coalesce(p_search, '')), '');

  SELECT count(*)::bigint INTO v_total
  FROM public.students s
  WHERE lower(trim(COALESCE(s.referral_code, ''))) = lower(trim(v_code))
    AND (
      v_search IS NULL
      OR public.referral_text_matches_search(s.full_name, v_search)
      OR public.referral_text_matches_search(s.email, v_search)
      OR public.referral_text_matches_search(s.contact_number, v_search)
      OR public.referral_text_matches_search(s.college_name, v_search)
    );

  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v_rows
  FROM (
    SELECT
      s.id,
      s.full_name,
      s.email,
      s.contact_number,
      s.college_name,
      s.university_name,
      s.course,
      s.status,
      s.registration_id,
      s.created_at
    FROM public.students s
    WHERE lower(trim(COALESCE(s.referral_code, ''))) = lower(trim(v_code))
      AND (
        v_search IS NULL
        OR public.referral_text_matches_search(s.full_name, v_search)
        OR public.referral_text_matches_search(s.email, v_search)
        OR public.referral_text_matches_search(s.contact_number, v_search)
        OR public.referral_text_matches_search(s.college_name, v_search)
      )
    ORDER BY s.created_at DESC NULLS LAST
    LIMIT v_limit
    OFFSET v_offset
  ) t;

  RETURN json_build_object(
    'rows', coalesce(v_rows, '[]'::json),
    'total', coalesce(v_total, 0),
    'limit', v_limit,
    'offset', v_offset
  );
END;
$$;

REVOKE ALL ON FUNCTION public.referral_text_matches_search(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.referral_text_matches_search(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.referral_partner_list_students(int, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.referral_partner_list_students(int, int, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_referral_partner_students(uuid, int, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_referral_partner_students(uuid, int, int, text) TO authenticated;
