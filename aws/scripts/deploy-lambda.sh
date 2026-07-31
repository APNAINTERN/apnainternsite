#!/usr/bin/env bash
# Deploy API to AWS Lambda. Requires: aws configure, .env with secrets.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export PATH="$HOME/.local/bin:$ROOT/aws/.venv/bin:$PATH"

if ! command -v aws >/dev/null 2>&1; then
  echo "Install AWS CLI: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
  exit 1
fi
if ! command -v sam >/dev/null 2>&1; then
  echo "Run: python3 -m venv aws/.venv && aws/.venv/bin/pip install aws-sam-cli"
  exit 1
fi

if ! aws sts get-caller-identity >/dev/null 2>&1; then
  if [[ -f "$ROOT/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    # Quote-safe load (AWS_SECRET_ACCESS_KEY may contain / and +)
    while IFS= read -r line; do
      [[ "$line" =~ ^(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_DEFAULT_REGION|AWS_SESSION_TOKEN)= ]] || continue
      key="${line%%=*}"
      val="${line#*=}"
      val="${val%\"}"; val="${val#\"}"
      val="${val%\'}"; val="${val#\'}"
      export "$key=$val"
    done < "$ROOT/.env"
    set +a
  fi
fi

if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo "❌ AWS credentials missing. Run:  aws configure"
  echo "   Region: ap-south-1"
  exit 1
fi

echo "→ Preparing samconfig.toml from .env..."
node aws/scripts/prepare-samconfig.mjs

echo "→ Bundling Lambda..."
node aws/scripts/bundle-lambda.mjs

echo "→ sam build..."
sam build -t aws/sam/template.yaml

echo "→ sam deploy..."
sam deploy \
  --config-file "$ROOT/aws/sam/samconfig.toml" \
  --template-file "$ROOT/.aws-sam/build/template.yaml" \
  --no-confirm-changeset

echo ""
echo "✅ Deployed. Get API URL:"
echo "   aws cloudformation describe-stacks --stack-name ezyintern-api-staging --region ap-south-1 --query \"Stacks[0].Outputs[?OutputKey=='ApiBaseUrl'].OutputValue\" --output text"
