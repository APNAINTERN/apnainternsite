# Stop Lovable / wrong-site auth redirects

## What was wrong

Supabase **Site URL** was still set to the old **Lovable** preview URL. Confirmation emails then opened `*.lovable.app` instead of EzyIntern.

The app code cannot change Supabase Site URL from the repo — you must update the dashboard once. The frontend now:

- Sends `emailRedirectTo` on every `signUp` → `https://www.ezyintern.in/auth/confirm` (or `VITE_PUBLIC_SITE_ORIGIN`)
- Routes any auth tokens on `/`, `/login`, etc. → `/auth/confirm`
- If someone opens the app on a **Lovable host**, redirects to production with tokens preserved
- Blocks Lovable hosts in email login links (`buildStudentCredentialLoginLink`)

## Required: Supabase Dashboard

**Authentication → URL Configuration**

| Field | Set to |
|--------|--------|
| **Site URL** | `https://www.ezyintern.in` (your live app — **not** `lovable.app`) |
| **Redirect URLs** | Add each line (all environments you use): |

```
https://www.ezyintern.in/auth/confirm
https://www.ezyintern.in/auth/callback
https://www.ezyintern.in/reset-password
https://www.ezyintern.in/login
https://ezyintern.in/auth/confirm
http://localhost:5173/auth/confirm
http://localhost:5173/auth/callback
```

Remove any `https://*.lovable.app` entries from **Redirect URLs** if present.

**Authentication → Email Templates** — open “Confirm signup” and ensure the link uses `{{ .ConfirmationURL }}` (default). Do not hardcode a Lovable URL in the template body.

## Vercel / hosting env

```
VITE_PUBLIC_SITE_ORIGIN=https://www.ezyintern.in
```

Redeploy after setting.

## Optional: Supabase Edge `resend-email`

Set `PUBLIC_SITE_URL=https://www.ezyintern.in` on the function so registration emails use the same origin.

## Verify

1. Register a test user with a new email.
2. Open the confirmation email link — browser should land on **`www.ezyintern.in/auth/confirm`**, not Lovable.
3. After confirm, user reaches student dashboard or login.

## Code reference

- `src/lib/authRedirectGuard.ts` — blocked hosts + escape redirect
- `src/components/AuthRedirectGuard.tsx` — global router guard
- `src/pages/AuthConfirm.tsx` — confirmation handler
- `src/lib/authRoutes.ts` — `buildAuthSignUpOptions()`
