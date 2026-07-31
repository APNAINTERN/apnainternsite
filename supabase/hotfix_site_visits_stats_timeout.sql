-- Fix admin dashboard site_visits stats (500 / statement timeout).
-- The site_visits table is large enough that even a windowed count(*) times out
-- (57014). Scanning is not viable, so this reads planner statistics instead:
--   * total_visits   -> pg_class.reltuples (estimated row count, instant)
--   * unique_visitors-> pg_stats.n_distinct for visitor_id (instant estimate)
-- These are approximate but read only catalog stats, so the RPC never 500s.
-- Stats are kept fresh automatically by autovacuum/ANALYZE.
-- Safe to re-run in Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.admin_site_visit_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '4s'
AS $$
DECLARE
  v_total bigint := 0;
  v_unique bigint := 0;
  v_nd real;
BEGIN
  PERFORM public.assert_may_admin_list_students();

  -- Estimated total rows (reltuples is -1 when never analyzed -> clamp to 0).
  SELECT GREATEST(c.reltuples, 0)::bigint INTO v_total
  FROM pg_class c
  WHERE c.oid = 'public.site_visits'::regclass;

  -- Estimated distinct visitors from column statistics.
  --   n_distinct >= 0 : absolute estimate of distinct values
  --   n_distinct <  0 : negative fraction of total rows that are distinct
  SELECT s.n_distinct INTO v_nd
  FROM pg_stats s
  WHERE s.schemaname = 'public'
    AND s.tablename = 'site_visits'
    AND s.attname = 'visitor_id';

  IF v_nd IS NULL THEN
    v_unique := 0;
  ELSIF v_nd >= 0 THEN
    v_unique := v_nd::bigint;
  ELSE
    v_unique := GREATEST((-v_nd) * v_total, 0)::bigint;
  END IF;

  RETURN jsonb_build_object(
    'total_visits', v_total,
    'unique_visitors', v_unique
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_site_visit_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_site_visit_stats() TO authenticated;

NOTIFY pgrst, 'reload schema';
