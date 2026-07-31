-- RDS gap-fill part 9: payment_orders, certificate directory, slim leads pages,
-- paginated student light list (avoids Lambda 6MB payload / 500s).

-- ─── payment_orders (Razorpay order API + webhook) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT UNIQUE NOT NULL,
  user_email TEXT NOT NULL,
  user_phone TEXT,
  amount BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_id TEXT,
  signature TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_orders_email_idx ON public.payment_orders (lower(user_email));
CREATE INDEX IF NOT EXISTS payment_orders_status_idx ON public.payment_orders (status);
CREATE INDEX IF NOT EXISTS payment_orders_created_at_idx ON public.payment_orders (created_at DESC);

GRANT ALL ON public.payment_orders TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.payment_orders TO anon, authenticated;

-- ─── Paginated light student list (Attendance / Communications) ──────────────
DROP FUNCTION IF EXISTS public.admin_list_students_light();
DROP FUNCTION IF EXISTS public.admin_list_students_light(integer, integer);

CREATE OR REPLACE FUNCTION public.admin_list_students_light(
  p_limit integer DEFAULT 1000,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id text,
  full_name text,
  email text,
  college_name text,
  university_name text,
  created_at timestamptz,
  status text,
  internship_domain text,
  registration_id text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 1000), 2000));
  v_offset integer := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
  PERFORM public.assert_may_admin_list_students();

  RETURN QUERY
  SELECT
    s.id::text,
    s.full_name,
    s.email,
    s.college_name,
    s.university_name,
    public.student_created_at_ts(s),
    s.status,
    s.internship_domain,
    s.registration_id
  FROM public.students s
  ORDER BY public.student_created_at_ts(s) DESC NULLS LAST, s.id DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_students_light(integer, integer) TO authenticated;

