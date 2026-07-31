# EzyIntern AWS migration (aws-work branch)

**Production (`main`) is untouched.** Parallel AWS setup on `aws-work`.

## Recommended: Lambda + API Gateway (pay per request)

| Option | Cost model | Best for |
|--------|------------|----------|
| **Lambda + HTTP API** ✅ | Pay only when API is called | EzyIntern (payments, mail, admin tasks) |
| ECS Fargate | ~$15–30/month always-on | High constant traffic |

**Typical Lambda cost for low/medium API traffic:** often **$0–5/month** (within free tier) vs **~$25+/month** minimum for ECS + ALB.

## Architecture

```
Vercel (frontend)  ──►  API Gateway HTTP API  ──►  Lambda  ──►  Supabase (Phase 1)
                                                         └──►  RDS (Phase 2)
```

| Phase | API | Database | Frontend |
|-------|-----|----------|----------|
| **Now (prod)** | Vercel `api/*` | Supabase | Vercel `main` |
| **Phase 1** | **AWS Lambda** | Supabase | Vercel `main` unchanged |
| **Phase 2** | Lambda | RDS copy | Vercel preview on `aws-work` |
| **Cutover** | Lambda | RDS | Update prod env vars only |

## Local testing against deployed AWS APIs

**Phase 1:** APIs on Lambda, data still on Supabase. Production untouched.

```bash
# 1. Deploy Lambda (once)
npm run aws:lambda:deploy:guided
# Copy ApiBaseUrl from output

# 2. Local env for AWS testing
cp .env.aws.example .env.aws.local
# Edit: VITE_SITE_API_ORIGIN + Supabase keys + Razorpay TEST keys

# 3. Run frontend only (hits Lambda, not localhost:3000)
npm run dev:aws
# Open http://localhost:8080 — registration/payments call AWS API
```

| Command | Env file | API target | Database |
|---------|----------|------------|----------|
| `npm run dev` | `.env.local` | localhost:3000 | Supabase |
| `npm run dev:aws` | `.env.aws.local` | AWS Lambda | Supabase |
| Vercel `main` | Vercel Production env | Vercel `/api` | Supabase |

Do **not** merge `aws-work` to `main` until staging tests pass.

### Lovable Cloud: export database (official path)

Lovable blocks credential-bridge edge functions. Export your DB instead:

**[aws/LOVABLE_EXPORT_MIGRATION.md](./LOVABLE_EXPORT_MIGRATION.md)**

Quick: **Cloud → Overview → Advanced settings → Export data → Database → Export**

## Deploy to Lambda (pay-as-you-go)

### 1. Install AWS SAM CLI

```bash
# Ubuntu
pip install aws-sam-cli
# or see https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html

aws configure   # region: ap-south-1
```

### 2. Configure secrets (one time)

```bash
cp aws/sam/samconfig.toml.example aws/sam/samconfig.toml
# Edit parameter_overrides — use TEST Razorpay keys for staging
```

### 3. Deploy

```bash
npm run aws:lambda:deploy:guided   # first time (interactive)
npm run aws:lambda:deploy          # later deploys
```

Output includes **ApiBaseUrl** — e.g. `https://abc123.execute-api.ap-south-1.amazonaws.com/staging`

### 4. Verify

```bash
curl https://YOUR_API_URL/staging/api/health
```

### 5. Vercel Preview only (`aws-work` branch)

| Variable | Value |
|----------|--------|
| `VITE_PUBLIC_APP_URL` | Lambda ApiBaseUrl (no trailing slash) |

**Do not change Production env on `main`.**

### 6. Razorpay webhook (staging TEST mode)

`https://YOUR_API_URL/staging/api/payment/webhook`

## Database (RDS — Phase 2, `aws-work` only)

**Production Supabase is never modified** by these scripts (read-only export).

### Why RDS is not just a connection string

The React app uses **Supabase Auth + RPC + RLS** (`supabase.rpc`, `supabase.auth`).  
`DATABASE_URL` alone does not replace that. Phase 2 has two layers:

| Layer | What | Where |
|-------|------|--------|
| **Data** | Postgres tables + auth users | **AWS RDS** |
| **API** | PostgREST + GoTrue (login, RPCs) | **Staging Supabase stack on AWS** |

Local `npm run dev:aws:rds` points `VITE_SUPABASE_*` at the **staging** API (on top of RDS), not production.

