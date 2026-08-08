#!/usr/bin/env bash
# Import into AWS RDS staging (does NOT touch production Supabase).
#
# Modes:
#   default — run supabase/migrations/*.sql then optional dumps
#   --restore FILE.sql — pg_restore-style full SQL restore (from --full export)
#
# Usage:
#   export DATABASE_URL='postgresql://ezyintern:PASSWORD@host:5432/ezyintern?sslmode=require'
#   ./aws/scripts/db-import-to-rds.sh
#   ./aws/scripts/db-import-to-rds.sh --restore aws/backups/full_YYYYMMDD.sql
#   ./aws/scripts/db-import-to-rds.sh aws/backups/schema_*.sql aws/backups/public_data_*.sql

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATIONS_DIR="$ROOT/supabase/migrations"
RESTORE_FILE=""
SCHEMA_DUMP=""
DATA_DUMP=""

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Set DATABASE_URL to your RDS connection string (.env.awsrds.local)."
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "Install PostgreSQL client: sudo apt install postgresql-client"
  exit 1
fi

args=("$@")
i=0
while [[ $i -lt ${#args[@]} ]]; do
  arg="${args[$i]}"
  case "$arg" in
    --restore)
      i=$((i + 1))
      RESTORE_FILE="${args[$i]:-}"
      ;;
    *)
      if [[ -z "$SCHEMA_DUMP" ]]; then
        SCHEMA_DUMP="$arg"
      elif [[ -z "$DATA_DUMP" ]]; then
        DATA_DUMP="$arg"
      fi
      ;;
  esac
  i=$((i + 1))
done

echo "→ Testing RDS connection..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT version();" >/dev/null
echo "   Connected."

BOOTSTRAP="$ROOT/aws/scripts/00-supabase-bootstrap.sql"
if [[ -f "$BOOTSTRAP" ]]; then
  echo "→ Applying Supabase-compatible RDS bootstrap (roles, auth schema)..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -f "$BOOTSTRAP"
fi

if [[ -n "$RESTORE_FILE" ]]; then
  if [[ ! -f "$RESTORE_FILE" ]]; then
    echo "❌ Restore file not found: $RESTORE_FILE"
    exit 1
  fi
  echo "→ Full restore from $RESTORE_FILE (staging RDS only)..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -f "$RESTORE_FILE"
  echo "✅ Restore finished."
  psql "$DATABASE_URL" -c "SELECT schemaname, count(*) FROM pg_tables WHERE schemaname IN ('public','auth') GROUP BY schemaname;"
  exit 0
fi

echo "→ Applying supabase/migrations/*.sql in order..."
for f in $(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
  echo "   $(basename "$f")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -f "$f" || {
    echo "⚠️  Migration warning (may already exist): $(basename "$f")"
  }
done

if [[ -n "$SCHEMA_DUMP" && -f "$SCHEMA_DUMP" ]]; then
  echo "→ Applying schema dump: $SCHEMA_DUMP"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -f "$SCHEMA_DUMP"
fi

if [[ -n "$DATA_DUMP" && -f "$DATA_DUMP" ]]; then
  echo "→ Loading data dump: $DATA_DUMP"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -f "$DATA_DUMP"
fi

# Auto-apply latest auth dumps if present and no explicit args
LATEST_AUTH_SCHEMA="$(ls -t "$ROOT/aws/backups"/auth_schema_*.sql 2>/dev/null | head -1 || true)"
LATEST_AUTH_DATA="$(ls -t "$ROOT/aws/backups"/auth_data_*.sql 2>/dev/null | head -1 || true)"
if [[ -z "$SCHEMA_DUMP" && -n "$LATEST_AUTH_SCHEMA" ]]; then
  echo "→ Applying latest auth schema: $LATEST_AUTH_SCHEMA"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -f "$LATEST_AUTH_SCHEMA"
fi
if [[ -z "$DATA_DUMP" && -n "$LATEST_AUTH_DATA" ]]; then
  echo "→ Loading latest auth data: $LATEST_AUTH_DATA"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -f "$LATEST_AUTH_DATA"
fi

echo "✅ RDS import finished."
psql "$DATABASE_URL" -c "SELECT schemaname, count(*) AS tables FROM pg_tables WHERE schemaname IN ('public','auth') GROUP BY schemaname;"
