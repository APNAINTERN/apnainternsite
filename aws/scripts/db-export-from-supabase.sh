#!/usr/bin/env bash
# Export from production Supabase → aws/backups/ (READ ONLY — does not change live DB).
#
# Usage (public tables only — Phase 2a):
#   export SUPABASE_DB_URL='postgresql://postgres.[ref]:[PASSWORD]@db.[ref].supabase.co:5432/postgres'
#   ./aws/scripts/db-export-from-supabase.sh
#
# Full clone including auth users (recommended before RDS restore):
#   ./aws/scripts/db-export-from-supabase.sh --full
#
# Use the DIRECT connection (port 5432), not the pooler (6543), for pg_dump.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKUP_DIR="$ROOT/aws/backups"
STAMP="$(date +%Y%m%d_%H%M%S)"
FULL=false

for arg in "$@"; do
  case "$arg" in
    --full) FULL=true ;;
    -h|--help)
      echo "Usage: SUPABASE_DB_URL=... $0 [--full]"
      exit 0
      ;;
  esac
done

mkdir -p "$BACKUP_DIR"

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "Set SUPABASE_DB_URL (Supabase → Project Settings → Database → URI, direct host port 5432)"
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "Install PostgreSQL client: sudo apt install postgresql-client"
  exit 1
fi

if [[ "$FULL" == true ]]; then
  FULL_FILE="$BACKUP_DIR/full_${STAMP}.sql"
  echo "→ Full dump (auth + public + storage metadata) — read-only from Supabase..."
  pg_dump "$SUPABASE_DB_URL" \
    --no-owner \
    --no-privileges \
    --schema=auth \
    --schema=public \
    --schema=storage \
  -f "$FULL_FILE"
  echo "✅ Full dump:"
  echo "   $FULL_FILE"
  echo ""
  echo "Import: DATABASE_URL=... ./aws/scripts/db-import-to-rds.sh --restore $FULL_FILE"
  exit 0
fi

SCHEMA_FILE="$BACKUP_DIR/schema_${STAMP}.sql"
DATA_FILE="$BACKUP_DIR/public_data_${STAMP}.sql"
AUTH_SCHEMA_FILE="$BACKUP_DIR/auth_schema_${STAMP}.sql"
AUTH_DATA_FILE="$BACKUP_DIR/auth_data_${STAMP}.sql"

echo "→ Exporting public schema..."
pg_dump "$SUPABASE_DB_URL" \
  --schema-only \
  --no-owner \
  --no-privileges \
  --schema=public \
  -f "$SCHEMA_FILE"

echo "→ Exporting public data..."
pg_dump "$SUPABASE_DB_URL" \
  --data-only \
  --no-owner \
  --no-privileges \
  --schema=public \
  -f "$DATA_FILE"

echo "→ Exporting auth schema (users, identities)..."
pg_dump "$SUPABASE_DB_URL" \
  --schema-only \
  --no-owner \
  --no-privileges \
  --schema=auth \
  -f "$AUTH_SCHEMA_FILE"

echo "→ Exporting auth data..."
pg_dump "$SUPABASE_DB_URL" \
  --data-only \
  --no-owner \
  --no-privileges \
  --schema=auth \
  -f "$AUTH_DATA_FILE"

echo "✅ Done:"
echo "   $SCHEMA_FILE"
echo "   $DATA_FILE"
echo "   $AUTH_SCHEMA_FILE"
echo "   $AUTH_DATA_FILE"
echo ""
echo "Next: DATABASE_URL=... ./aws/scripts/db-import-to-rds.sh"