### Step-by-step (aws-work branch)

```bash
# 0. One-time: add Supabase DB URI to .env (read-only export)
#    Supabase → Settings → Database → URI (direct host, port 5432)
#    SUPABASE_DB_URL=postgresql://postgres.[ref]:[PASSWORD]@db.[ref].supabase.co:5432/postgres

# 1. Create RDS staging (~$15/mo db.t3.micro, stop when not testing)
export RDS_MASTER_PASSWORD='your-strong-password-12+'
export ALLOWED_CIDR="$(curl -s https://checkip.amazonaws.com)/32"   # recommended
npm run aws:rds:provision

# 2. Copy env template and paste DATABASE_URL from provision output
cp .env.awsrds.example .env.awsrds.local

# 3. Export from live Supabase (READ ONLY — does not change prod)
npm run aws:rds:export:full

# 4. Import into RDS
npm run aws:rds:import -- --restore aws/backups/full_YYYYMMDD_HHMMSS.sql
npm run aws:rds:verify

# 5. Run Supabase API layer against RDS (EC2 / self-hosted — see below)

# 6. Update .env.awsrds.local:
#    VITE_SUPABASE_URL = staging API URL (NOT unqfphgjilxpbzajcdjl.supabase.co)
#    VITE_SUPABASE_PUBLISHABLE_KEY = staging anon key

# 7. Local test: Lambda APIs + AWS RDS
npm run dev:aws:rds
```

### Env profiles on `aws-work`

| Command | Env file | APIs | Database |
|---------|----------|------|----------|
| `npm run dev` | `.env.local` | localhost:3000 | Production Supabase |
| `npm run dev:aws` | `.env.aws.local` | AWS Lambda | Production Supabase |
| **`npm run dev:aws:rds`** | **`.env.awsrds.local`** | **AWS Lambda** | **AWS RDS (staging API)** |

**`main` branch / Vercel Production:** unchanged until final cutover.

### Supabase API on top of RDS (required for frontend)

After RDS has data, deploy a **staging** Supabase stack that uses RDS as Postgres:

1. [Supabase self-hosting](https://supabase.com/docs/guides/self-hosting/docker) on a small EC2 in `ap-south-1`
2. Point `POSTGRES_HOST` at your RDS endpoint
3. Generate new JWT / anon / service_role keys for **staging only**
4. Put staging URL + keys in `.env.awsrds.local`

Until step 5 is done, keep using `npm run dev:aws` (Lambda + production Supabase) for API testing.

### NPM scripts

| Script | Purpose |
|--------|---------|
| `npm run aws:rds:provision` | Create RDS via CloudFormation |
| `npm run aws:rds:export` | Export public + auth from Supabase |
| `npm run aws:rds:export:full` | Single full SQL dump |
| `npm run aws:rds:import` | Apply migrations + dumps to RDS |
| `npm run aws:rds:verify` | Test RDS connection + table counts |
| `npm run dev:aws:rds` | Frontend → Lambda + RDS staging |

### Legacy export/import (manual)

```bash
export SUPABASE_DB_URL='postgresql://...'
./aws/scripts/db-export-from-supabase.sh

export DATABASE_URL='postgresql://...'
./aws/scripts/db-import-to-rds.sh
```

## Files

| Path | Purpose |
|------|---------|
| `aws/lambda/handler.ts` | Lambda entry (serverless-http) |
| `aws/server/app.ts` | Shared Express app |
| `aws/sam/template.yaml` | SAM — Lambda + HTTP API |
| `aws/scripts/deploy-lambda.sh` | Build & deploy script |
| `aws/infrastructure/rds-template.yaml` | RDS CloudFormation (staging) |
| `aws/scripts/provision-rds.sh` | Create RDS stack |
| `aws/scripts/db-export-from-supabase.sh` | Read-only Supabase export |
| `aws/scripts/db-import-to-rds.sh` | Import into RDS |
| `.env.awsrds.example` | Local env for `dev:aws:rds` |
| `aws/Dockerfile` | Optional local Docker (not required for Lambda) |
| `aws/infrastructure/ecs-task-definition.json` | Legacy ECS option (skip if using Lambda) |

## Cost tips

- Use **arm64** Lambda (already in template) — ~20% cheaper
- **512 MB** memory is enough for payment/mail routes
- API Gateway HTTP API is cheaper than REST API
- RDS staging: `db.t3.micro` + stop instance when not in use
