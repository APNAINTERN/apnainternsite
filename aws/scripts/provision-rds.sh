#!/usr/bin/env bash
# Provision staging RDS in ap-south-1 (aws-work branch only).
# Production Supabase is NOT modified.
#
# Usage:
#   export RDS_MASTER_PASSWORD='your-strong-password-min-12-chars'
#   ./aws/scripts/provision-rds.sh
#
# Optional:
#   ALLOWED_CIDR=203.0.113.10/32   # your public IP (recommended)
#   RDS_STACK_NAME=ezyintern-rds-staging

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export PATH="$HOME/.local/bin:$PATH"
REGION="${AWS_DEFAULT_REGION:-ap-south-1}"
STACK_NAME="${RDS_STACK_NAME:-ezyintern-rds-staging}"
TEMPLATE="$ROOT/aws/infrastructure/rds-template.yaml"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source <(grep -E '^(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_DEFAULT_REGION|AWS_SESSION_TOKEN)=' "$ROOT/.env")
  set +a
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "❌ AWS CLI not found. Install aws cli v2."
  exit 1
fi

if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo "❌ AWS credentials missing. Add AWS_* to .env or run aws configure."
  exit 1
fi

if [[ -z "${RDS_MASTER_PASSWORD:-}" ]]; then
  echo "Set RDS_MASTER_PASSWORD (min 12 characters), e.g.:"
  echo "  export RDS_MASTER_PASSWORD='...'"
  exit 1
fi

echo "→ Finding default VPC subnets in $REGION..."
VPC_ID="$(aws ec2 describe-vpcs --region "$REGION" --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)"
if [[ -z "$VPC_ID" || "$VPC_ID" == "None" ]]; then
  echo "❌ No default VPC found. Create a VPC or pass SubnetIds manually via CloudFormation console."
  exit 1
fi

SUBNETS="$(aws ec2 describe-subnets --region "$REGION" \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'Subnets[*].SubnetId' --output text | tr '\t' ' ')"
read -r -a SUBNET_ARR <<< "$SUBNETS"
if [[ "${#SUBNET_ARR[@]}" -lt 2 ]]; then
  echo "❌ Need at least 2 subnets in default VPC. Found: ${SUBNETS}"
  exit 1
fi

ALLOWED_CIDR="${ALLOWED_CIDR:-0.0.0.0/0}"
if [[ "$ALLOWED_CIDR" == "0.0.0.0/0" ]]; then
  echo "⚠️  ALLOWED_CIDR is open to the world. For staging, set your IP:"
  echo "   export ALLOWED_CIDR=\$(curl -s https://checkip.amazonaws.com)/32"
fi

echo "→ Deploying CloudFormation stack: $STACK_NAME"
aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --template-file "$TEMPLATE" \
  --parameter-overrides \
    "MasterUserPassword=$RDS_MASTER_PASSWORD" \
    "AllowedCidr=$ALLOWED_CIDR" \
    "VpcId=$VPC_ID" \
    "SubnetIds=${SUBNET_ARR[0]},${SUBNET_ARR[1]}" \
  --no-fail-on-empty-changeset

ENDPOINT="$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='DBEndpoint'].OutputValue" --output text)"
PORT="$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='DBPort'].OutputValue" --output text)"
DB_NAME="$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='DBName'].OutputValue" --output text)"

DATABASE_URL="postgresql://ezyintern:${RDS_MASTER_PASSWORD}@${ENDPOINT}:${PORT}/${DB_NAME}?sslmode=require"

echo ""
echo "✅ RDS staging ready"
echo "   Endpoint: $ENDPOINT"
echo "   Port:     $PORT"
echo "   Database: $DB_NAME"
echo ""
echo "Add to .env.awsrds.local (create from .env.awsrds.example):"
echo "   DATABASE_URL=$DATABASE_URL"
echo ""
echo "Next steps:"
echo "   1. export SUPABASE_DB_URL='...'  # Supabase → Settings → Database → URI (direct, port 5432)"
echo "   2. npm run aws:rds:export"
echo "   3. npm run aws:rds:import"
echo "   4. npm run dev:aws:rds   # after Supabase API layer points at RDS (see aws/README.md)"
