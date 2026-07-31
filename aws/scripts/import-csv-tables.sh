#!/usr/bin/env bash
# Import CSV exports from eZYINTERNDATA/ into RDS (after schema exists).
#
# Usage:
#   export DATABASE_URL='postgresql://...'   # from .env.awsrds.local
#   ./aws/scripts/import-csv-tables.sh
#   ./aws/scripts/import-csv-tables.sh /path/to/eZYINTERNDATA

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CSV_DIR="${1:-$ROOT/eZYINTERNDATA}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -f "$ROOT/.env.awsrds.local" ]]; then
    DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ROOT/.env.awsrds.local" | head -1 | cut -d= -f2- | tr -d '"')"
    export DATABASE_URL
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Set DATABASE_URL in .env.awsrds.local"
  exit 1
fi

if [[ ! -d "$CSV_DIR" ]]; then
  echo "CSV folder not found: $CSV_DIR"
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "Install: sudo apt install postgresql-client"
  exit 1
fi

detect_delim() {
  local file="$1"
  local header
  header="$(head -1 "$file")"
  local sc="${header//[^;]/}"
  local cc="${header//[^,]/}"
  if ((${#sc} > ${#cc})); then echo ";"; else echo ","; fi
}

resolve_file() {
  local name="$1"
  local f
  for f in "$CSV_DIR/${name}.csv" "$CSV_DIR/${name}-export.csv" "$CSV_DIR/${name}"-export-*.csv; do
    [[ -f "$f" ]] && echo "$f" && return 0
  done
  return 1
}

copy_table() {
  local schema="$1"
  local table="$2"
  local file="$3"
  local delim
  delim="$(detect_delim "$file")"
  echo "→ ${schema}.${table}  ($(basename "$file"), delim='${delim}')"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -c "SET session_replication_role = replica;" >/dev/null 2>&1 || true
  psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -c "\\copy ${schema}.${table} FROM '${file}' WITH (FORMAT csv, HEADER true, DELIMITER '${delim}', NULL '')" || {
    echo "⚠️  Import issue: ${schema}.${table}"
  }
}

echo "→ Import from $CSV_DIR"
psql "$DATABASE_URL" -c "SELECT version();" >/dev/null

# FK-safe order (public tables). Auth first.
AUTH_USERS="$(resolve_file auth_users-export || resolve_file auth_users || true)"
AUTH_IDENT="$(resolve_file auth_identities-export || resolve_file auth_identities || true)"

if [[ -n "$AUTH_USERS" ]]; then
  copy_table auth users "$AUTH_USERS"
fi
if [[ -n "$AUTH_IDENT" ]]; then
  copy_table auth identities "$AUTH_IDENT"
fi

PUBLIC_ORDER=(
  universities colleges departments internship_domains
  referral_partners cybercafe_profiles
  profiles user_roles user_security admin_staff admin_permissions
  students academic_info registration_leads prefilled_students
  payment_config public_payment_config payment_success
  colleges college_student_rosters college_roster_summary college_admin_assignments
  classes learning_materials assignments assignment_submissions
  certificates notifications notification_deliveries
  attendance attendance_settings
  password_resets referral_clicks admin_logs
  site_settings system_settings email_send_state support_queries
)

for t in "${PUBLIC_ORDER[@]}"; do
  f="$(resolve_file "$t" 2>/dev/null || true)"
  [[ -n "$f" ]] && copy_table public "$t" "$f"
done

echo "→ Remaining *-export-*.csv files..."
shopt -s nullglob
for f in "$CSV_DIR"/*-export-*.csv "$CSV_DIR"/*.csv; do
  [[ -f "$f" ]] || continue
  base="$(basename "$f")"
  [[ "$base" == auth_users* || "$base" == auth_identities* ]] && continue
  t="${base%%-export-*}"
  [[ "$t" == "$base" ]] && t="${base%.csv}"
  skip=false
  for done in "${PUBLIC_ORDER[@]}"; do
    [[ "$t" == "$done" ]] && skip=true && break
  done
  $skip && continue
  copy_table public "$t" "$f" 2>/dev/null || copy_table public "$t" "$f"
done

echo "✅ Import pass done. Run: npm run aws:rds:verify"
