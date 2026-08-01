#!/usr/bin/env bash
# Full cutover: export Supabase (read-only) → import AWS RDS → redeploy Lambda.
# After this, point Vercel at Lambda only (no *.supabase.co).
#
# Prerequisites:
#   .env with AWS_*, DATABASE_URL, SUPABASE_DB_URL, RAZORPAY_*, SMTP_*
#
# Usage:
#   bash scripts/migrate-supabase-to-rds.sh
#   bash scripts/migrate-supabase-to-rds.sh --skip-export   # RDS restore only (backup exists)

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.local/bin:$PATH"

SKIP_EXPORT=false
for arg in "$@"; do
  [[ "$arg" == "--skip-export" ]] && SKIP_EXPORT=true
done

if [[ ! -f .env ]]; then
  echo "❌ Missing .env — copy .env.setup.example"
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a

missing=()
[[ -z "${DATABASE_URL:-}" ]] && missing+=("DATABASE_URL")
[[ -z "${AWS_ACCESS_KEY_ID:-}" ]] && missing+=("AWS_ACCESS_KEY_ID")
if [[ "$SKIP_EXPORT" == false && -z "${SUPABASE_DB_URL:-}" ]]; then
  missing+=("SUPABASE_DB_URL")
fi
if ((${#missing[@]})); then
  echo "❌ Missing in .env: ${missing[*]}"
  echo ""
  echo "SUPABASE_DB_URL = Supabase → Settings → Database → URI (direct, port 5432)"
  echo "  postgresql://postgres.unqfphgjilxpbzajcdjl:YOUR_DB_PASSWORD@db.unqfphgjilxpbzajcdjl.supabase.co:5432/postgres"
  exit 1
fi

echo "▶ Step 1/4: Export from Supabase (read-only)..."
if [[ "$SKIP_EXPORT" == false ]]; then
  npm run aws:rds:export:full
else
  echo "   Skipped (--skip-export)"
fi

BACKUP="$(ls -t "$ROOT/aws/backups"/full_*.sql 2>/dev/null | head -1 || true)"
if [[ -z "$BACKUP" ]]; then
  echo "❌ No aws/backups/full_*.sql found. Run export first or remove --skip-export."
  exit 1
fi
echo "   Using backup: $BACKUP"

echo "▶ Step 2/4: Import into AWS RDS..."
npm run aws:rds:import -- --restore "$BACKUP"
npm run aws:rds:verify

echo "▶ Step 3/4: Redeploy Lambda API..."
npm run aws:lambda:deploy

API_URL="$(aws cloudformation describe-stacks \
  --stack-name ezyintern-api-staging \
  --region "${AWS_DEFAULT_REGION:-ap-south-1}" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiBaseUrl'].OutputValue" \
  --output text 2>/dev/null || true)"

echo "▶ Step 4/4: Vercel environment (manual — copy these)"
cat <<EOF

═══════════════════════════════════════════════════════════════
  AWS RDS ONLY — update Vercel Environment Variables:
═══════════════════════════════════════════════════════════════

VITE_SUPABASE_URL=${API_URL}
VITE_SITE_API_ORIGIN=${API_URL}
VITE_PUBLIC_APP_URL=https://www.apnaintern.in
VITE_SUPABASE_PUBLISHABLE_KEY=local-anon-key
VITE_SUPABASE_PROJECT_ID=apnaintern-local

Remove or stop using *.supabase.co URLs.

Then Redeploy Vercel.

Health: ${API_URL}/api/health
═══════════════════════════════════════════════════════════════
EOF

curl -fsSL "${API_URL}/api/health" && echo "" || echo "⚠️  Health check failed"
