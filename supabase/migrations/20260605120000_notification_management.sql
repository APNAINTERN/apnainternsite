-- Targeted notifications with per-student deliveries and read tracking.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS target_universities text[],
  ADD COLUMN IF NOT EXISTS target_colleges text[],
  ADD COLUMN IF NOT EXISTS target_domains text[],
  ADD COLUMN IF NOT EXISTS recipient_count integer,
  ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.notifications SET status = 'published' WHERE status IS NULL;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_target_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_target_type_check
  CHECK (target_type IN ('all', 'specific', 'filtered'));

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_status_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_status_check
  CHECK (status IN ('draft', 'published'));

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_user_unread
  ON public.notification_deliveries (user_id)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notification
  ON public.notification_deliveries (notification_id);

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage notification deliveries" ON public.notification_deliveries;
CREATE POLICY "Admins manage notification deliveries" ON public.notification_deliveries
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND role IN ('admin', 'super_admin')
  )
);

DROP POLICY IF EXISTS "Users read own notification deliveries" ON public.notification_deliveries;
CREATE POLICY "Users read own notification deliveries" ON public.notification_deliveries
FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users mark own notifications read" ON public.notification_deliveries;
CREATE POLICY "Users mark own notifications read" ON public.notification_deliveries
FOR UPDATE USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.admin_count_notification_targets(
  p_target_type text,
  p_target_user_id uuid DEFAULT NULL,
  p_universities text[] DEFAULT NULL,
  p_colleges text[] DEFAULT NULL,
  p_domains text[] DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint;
BEGIN
  PERFORM public.assert_may_admin_list_students();

  IF p_target_type = 'specific' THEN
    IF p_target_user_id IS NULL THEN
      RETURN 0;
    END IF;
    SELECT count(*) INTO v_count FROM public.students s WHERE s.id = p_target_user_id;
    RETURN v_count;
  END IF;

  IF p_target_type = 'all'
     OR public.class_targets_are_universal(p_universities, p_colleges, p_domains, NULL) THEN
    SELECT count(*) INTO v_count FROM public.students;
    RETURN v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.students s
  WHERE public.student_matches_class_targets(
    s.id, p_universities, p_colleges, p_domains, NULL
  );
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public._notification_fan_out_deliveries(p_notification_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n public.notifications%ROWTYPE;
  v_inserted integer;
BEGIN
  SELECT * INTO v_n FROM public.notifications WHERE id = p_notification_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  DELETE FROM public.notification_deliveries WHERE notification_id = p_notification_id;

  IF v_n.target_type = 'specific' AND v_n.target_user_id IS NOT NULL THEN
    INSERT INTO public.notification_deliveries (notification_id, user_id)
    SELECT p_notification_id, s.id
    FROM public.students s
    WHERE s.id = v_n.target_user_id
    ON CONFLICT (notification_id, user_id) DO NOTHING;
  ELSIF v_n.target_type = 'all'
    OR public.class_targets_are_universal(
      v_n.target_universities, v_n.target_colleges, v_n.target_domains, NULL
    ) THEN
    INSERT INTO public.notification_deliveries (notification_id, user_id)
    SELECT p_notification_id, s.id FROM public.students s
    ON CONFLICT (notification_id, user_id) DO NOTHING;
  ELSE
    INSERT INTO public.notification_deliveries (notification_id, user_id)
    SELECT p_notification_id, s.id
    FROM public.students s
    WHERE public.student_matches_class_targets(
      s.id,
      v_n.target_universities,
      v_n.target_colleges,
      v_n.target_domains,
      NULL
    )
    ON CONFLICT (notification_id, user_id) DO NOTHING;
  END IF;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  UPDATE public.notifications
  SET recipient_count = v_inserted, updated_at = now()
  WHERE id = p_notification_id;
  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_publish_notification(p_row jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_target_type text;
  v_status text;
  v_target_user_id uuid;
BEGIN
  PERFORM public.assert_may_admin_list_students();

  v_target_type := COALESCE(NULLIF(trim(p_row->>'target_type'), ''), 'filtered');
  IF v_target_type NOT IN ('all', 'specific', 'filtered') THEN
    v_target_type := 'filtered';
  END IF;

  v_status := COALESCE(NULLIF(trim(p_row->>'status'), ''), 'published');
  IF v_status NOT IN ('draft', 'published') THEN
    v_status := 'published';
  END IF;

  v_target_user_id := NULLIF(trim(p_row->>'target_user_id'), '')::uuid;

  INSERT INTO public.notifications (
    title,
    message,
    target_type,
    target_user_id,
    target_universities,
    target_colleges,
    target_domains,
    status,
    class_id,
    created_by
  )
  VALUES (
    trim(p_row->>'title'),
    trim(p_row->>'message'),
    v_target_type,
    v_target_user_id,
    CASE
      WHEN p_row ? 'target_universities' AND jsonb_typeof(p_row->'target_universities') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_universities'))
      ELSE NULL
    END,
    CASE
      WHEN p_row ? 'target_colleges' AND jsonb_typeof(p_row->'target_colleges') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_colleges'))
      ELSE NULL
    END,
    CASE
      WHEN p_row ? 'target_domains' AND jsonb_typeof(p_row->'target_domains') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_domains'))
      ELSE NULL
    END,
    v_status,
    NULLIF(trim(p_row->>'class_id'), '')::uuid,
    NULLIF(trim(p_row->>'created_by'), '')::uuid
  )
  RETURNING id INTO v_id;

  IF v_status = 'published' THEN
    PERFORM public._notification_fan_out_deliveries(v_id);
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_notification_draft(p_id uuid, p_row jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_may_admin_list_students();

  IF NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.id = p_id AND n.status = 'draft'
  ) THEN
    RAISE EXCEPTION 'Only draft notifications can be edited';
  END IF;

  UPDATE public.notifications
  SET
    title = trim(p_row->>'title'),
    message = trim(p_row->>'message'),
    target_type = COALESCE(NULLIF(trim(p_row->>'target_type'), ''), target_type),
    target_user_id = NULLIF(trim(p_row->>'target_user_id'), '')::uuid,
    target_universities = CASE
      WHEN p_row ? 'target_universities' AND jsonb_typeof(p_row->'target_universities') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_universities'))
      ELSE NULL
    END,
    target_colleges = CASE
      WHEN p_row ? 'target_colleges' AND jsonb_typeof(p_row->'target_colleges') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_colleges'))
      ELSE NULL
    END,
    target_domains = CASE
      WHEN p_row ? 'target_domains' AND jsonb_typeof(p_row->'target_domains') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_row->'target_domains'))
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_publish_notification_draft(p_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_may_admin_list_students();

  UPDATE public.notifications
  SET status = 'published', updated_at = now()
  WHERE id = p_id AND status = 'draft';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft notification not found';
  END IF;

  RETURN public._notification_fan_out_deliveries(p_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_notify_class_published(p_class_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c public.classes%ROWTYPE;
  v_title text;
  v_message text;
  v_when text;
  v_id uuid;
  v_target_type text;
  v_domains text[];
  v_domain_name text;
BEGIN
  PERFORM public.assert_may_admin_list_students();

  SELECT * INTO v_c FROM public.classes WHERE id = p_class_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class not found';
  END IF;

  v_domains := v_c.target_domains;
  IF (v_domains IS NULL OR cardinality(v_domains) = 0) AND v_c.domain_id IS NOT NULL THEN
    SELECT name INTO v_domain_name FROM public.internship_domains WHERE id = v_c.domain_id;
    IF v_domain_name IS NOT NULL THEN
      v_domains := ARRAY[v_domain_name];
    END IF;
  END IF;

  v_when := to_char(v_c.scheduled_at AT TIME ZONE 'Asia/Kolkata', 'FMDD Mon YYYY, HH12:MI AM');
  v_title := 'New live class: ' || COALESCE(v_c.title, 'Session');
  v_message := COALESCE(
    NULLIF(trim(v_c.description), ''),
    'A new class has been scheduled for you.'
  )
    || E'\n\n'
    || 'When: ' || COALESCE(v_when, 'See dashboard')
    || E'\n\n'
    || 'Join from your dashboard Live Classes section.';

  IF public.class_targets_are_universal(
    v_c.target_universities, v_c.target_colleges, v_domains, NULL
  ) THEN
    v_target_type := 'all';
  ELSE
    v_target_type := 'filtered';
  END IF;

  INSERT INTO public.notifications (
    title,
    message,
    target_type,
    target_universities,
    target_colleges,
    target_domains,
    status,
    class_id,
    created_by
  )
  VALUES (
    v_title,
    v_message,
    v_target_type,
    v_c.target_universities,
    v_c.target_colleges,
    v_domains,
    'published',
    p_class_id,
    v_c.created_by
  )
  RETURNING id INTO v_id;

  PERFORM public._notification_fan_out_deliveries(v_id);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_notifications(p_limit integer DEFAULT 100)
RETURNS SETOF public.notifications
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_may_admin_list_students();
  RETURN QUERY
  SELECT n.*
  FROM public.notifications n
  ORDER BY n.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
END;
$$;

CREATE OR REPLACE FUNCTION public.list_notifications_for_student()
RETURNS TABLE (
  id uuid,
  title text,
  message text,
  created_at timestamptz,
  read_at timestamptz,
  is_read boolean,
  class_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    n.id,
    n.title,
    n.message,
    n.created_at,
    d.read_at,
    (d.read_at IS NOT NULL) AS is_read,
    n.class_id
  FROM public.notification_deliveries d
  JOIN public.notifications n ON n.id = d.notification_id
  WHERE d.user_id = auth.uid()
    AND n.status = 'published'
  ORDER BY n.created_at DESC
  LIMIT 100;
$$;

CREATE OR REPLACE FUNCTION public.student_unread_notification_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::bigint
  FROM public.notification_deliveries d
  JOIN public.notifications n ON n.id = d.notification_id
  WHERE d.user_id = auth.uid()
    AND d.read_at IS NULL
    AND n.status = 'published';
$$;

CREATE OR REPLACE FUNCTION public.student_mark_notification_read(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notification_deliveries
  SET read_at = COALESCE(read_at, now())
  WHERE notification_id = p_notification_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    INSERT INTO public.notification_deliveries (notification_id, user_id, read_at)
    SELECT p_notification_id, auth.uid(), now()
    FROM public.notifications n
    WHERE n.id = p_notification_id
      AND n.status = 'published'
      AND (
        n.target_type = 'all'
        OR (n.target_type = 'specific' AND n.target_user_id = auth.uid())
      )
    ON CONFLICT (notification_id, user_id)
    DO UPDATE SET read_at = COALESCE(notification_deliveries.read_at, now());
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_notifications(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_count_notification_targets(text, uuid, text[], text[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_publish_notification(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_notification_draft(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_publish_notification_draft(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_notify_class_published(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_notifications_for_student() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_unread_notification_count() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_mark_notification_read(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_list_notifications(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_count_notification_targets(text, uuid, text[], text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_publish_notification(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_notification_draft(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_publish_notification_draft(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_notify_class_published(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_notifications_for_student() TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_unread_notification_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_mark_notification_read(uuid) TO authenticated;
