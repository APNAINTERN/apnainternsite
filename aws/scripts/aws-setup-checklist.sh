#!/usr/bin/env bash
# Print AWS CLI commands to create staging RDS + ECR + ECS (ap-south-1).
# Run each section manually after replacing placeholders.
# Requires: aws cli v2, configured credentials (aws configure).

set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
PROJECT="ezyintern"
ENV_NAME="${ENV_NAME:-staging}"

cat <<EOF
╔══════════════════════════════════════════════════════════════════╗
║  EzyIntern AWS setup checklist ($ENV_NAME) — region: $REGION
║  Production Vercel + Supabase: UNCHANGED until you cut over.
╚══════════════════════════════════════════════════════════════════╝

── STEP 1: ECR (container registry) ───────────────────────────────
aws ecr create-repository --repository-name ${PROJECT}-api --region ${REGION}
ACCOUNT_ID=\$(aws sts get-caller-identity --query Account --output text)
aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin \${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com

# From repo root on aws-work branch:
docker build -f aws/Dockerfile -t ${PROJECT}-api .
docker tag ${PROJECT}-api:latest \${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${PROJECT}-api:latest
docker push \${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${PROJECT}-api:latest

── STEP 2: RDS PostgreSQL (db.t3.small recommended for staging) ───
# Create DB subnet group + security group in your VPC first, then:
aws rds create-db-instance \\
  --db-instance-identifier ${PROJECT}-${ENV_NAME}-db \\
  --db-instance-class db.t3.small \\
  --engine postgres \\
  --engine-version 15 \\
  --master-username ezyintern \\
  --master-user-password 'CHANGE_ME_STRONG_PASSWORD' \\
  --allocated-storage 20 \\
  --storage-type gp3 \\
  --backup-retention-period 7 \\
  --no-publicly-accessible \\
  --region ${REGION}

# After available, set:
# export DATABASE_URL=postgresql://ezyintern:PASSWORD@endpoint:5432/postgres?sslmode=require
# ./aws/scripts/db-import-to-rds.sh

── STEP 3: Secrets Manager ────────────────────────────────────────
aws secretsmanager create-secret \\
  --name ${PROJECT}/${ENV_NAME}/api-env \\
  --secret-string file://aws/env.example \\
  --region ${REGION}
# Update secret in console with real values (never commit .env).

── STEP 4: ECS Fargate (API) ──────────────────────────────────────
# 1. Create ECS cluster: ${PROJECT}-${ENV_NAME}
# 2. Create task definition from aws/infrastructure/ecs-task-definition.json
#    (replace ACCOUNT_ID, REGION, secret ARN)
# 3. Create ALB + target group (port 3000) + HTTPS certificate
# 4. Create ECS service behind ALB
# 5. Health check path: /api/health

── STEP 5: Staging frontend (Vercel preview on aws-work) ──────────
# Vercel → Project → Environment Variables (Preview only):
#   VITE_PUBLIC_APP_URL=https://staging-api.YOUR_DOMAIN
# Do NOT change Production env vars on main branch.

── STEP 6: Razorpay webhook (staging TEST mode) ───────────────────
# Dashboard → Webhooks → https://staging-api.YOUR_DOMAIN/api/payment/webhook
# Events: payment.authorized, payment.captured, payment.failed

── STEP 7: Verify ─────────────────────────────────────────────────
curl https://staging-api.YOUR_DOMAIN/api/health

EOF
