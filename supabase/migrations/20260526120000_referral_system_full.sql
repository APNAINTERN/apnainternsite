-- Referral system: public validation RPC (fixes anon registration attribution),
-- click tracking, partner metadata, paginated list RPCs, case-normalized codes.

ALTER TABLE public.referral_partners
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS college_name text,
  ADD COLUMN IF NOT EXISTS referral_type text NOT NULL DEFAULT 'other';

COMMENT ON COLUMN public.referral_partners.referral_type IS
  'student_ambassador | influencer | partner | other';

CREATE TABLE IF NOT EXISTS public.referral_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code text NOT NULL,
  clicked_at timestamptz NOT NULL DEFAULT now(),
  session_id text
);

CREATE INDEX IF NOT EXISTS idx_referral_clicks_code_lower
  ON public.referral_clicks (lower(trim(referral_code)));
CREATE INDEX IF NOT EXISTS idx_referral_clicks_clicked_at
  ON public.referral_clicks (clicked_at DESC);

ALTER TABLE public.referral_clicks ENABLE ROW LEVEL SECURITY;

-- Normalize existing student attribution to canonical partner codes (case-insensitive match).
UPDATE public.students s
SET referral_code = rp.referral_code
FROM public.referral_partners rp
WHERE s.referral_code IS NOT NULL
  AND lower(trim(s.referral_code)) = lower(trim(rp.referral_code))
  AND s.referral_code IS DISTINCT FROM rp.referral_code;

-- ---------------------------------------------------------------------------
-- validate_referral_code: callable by anon during registration (no partner PII).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_referral_code(p_code text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rp.referral_code
  FROM public.referral_partners rp
  WHERE lower(trim(rp.referral_code)) = lower(trim(nullif(p_code, '')))
    AND rp.active = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.validate_referral_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_referral_code(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- log_referral_click: record link opens (only for valid active codes).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_referral_click(
  p_code text,
  p_session_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  v_code := public.validate_referral_code(p_code);
  IF v_code IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.referral_clicks (referral_code, session_id)
  VALUES (v_code, nullif(trim(p_session_id), ''));
END;
$$;

REVOKE ALL ON FUNCTION public.log_referral_click(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_referral_click(text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- referral_partner_stats: dashboard counters for logged-in promoter.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.referral_partner_stats()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_clicks bigint;
  v_total bigint;
  v_approved bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  SELECT rp.referral_code INTO v_code
  FROM public.referral_partners rp
  WHERE rp.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_code IS NULL THEN
    RETURN json_build_object('error', 'no_partner');
  END IF;

  SELECT count(*)::bigint INTO v_clicks
  FROM public.referral_clicks rc
  WHERE lower(trim(rc.referral_code)) = lower(trim(v_code));

  SELECT count(*)::bigint INTO v_total
  FROM public.students s
  WHERE lower(trim(COALESCE(s.referral_code, ''))) = lower(trim(v_code));

  SELECT count(*)::bigint INTO v_approved
  FROM public.students s
  WHERE lower(trim(COALESCE(s.referral_code, ''))) = lower(trim(v_code))
    AND lower(coalesce(s.status, '')) IN ('active', 'approved');

  RETURN json_build_object(
    'referral_code', v_code,
    'total_clicks', coalesce(v_clicks, 0),
    'total_students', coalesce(v_total, 0),
    'approved_students', coalesce(v_approved, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.referral_partner_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.referral_partner_stats() TO authenticated;

-- ---------------------------------------------------------------------------
-- referral_partner_list_students: paginated student list for promoter portal.
-- ---------------------------------------------------------------------------
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
  v_search := nullif(lower(trim(coalesce(p_search, ''))), '');

  SELECT count(*)::bigint INTO v_total
  FROM public.students s
  WHERE lower(trim(COALESCE(s.referral_code, ''))) = lower(trim(v_code))
    AND (
      v_search IS NULL
      OR lower(coalesce(s.full_name, '')) LIKE '%' || v_search || '%'
      OR lower(coalesce(s.email, '')) LIKE '%' || v_search || '%'
      OR lower(coalesce(s.contact_number, '')) LIKE '%' || v_search || '%'
      OR lower(coalesce(s.college_name, '')) LIKE '%' || v_search || '%'
      OR lower(coalesce(s.university_name, '')) LIKE '%' || v_search || '%'
      OR lower(coalesce(s.registration_id, '')) LIKE '%' || v_search || '%'
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
        OR lower(coalesce(s.full_name, '')) LIKE '%' || v_search || '%'
        OR lower(coalesce(s.email, '')) LIKE '%' || v_search || '%'
        OR lower(coalesce(s.contact_number, '')) LIKE '%' || v_search || '%'
        OR lower(coalesce(s.college_name, '')) LIKE '%' || v_search || '%'
        OR lower(coalesce(s.university_name, '')) LIKE '%' || v_search || '%'
        OR lower(coalesce(s.registration_id, '')) LIKE '%' || v_search || '%'
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

REVOKE ALL ON FUNCTION public.referral_partner_list_students(int, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.referral_partner_list_students(int, int, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- admin_referral_overview: analytics table for admin referrals panel.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_referral_overview()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
  v_rows json;
BEGIN
  v_ok := public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role);
  IF NOT v_ok THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.total_students DESC, t.full_name ASC), '[]'::json)
  INTO v_rows
  FROM (
    SELECT
      rp.id,
      rp.full_name,
      rp.email,
      rp.contact_number,
      rp.referral_code,
      rp.city,
      rp.college_name,
      rp.referral_type,
      rp.active,
      rp.created_at,
      rp.auth_user_id,
      (
        SELECT count(*)::bigint
        FROM public.referral_clicks rc
        WHERE lower(trim(rc.referral_code)) = lower(trim(rp.referral_code))
      ) AS total_clicks,
      (
        SELECT count(*)::bigint
        FROM public.students s
        WHERE lower(trim(COALESCE(s.referral_code, ''))) = lower(trim(rp.referral_code))
      ) AS total_students,
      (
        SELECT count(*)::bigint
        FROM public.students s
        WHERE lower(trim(COALESCE(s.referral_code, ''))) = lower(trim(rp.referral_code))
          AND lower(coalesce(s.status, '')) IN ('active', 'approved')
      ) AS approved_students
    FROM public.referral_partners rp
  ) t;

  RETURN coalesce(v_rows, '[]'::json);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_referral_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_referral_overview() TO authenticated;

-- ---------------------------------------------------------------------------
-- admin_referral_partner_students: paginated signups for one partner (admin).
-- ---------------------------------------------------------------------------
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
  v_search := nullif(lower(trim(coalesce(p_search, ''))), '');

  SELECT count(*)::bigint INTO v_total
  FROM public.students s
  WHERE lower(trim(COALESCE(s.referral_code, ''))) = lower(trim(v_code))
    AND (
      v_search IS NULL
      OR lower(coalesce(s.full_name, '')) LIKE '%' || v_search || '%'
      OR lower(coalesce(s.email, '')) LIKE '%' || v_search || '%'
      OR lower(coalesce(s.contact_number, '')) LIKE '%' || v_search || '%'
      OR lower(coalesce(s.college_name, '')) LIKE '%' || v_search || '%'
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
        OR lower(coalesce(s.full_name, '')) LIKE '%' || v_search || '%'
        OR lower(coalesce(s.email, '')) LIKE '%' || v_search || '%'
        OR lower(coalesce(s.contact_number, '')) LIKE '%' || v_search || '%'
        OR lower(coalesce(s.college_name, '')) LIKE '%' || v_search || '%'
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
