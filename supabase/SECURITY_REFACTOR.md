# Security refactor — run order (frontend + Supabase)

## Step 1 — Supabase SQL (do this **before** deploying frontend)

In **Supabase → SQL Editor**, run the full file:

`supabase/migrations/20260601120000_security_rpc_registration_fees_payment.sql`

This adds RPCs for registration fees, public payment config, admin payment config, and server-side assignment grading.

## Step 2 — Deploy frontend (Vercel / your host)

Deploy the latest `main` from GitHub so the app uses:

- `get_registration_universities` / `get_registration_colleges` (registration)
- `get_public_payment_config` only (checkout — no secret column)
- `admin_get_payment_config` / `admin_save_payment_config` (Super Admin)
- `get_assignment_take_payload` / `submit_assignment_graded` (assignments)

## Step 3 — Smoke test (before lockdown)

- [ ] Open `/register` — universities/colleges load, fee amount shows
- [ ] Complete a test payment (Razorpay modal opens)
- [ ] Super Admin → payment settings load and save
- [ ] Student assignment submit works

## Step 4 — Lock down (tell Lovable “go ahead” **only after Step 3 passes**)

In **Supabase → SQL Editor**, run:

`supabase/hotfix_security_lockdown_after_frontend.sql`

Do **not** use Lovable “Try to fix all” without this script — it may drop policies in the wrong order.

## Step 5 — Rotate Razorpay secret (recommended)

Because `razorpay_key_secret` may have been exposed to any logged-in user:

1. Create new keys in Razorpay Dashboard  
2. Update row in `payment_config` via Super Admin (or SQL)  
3. Update webhook secret if used  

## What each fix maps to

| Lovable issue | Frontend change | Lockdown script |
|---------------|-----------------|-----------------|
| Razorpay secrets | `registrationPayment.ts`, `paymentConfigAdmin.ts`, Super Admin | Revoke anon/auth `SELECT` on `payment_config` |
| Assignment scores | `assignmentTake.ts`, `AssignmentTest.tsx` | Remove student INSERT on submissions; hide question answers from direct SELECT |
| College/university fees | `registrationCatalog.ts`, registration forms | Anon uses RPC only for fee catalog |

Admin panels (Admin/Super Admin) still use direct table access as **authenticated** admins.
