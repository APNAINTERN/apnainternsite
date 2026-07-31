-- Staff: referral partner student detail, ID-card staff directory, all activity log.

-- 1) admin_referral_partner_students — allow staff (same as admin_referral_overview)
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
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'staff'::public.app_role);
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

REVOKE ALL ON FUNCTION public.admin_referral_partner_students(uuid, int, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_referral_partner_students(uuid, int, int, text) TO authenticated;

-- 2) Staff can list all admin_staff (ID Cards By Category → Staff)
DROP POLICY IF EXISTS "Staff read admin_staff directory" ON public.admin_staff;
CREATE POLICY "Staff read admin_staff directory" ON public.admin_staff
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'staff'::public.app_role));

-- 3) Staff can read all staff activity (profile Activity shows every user)
DROP POLICY IF EXISTS "Staff read own activity" ON public.staff_activity_log;
DROP POLICY IF EXISTS "Staff read all activity" ON public.staff_activity_log;
CREATE POLICY "Staff read all activity" ON public.staff_activity_log
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'staff'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);
