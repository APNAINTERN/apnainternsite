-- Restore each student's OWN password after bulk universal-password hotfix.
--
-- IMPORTANT (Lovable SQL editor):
--   Run ONE highlighted block at a time. Do NOT run the whole file — "Query failed" is common.
--
-- Prerequisites (run once if missing):
--   hotfix_bulk_student_single_password.sql STEP 1 only
--   OR hotfix_student_auth_login.sql
--
-- If BLOCK A shows can_restore_count = 0, originals are not in payment_orders/leads — restore cannot run.

-- =============================================================================
-- BLOCK A — PREVIEW counts (run only lines below until next === line)
-- =============================================================================
SELECT count(*) AS can_restore_from_orders
FROM public.students s
WHERE coalesce(trim(s.email), '') <> ''
  AND EXISTS (
    SELECT 1
    FROM public.payment_orders po
    WHERE lower(trim(coalesce(po.metadata->>'email', po.user_email, ''))) = lower(trim(s.email))
      AND (po.status = 'success' OR (po.payment_id IS NOT NULL AND trim(po.payment_id) ~* '^pay_'))
      AND nullif(trim(po.metadata->>'password'), '') IS NOT NULL
      AND length(trim(po.metadata->>'password')) >= 5
      AND trim(po.metadata->>'password') IS DISTINCT FROM coalesce(nullif(trim(s.metadata->>'password'), ''), 'EzyIntern@2026')
  );

-- =============================================================================
-- BLOCK B — Sample emails that would be restored (run alone)
-- =============================================================================
SELECT
  s.email,
  nullif(trim(s.metadata->>'password'), '') AS current_pw,
  (
    SELECT nullif(trim(po.metadata->>'password'), '')
    FROM public.payment_orders po
    WHERE lower(trim(coalesce(po.metadata->>'email', po.user_email, ''))) = lower(trim(s.email))
      AND (po.status = 'success' OR (po.payment_id IS NOT NULL AND trim(po.payment_id) ~* '^pay_'))
      AND nullif(trim(po.metadata->>'password'), '') IS NOT NULL
    ORDER BY po.updated_at DESC NULLS LAST
    LIMIT 1
  ) AS restore_pw
FROM public.students s
WHERE coalesce(trim(s.email), '') <> ''
ORDER BY s.email
LIMIT 50;

-- =============================================================================
-- BLOCK C — RESTORE (run alone; change v_universal if needed)
-- =============================================================================
DO $$
DECLARE
  v_universal text := 'EzyIntern@2026';
  r record;
  v_uid uuid;
  v_ok int := 0;
  v_skip int := 0;
  v_fail int := 0;
BEGIN
  IF to_regprocedure('public._set_auth_user_password_internal(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Missing _set_auth_user_password_internal. Run hotfix_student_auth_login.sql or bulk STEP 1 first.';
  END IF;

  SET LOCAL statement_timeout = '600s';

  FOR r IN
    SELECT
      lower(trim(s.email)) AS email,
      (
        SELECT nullif(trim(po.metadata->>'password'), '')
        FROM public.payment_orders po
        WHERE lower(trim(coalesce(po.metadata->>'email', po.user_email, ''))) = lower(trim(s.email))
          AND (po.status = 'success' OR (po.payment_id IS NOT NULL AND trim(po.payment_id) ~* '^pay_'))
          AND nullif(trim(po.metadata->>'password'), '') IS NOT NULL
          AND length(trim(po.metadata->>'password')) >= 5
        ORDER BY po.updated_at DESC NULLS LAST
        LIMIT 1
      ) AS restore_password,
      nullif(trim(s.metadata->>'password'), '') AS current_pw
    FROM public.students s
    WHERE coalesce(trim(s.email), '') <> ''
  LOOP
    IF r.restore_password IS NULL
       OR r.restore_password = coalesce(r.current_pw, v_universal)
       OR r.restore_password = v_universal THEN
      v_skip := v_skip + 1;
      CONTINUE;
    END IF;

    SELECT u.id INTO v_uid
    FROM auth.users u
    WHERE lower(trim(u.email)) = r.email
    LIMIT 1;

    IF v_uid IS NULL THEN
      v_skip := v_skip + 1;
      CONTINUE;
    END IF;

    BEGIN
      PERFORM public._set_auth_user_password_internal(v_uid, r.email, r.restore_password);
      v_ok := v_ok + 1;
    EXCEPTION
      WHEN OTHERS THEN
        v_fail := v_fail + 1;
        RAISE WARNING 'restore failed %: %', r.email, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'Restore done: ok=%, skip=%, fail=%', v_ok, v_skip, v_fail;
END $$;

-- =============================================================================
-- BLOCK D — Check function exists (run if BLOCK C fails immediately)
-- =============================================================================
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('_set_auth_user_password_internal', 'student_exchange_login_otp')
ORDER BY 1;