-- Keep zero-arg wrapper for older clients (first page only — prefer paginated)
CREATE OR REPLACE FUNCTION public.admin_list_students_light()
RETURNS TABLE (
  id text,
  full_name text,
  email text,
  college_name text,
  university_name text,
  created_at timestamptz,
  status text,
  internship_domain text,
  registration_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.admin_list_students_light(1000, 0);
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_students_light() TO authenticated;

-- ─── Faster attendance counts (text student ids) ─────────────────────────────
DROP FUNCTION IF EXISTS public.admin_get_attendance_counts();

CREATE OR REPLACE FUNCTION public.admin_get_attendance_counts()
RETURNS TABLE(student_id text, day_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '25s'
AS $$
BEGIN
  PERFORM public.assert_may_admin_list_students();

  RETURN QUERY
  WITH distinct_days AS (
    SELECT DISTINCT
      a.student_id::text AS sid,
      (a.marked_at AT TIME ZONE 'Asia/Kolkata')::date AS ist_date
    FROM public.attendance a
    WHERE a.marked_at IS NOT NULL
  )
  SELECT d.sid, COUNT(*)::bigint
  FROM distinct_days d
  JOIN public.students s ON s.id = d.sid
  WHERE
    CASE
      WHEN lower(trim(coalesce(s.university_name, ''))) ~ 'bnmu|bhupendra\s*narayan\s*mandal'
        THEN d.ist_date BETWEEN DATE '2026-05-23' AND DATE '2026-06-21'
      WHEN lower(trim(coalesce(s.university_name, ''))) ~ 'lnmu|lalit\s*narayan|mithila'
        THEN d.ist_date BETWEEN DATE '2026-06-01' AND DATE '2026-06-20'
      ELSE TRUE
    END
  GROUP BY d.sid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_attendance_counts() TO authenticated;

-- ─── Certificate directory (students.id is text on RDS) ──────────────────────
CREATE OR REPLACE FUNCTION public.admin_count_certificates_directory(
  p_search text DEFAULT NULL,
  p_universities text[] DEFAULT NULL,
  p_colleges text[] DEFAULT NULL,
  p_domain text DEFAULT NULL,
  p_mode text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(trim(p_search), '');
BEGIN
  PERFORM public.assert_may_admin_list_students();

  RETURN (
    SELECT count(*)::bigint
    FROM public.certificates c
    LEFT JOIN public.students s ON s.id = c.user_id::text
    WHERE (
      v_search IS NULL
      OR c.student_name ILIKE '%' || v_search || '%'
      OR c.certificate_id ILIKE '%' || v_search || '%'
      OR s.full_name ILIKE '%' || v_search || '%'
      OR s.email ILIKE '%' || v_search || '%'
      OR s.registration_id ILIKE '%' || v_search || '%'
    )
    AND (
      p_universities IS NULL OR cardinality(p_universities) = 0
      OR s.university_name = ANY (p_universities)
    )
    AND (
      p_colleges IS NULL OR cardinality(p_colleges) = 0
      OR s.college_name = ANY (p_colleges)
    )
    AND (
      p_domain IS NULL OR p_domain = '' OR p_domain = 'all'
      OR s.internship_domain = p_domain OR s.course = p_domain
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_certificates_directory(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL,
  p_universities text[] DEFAULT NULL,
  p_colleges text[] DEFAULT NULL,
  p_domain text DEFAULT NULL,
  p_mode text DEFAULT NULL
)
RETURNS SETOF public.certificates
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(trim(p_search), '');
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 50), 500));
  v_offset integer := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
  PERFORM public.assert_may_admin_list_students();

  RETURN QUERY
  SELECT c.*
  FROM public.certificates c
  LEFT JOIN public.students s ON s.id = c.user_id::text
  WHERE (
    v_search IS NULL
    OR c.student_name ILIKE '%' || v_search || '%'
    OR c.certificate_id ILIKE '%' || v_search || '%'
    OR s.full_name ILIKE '%' || v_search || '%'
    OR s.email ILIKE '%' || v_search || '%'
    OR s.registration_id ILIKE '%' || v_search || '%'
  )
  AND (
    p_universities IS NULL OR cardinality(p_universities) = 0
    OR s.university_name = ANY (p_universities)
  )
  AND (
    p_colleges IS NULL OR cardinality(p_colleges) = 0
    OR s.college_name = ANY (p_colleges)
  )
  AND (
    p_domain IS NULL OR p_domain = '' OR p_domain = 'all'
    OR s.internship_domain = p_domain OR s.course = p_domain
  )
  ORDER BY c.created_at DESC NULLS LAST
  LIMIT v_limit OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_count_certificates_directory(text, text[], text[], text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_certificates_directory(integer, integer, text, text[], text[], text, text) TO authenticated;

-- ─── Slim paginated registration leads ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_count_registration_leads(
  p_search text DEFAULT NULL,
  p_university text DEFAULT NULL,
  p_college text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(lower(trim(p_search)), '');
  v_uni text := NULLIF(trim(p_university), '');
  v_col text := NULLIF(trim(p_college), '');
BEGIN
  PERFORM public.assert_may_admin_list_students();

  RETURN (
    SELECT count(*)::bigint
    FROM public.registration_leads rl
    WHERE (
      v_search IS NULL
      OR lower(rl.email) LIKE '%' || v_search || '%'
      OR lower(coalesce(rl.phone, '')) LIKE '%' || v_search || '%'
      OR lower(coalesce(rl.payload->>'fullName', '')) LIKE '%' || v_search || '%'
    )
    AND (
      v_uni IS NULL OR v_uni = 'all'
      OR lower(coalesce(rl.payload->>'university', '')) = lower(v_uni)
    )
    AND (
      v_col IS NULL OR v_col = 'all'
      OR lower(coalesce(rl.payload->>'college', '')) = lower(v_col)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_registration_leads(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL,
  p_university text DEFAULT NULL,
  p_college text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  email text,
  phone text,
  step integer,
  updated_at timestamptz,
  cybercafe_shop_name text,
  cybercafe_email text,
  full_name text,
  university_name text,
  college_name text,
  course text,
  contact text,
  payload jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(lower(trim(p_search)), '');
  v_uni text := NULLIF(trim(p_university), '');
  v_col text := NULLIF(trim(p_college), '');
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
  v_offset integer := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
  PERFORM public.assert_may_admin_list_students();

  RETURN QUERY
  SELECT
    rl.id,
    rl.email,
    rl.phone,
    rl.step,
    rl.updated_at,
    rl.cybercafe_shop_name,
    rl.cybercafe_email,
    coalesce(rl.payload->>'fullName', rl.email)::text,
    coalesce(rl.payload->>'university', rl.payload->>'university_name', '')::text,
    coalesce(rl.payload->>'college', rl.payload->>'college_name', '')::text,
    coalesce(rl.payload->>'course', '')::text,
    coalesce(rl.payload->>'contact', rl.phone, '')::text,
    rl.payload
  FROM public.registration_leads rl
  WHERE (
    v_search IS NULL
    OR lower(rl.email) LIKE '%' || v_search || '%'
    OR lower(coalesce(rl.phone, '')) LIKE '%' || v_search || '%'
    OR lower(coalesce(rl.payload->>'fullName', '')) LIKE '%' || v_search || '%'
  )
  AND (
    v_uni IS NULL OR v_uni = 'all'
    OR lower(coalesce(rl.payload->>'university', '')) = lower(v_uni)
  )
  AND (
    v_col IS NULL OR v_col = 'all'
    OR lower(coalesce(rl.payload->>'college', '')) = lower(v_col)
  )
  ORDER BY rl.updated_at DESC NULLS LAST, rl.id DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_count_registration_leads(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_registration_leads(integer, integer, text, text, text) TO authenticated;

-- Ensure referral overview exists (idempotent)
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
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'staff'::public.app_role);
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

GRANT EXECUTE ON FUNCTION public.admin_referral_overview() TO authenticated;
