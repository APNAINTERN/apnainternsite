#!/usr/bin/env bash
# Upload local Supabase export folders → staging S3 buckets.
#
# Local folder                    → S3 bucket (app bucket id)
# bucket-consent-forms-files/     → ezyintern-staging-consent-forms   (consent-forms)
# bucket-logos-files/             → ezyintern-staging-logos           (logos)
# bucket-learning-materials-files/ → ezyintern-staging-learning-materials (learning-materials)
#
# Usage:
#   ./aws/scripts/sync-storage-to-s3.sh
#   ./aws/scripts/sync-storage-to-s3.sh --dry-run

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export PATH="$HOME/.local/bin:$PATH"
REGION="${AWS_DEFAULT_REGION:-ap-south-1}"
STACK_NAME="${S3_STACK_NAME:-ezyintern-s3-staging}"
DRY_RUN=""
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="--dryrun"
fi

if [[ -f "$ROOT/.env" ]]; then
  while IFS= read -r line; do
    [[ "$line" =~ ^(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_DEFAULT_REGION|AWS_SESSION_TOKEN)= ]] || continue
    key="${line%%=*}"
    val="${line#*=}"
    val="${val%\"}"
    val="${val#\"}"
    val="${val%\'}"
    val="${val#\'}"
    export "$key=$val"
  done < "$ROOT/.env"
fi

if ! aws sts get-caller-identity --region "$REGION" >/dev/null 2>&1; then
  echo "❌ AWS credentials missing."
  exit 1
fi

get_output() {
  aws cloudformation describe-stacks \
    --region "$REGION" \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" \
    --output text 2>/dev/null || true
}

CONSENT_BUCKET="$(get_output ConsentFormsBucketName)"
LOGOS_BUCKET="$(get_output LogosBucketName)"
MATERIALS_BUCKET="$(get_output LearningMaterialsBucketName)"

if [[ -z "$CONSENT_BUCKET" || -z "$LOGOS_BUCKET" || -z "$MATERIALS_BUCKET" ]]; then
  echo "❌ S3 stack not found. Run: npm run aws:s3:provision"
  exit 1
fi

sync_one() {
  local src="$1"
  local bucket="$2"
  local label="$3"
  if [[ ! -d "$src" ]]; then
    echo "⚠️  Skip $label — folder missing: $src"
    return
  fi
  local count
  count="$(find "$src" -type f | wc -l | tr -d ' ')"
  echo ""
  echo "▶ $label: $count files → s3://$bucket/"
  aws s3 sync "$src" "s3://$bucket/" \
    --region "$REGION" \
    $DRY_RUN \
    --only-show-errors \
    --no-progress
}

echo "Region: $REGION"
echo "Consent:   s3://$CONSENT_BUCKET"
echo "Logos:     s3://$LOGOS_BUCKET"
echo "Materials: s3://$MATERIALS_BUCKET"

sync_one "$ROOT/bucket-consent-forms-files" "$CONSENT_BUCKET" "consent-forms"
sync_one "$ROOT/bucket-logos-files" "$LOGOS_BUCKET" "logos"
sync_one "$ROOT/bucket-learning-materials-files" "$MATERIALS_BUCKET" "learning-materials"

echo ""
echo "✅ Sync complete."
echo ""
echo "Public URL pattern (staging):"
echo "  https://${CONSENT_BUCKET}.s3.${REGION}.amazonaws.com/<filename>"
echo "  https://${LOGOS_BUCKET}.s3.${REGION}.amazonaws.com/<filename>"
echo "  https://${MATERIALS_BUCKET}.s3.${REGION}.amazonaws.com/<filename>"
