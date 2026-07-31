#!/usr/bin/env bash
# Create staging S3 buckets for Supabase storage migration (aws-work only).
#
# Usage:
#   ./aws/scripts/provision-s3-storage.sh
#
# Requires AWS_* in .env (same as RDS/Lambda scripts).

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export PATH="$HOME/.local/bin:$PATH"
REGION="${AWS_DEFAULT_REGION:-ap-south-1}"
STACK_NAME="${S3_STACK_NAME:-ezyintern-s3-staging}"
TEMPLATE="$ROOT/aws/infrastructure/s3-storage-template.yaml"

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

if ! command -v aws >/dev/null 2>&1; then
  echo "❌ AWS CLI not found."
  exit 1
fi

if ! aws sts get-caller-identity --region "$REGION" >/dev/null 2>&1; then
  echo "❌ AWS credentials missing. Add AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY to .env or run aws configure."
  exit 1
fi

echo "▶ Creating S3 stack $STACK_NAME in $REGION ..."
aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --template-file "$TEMPLATE" \
  --parameter-overrides ProjectName=ezyintern StageName=staging \
  --no-fail-on-empty-changeset

echo ""
echo "✅ S3 buckets:"
aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs' \
  --output table

echo ""
echo "Next: npm run aws:s3:sync   # upload bucket-*-files/ folders"
