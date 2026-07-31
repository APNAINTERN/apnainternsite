# Disable email verification (keep registration working)

Registration does **not** need Supabase confirmation emails. Students get credentials from your **registration success** email (Vercel `/api/send-mail`).

## Step 1 — Supabase Dashboard (recommended)

1. Open **Authentication → Providers → Email**
2. Turn **OFF** — **Confirm email**
3. Save

Optional: turn off **Secure email change** if staff report login issues after email changes.

## Step 2 — SQL (run in SQL Editor)

Run: `supabase/hotfix_disable_email_confirmation.sql`

This:

- Confirms any existing users who never verified
- Auto-confirms **new** signups via trigger (immediate login after register)

## Step 3 — Redeploy (optional)

Latest frontend already signs students in after registration when the password works. No code change required if Steps 1–2 are done.

## What students still receive

- Your app’s **registration success** email (login link + password) — not Supabase’s “Confirm your email” link.

## What to skip

- Do not require clicking the Supabase verification link before using the portal.
- `/auth/confirm` remains for rare legacy links only; new signups will not need it.
