-- RDS gap-fill part 2: student notification RPCs (class_id is text on migrated RDS).

-- class_id is text on migrated RDS (not uuid)
CREATE OR REPLACE FUNCTION public.list_notifications_for_student()
RETURNS TABLE (
  id uuid,
  title text,
  message text,
  created_at timestamptz,
  read_at timestamptz,
  is_read boolean,
  class_id text
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

GRANT EXECUTE ON FUNCTION public.list_notifications_for_student() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_notifications(integer) TO authenticated;
