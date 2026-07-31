-- Run if admin notification history is empty but sends work. Then reload API schema.

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

REVOKE ALL ON FUNCTION public.admin_list_notifications(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_notifications(integer) TO authenticated;
