# Lovable Cloud → AWS migration (official export path)

> **Do not use the credential-bridge edge function.** Lovable Cloud blocks deploying
> functions that exfiltrate `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_DB_URL`, and those
> values are not exposed to you by design. Use **Export project data** instead.

Production stays live until you cut over env vars on Vercel.

---

## Overview

```
Lovable Cloud  ──export──►  SQL dump (email)  ──import──►  AWS RDS
                                                                  ▲
Frontend (Vercel) ──► Lambda APIs          EC2 Supabase API ────────┘
```

| Step | What | Touches production? |
|------|------|---------------------|
| 1 | Export DB from Lovable | **No** (read-only export) |
| 2 | Export Storage files | **No** |
| 3 | Create RDS + import dump | **No** (new AWS DB) |
| 4 | EC2 self-hosted Supabase → RDS | **No** |
| 5 | Test `aws-work` locally | **No** |
| 6 | Update Vercel env → cutover | **Yes** (when you choose) |

---

## Step 1 — Export database from Lovable

1. Open your Lovable project (**Internship Gateway**).
2. Go to **Cloud → Overview → Advanced settings**.
3. Find **Export project data** → click **Export data**.
4. Under **Database** → click **Export** → confirm **Start export**.
5. Wait for email with a **temporary download link** (can take a while).
6. Download the `.sql` (or archive) to your machine.

Limits (per [Lovable docs](https://docs.lovable.dev/integrations/cloud)):

- Max **5 GB** per export
- One export per **24 hours**

Save the file somewhere safe (not in git). Example:

```bash
mkdir -p aws/backups/lovable-export
# move download to:
# aws/backups/lovable-export/lovable_db_YYYYMMDD.sql
```

### Per-table CSV export (if full dump unavailable)

If support did not send a full dump, you can export **each table** from Lovable **Cloud → Database** (CSV per table).

**Put files here:**

```
aws/backups/lovable-export/csv/
  students.csv
  profiles.csv
  user_roles.csv
  ...
```

**Critical — do not skip:**

| Export | Why |
|--------|-----|
| **All `public` tables** you use | App data |
| **`auth.users`** (Users in Lovable Cloud) | **Login** — without this everyone must reset passwords |
| **`auth.identities`** if available | OAuth / email login links |
| **Storage files** (Cloud → Storage) | Uploads not in CSV |

**Schema** (tables, RPCs, RLS) comes from `supabase/migrations/` in the repo — not from CSV.

**Import order:**

```bash
npm run aws:rds:provision
npm run aws:rds:import                    # migrations only (schema)
bash aws/scripts/import-csv-tables.sh     # your CSV folder
npm run aws:rds:verify
```

Rename auth export to `auth_users.csv` if Lovable names it differently.

---

## Step 2 — Export storage files (separate)

Database export **does not** include uploaded files.

1. **Cloud → Storage**
2. Download / export buckets you use (registration docs, assignment files, etc.)
3. You’ll upload these to **S3** later (we can automate after RDS is up)

---

## Step 3 — Create AWS RDS

From repo root (`aws-work` branch):

```bash
export RDS_MASTER_PASSWORD='your-strong-password-min-12-chars'
export ALLOWED_CIDR="$(curl -s https://checkip.amazonaws.com)/32"

npm run aws:rds:provision
```

Copy the printed `DATABASE_URL` into `.env.awsrds.local`:

```bash
cp .env.awsrds.example .env.awsrds.local
# Edit: paste DATABASE_URL
```

---

## Step 4 — Import Lovable export into RDS

```bash
# Load DATABASE_URL from .env.awsrds.local
npm run aws:rds:import -- --restore aws/backups/lovable-export/lovable_db_YYYYMMDD.sql

npm run aws:rds:verify
```

If the Lovable export format fails (extensions, roles), tell us the error — we’ll adjust the import script.

**Do not** copy old `SUPABASE_SERVICE_ROLE_KEY` from anywhere. The destination (EC2 Supabase) will generate **new** keys.

---

## Step 5 — Supabase API on EC2 (points at RDS)

RDS alone is not enough for the React app. Run **self-hosted Supabase** on a `t3.small` EC2 instance with `POSTGRES_HOST` = your RDS endpoint.

After setup you get:

- New `VITE_SUPABASE_URL` (your EC2/API URL)
- New anon + service_role keys (generated on EC2)

Update `.env.awsrds.local`:

```env
DATABASE_URL=postgresql://...rds...
VITE_SUPABASE_URL=https://your-api-url
VITE_SUPABASE_PUBLISHABLE_KEY=new_anon_key
VITE_SITE_API_ORIGIN=https://lhwzbh0ftl.execute-api.ap-south-1.amazonaws.com/staging
```

Add to `.env` for Lambda redeploy:

```env
SUPABASE_URL=same as VITE_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=new_service_role_key
```

```bash
npm run aws:lambda:deploy
```

---

## Step 6 — Test locally (production unchanged)

```bash
npm run dev:aws:rds
```

Open http://localhost:8080 — login, dashboards, payments should hit **AWS only**.

---

## Step 7 — Production cutover (when ready)

1. Vercel **Production** env on `main`:
   - `VITE_SUPABASE_URL` → AWS URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` → new anon key
   - `VITE_SITE_API_ORIGIN` → Lambda URL
2. Razorpay webhook → Lambda URL
3. Cancel **Lovable Cloud** backend after verification

---

## Optional: export to your own Supabase first

If the SQL dump is hard to import directly to RDS, an intermediate step is:

1. Create a project at [supabase.com](https://supabase.com) (you own it)
2. Use [Dreamlit Lovable exporter](https://dreamlit.ai/tools/lovable-cloud-to-supabase-exporter) or Lovable’s SQL import there
3. Then `pg_dump` from **your** Supabase → RDS (you’ll have full URI on a project you control)

---

## Deprecated: credential bridge

`supabase/functions/migrate-credentials/` is **not deployable on Lovable Cloud**.  
Do not use `npm run aws:lovable:credentials`. Use this document instead.

---

## What to do right now

1. **Cloud → Overview → Advanced settings → Export data** (Database)
2. Download when email arrives
3. Tell us: **“export downloaded”** + file path/name  
4. We’ll run RDS provision + import together (when you say go)
