# AGENTS.md

Guidance for AI agents working in this repository.

## Stack

- **Frontend:** Vite + React + TypeScript (port 8080)
- **Production:** Vercel (frontend + `api/*` serverless)
- **Database (current):** Supabase PostgreSQL + Auth + RPC
- **AWS (optional staging):** Lambda, RDS, S3, SES — see `aws/README.md`

## Development commands

| Command | Purpose |
|---------|---------|
| `npm ci` | Install dependencies |
| `npm run dev` | Local API + frontend (RDS shim mode when `.env.awsrds.local` exists) |
| `npm run dev:frontend` | Vite only on :8080 |
| `npm run dev:aws` | Frontend → deployed AWS Lambda (needs `.env.aws.local`) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest |

## AWS setup (Apna Intern)

Automated scripts for staging on AWS (`ap-south-1`):

```bash
cp .env.setup.example .env          # fill secrets (gitignored)
bash scripts/install-aws-tools.sh   # AWS CLI + SAM CLI
bash scripts/setup-apnaintern-aws.sh check
bash scripts/setup-apnaintern-aws.sh all   # S3 → RDS → export → import → Lambda
```

**Requires user-provided secrets in `.env`:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, Supabase URLs/keys, `SUPABASE_DB_URL`, `RDS_MASTER_PASSWORD`, Razorpay TEST keys, SES SMTP.

**Cannot be automated in cloud agent:** AWS account creation, SES domain DNS verification, IAM access keys (user must create in AWS Console).

Brand constants: `shared/brand.ts` (`BRAND_NAME`, `BRAND_TAGLINE`, `@apnaintern.in` emails).

## Cursor Cloud specific instructions

- VM update script: `npm ci`
- No Docker required for default dev; AWS deploy needs AWS CLI + SAM (`npm run aws:tools:install`)
- `.env`, `.env.*.local` are gitignored — never commit secrets
- Production API default: AWS Lambda staging URL in `shared/aws.ts` (see `src/lib/supabaseEnv.ts`); RDS holds schema + data. Remove legacy `*.supabase.co` from Vercel env when cut over.
