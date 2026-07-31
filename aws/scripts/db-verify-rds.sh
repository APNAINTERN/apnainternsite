#!/usr/bin/env bash
# Quick RDS connectivity + table counts (staging only).
set -euo pipefail
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Set DATABASE_URL (from .env.awsrds.local)"
  exit 1
fi
echo "→ RDS check"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT current_database(), current_user, inet_server_addr();"
psql "$DATABASE_URL" -c "SELECT schemaname, count(*) AS tables FROM pg_tables WHERE schemaname IN ('public','auth','storage') GROUP BY schemaname ORDER BY schemaname;"
psql "$DATABASE_URL" -c "SELECT count(*) AS auth_users FROM auth.users;" 2>/dev/null || echo "(auth.users not present yet)"
