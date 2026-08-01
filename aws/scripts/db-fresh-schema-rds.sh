#!/usr/bin/env bash
# Fresh AWS RDS schema only — NO Supabase export / CSV / data dumps.
#
# Usage:
#   export DATABASE_URL='postgresql://user:pass@host:5432/db?sslmode=require'
#   ./aws/scripts/db-fresh-schema-rds.sh
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATIONS_DIR="$ROOT/supabase/migrations"
LOG_DIR="$ROOT/aws/backups"
LOG_FILE="${LOG_DIR}/fresh-schema-$(date +%Y%m%d_%H%M%S).log"

PRE_MIGRATION_SQL=(
  "$ROOT/supabase/full_setup.sql"
  "$ROOT/supabase/add_staff_role.sql"
  "$ROOT/aws/scripts/02-rds-base-tables.sql"
  "$ROOT/supabase/create_notifications.sql"
  "$ROOT/supabase/update_payment_schema.sql"
  "$ROOT/supabase/unified_fix.sql"
  "$ROOT/supabase/custom_otp_reset.sql"
  "$ROOT/supabase/hotfix_assignment_management_complete.sql"
  "$ROOT/supabase/site_settings.sql"
  "$ROOT/supabase/add_whatsapp_link_to_settings.sql"
)

POST_MIGRATION_SQL=(
  "$ROOT/supabase/migrations/20260509120000_account_login_route_rpcs.sql"
  "$ROOT/supabase/migrations/20260605120000_notification_management.sql"
)

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Set DATABASE_URL (see .env.awsrds.local)."
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "Install PostgreSQL client: sudo apt install -y postgresql-client"
  exit 1
fi

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

run_sql() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=0 "$@"
}

echo "═══════════════════════════════════════════════════════════════"
echo " Fresh RDS schema (no data export) — $(date -Iseconds)"
echo " Log: $LOG_FILE"
echo "═══════════════════════════════════════════════════════════════"

echo "→ Testing RDS connection..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT version();" >/dev/null
echo "   Connected."

echo "→ Dropping application schemas (public, auth, storage)..."
run_sql <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
DROP SCHEMA IF EXISTS auth CASCADE;
DROP SCHEMA IF EXISTS storage CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO public;
SQL

echo "→ Bootstrap (extensions, roles, auth tables)..."
run_sql -f "$ROOT/aws/scripts/00-supabase-bootstrap.sql"

echo "→ Base schema SQL (full_setup + supplemental tables)..."
for f in "${PRE_MIGRATION_SQL[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "   ⚠️  skip missing: $f"
    continue
  fi
  echo "   $(basename "$f")"
  run_sql -f "$f" || echo "   ⚠️  warning: $(basename "$f")"
done

echo "→ Applying supabase/migrations/*.sql..."
for f in $(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
  echo "   $(basename "$f")"
  run_sql -f "$f" || echo "   ⚠️  warning: $(basename "$f")"
done

echo "→ Re-applying RPC migrations that depend on base tables..."
for f in "${POST_MIGRATION_SQL[@]}"; do
  if [[ ! -f "$f" ]]; then
    continue
  fi
  echo "   $(basename "$f")"
  run_sql -f "$f" || echo "   ⚠️  warning: $(basename "$f")"
done

echo "→ Applying aws/scripts RDS gap-fill SQL (schema/RPC fixes, no data import)..."
for f in $(ls "$ROOT/aws/scripts"/[0-9]*.sql 2>/dev/null | sort); do
  base="$(basename "$f")"
  case "$base" in
    00-supabase-bootstrap.sql|17-rds-import-update-data-20260721.sql)
      continue
      ;;
  esac
  echo "   $base"
  run_sql -f "$f" || echo "   ⚠️  warning: $base"
done

echo "→ Verification..."
psql "$DATABASE_URL" -c "
SELECT schemaname, count(*) AS tables
FROM pg_tables
WHERE schemaname IN ('public','auth','storage')
GROUP BY schemaname
ORDER BY schemaname;
"
psql "$DATABASE_URL" -c "
SELECT proname
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND proname IN (
    'account_is_student_only',
    'account_requires_admin_login',
    'has_role',
    'resolve_login_email',
    'student_mark_attendance'
  )
ORDER BY proname;
"
psql "$DATABASE_URL" -c "
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'students', 'cybercafe_profiles', 'password_resets',
    'notifications', 'assignments', 'attendance', 'payment_config'
  )
ORDER BY tablename;
"
psql "$DATABASE_URL" -c "
SELECT enumlabel
FROM pg_enum e
JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'app_role'
ORDER BY enumsortorder;
"
psql "$DATABASE_URL" -c "SELECT count(*) AS auth_users FROM auth.users;"

echo "✅ Fresh RDS schema complete (empty database, no Supabase export)."
echo "   Next: create admin user in auth.users or register via the app."
