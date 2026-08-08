# Security

## Production checklist

1. **Lambda env** — Set `LOCAL_JWT_SECRET` (or `JWT_SECRET`) to a long random value. Never use the dev default in production.
2. **Razorpay** — Set `razorpay_webhook_secret` in Super Admin → Payment Settings (or `RAZORPAY_WEBHOOK_SECRET` in Lambda). Webhooks reject unsigned requests when unset.
3. **CORS** — API allows `https://apnaintern.in` and localhost dev origins. Add staging via `CORS_ALLOWED_ORIGINS` (comma-separated).
4. **Gemini** — Use server-only `GEMINI_API_KEY`. Do not set `VITE_GEMINI_API_KEY` in production Vercel env.
5. **Rotate keys** if `payment_config` secrets were ever exposed via unauthenticated endpoints (fixed in security hardening PR).

## API authentication

| Endpoint | Requirement |
|----------|-------------|
| `/api/data/batch-select`, `/api/data/select` | Admin JWT |
| `/api/razorpay-recovery` | Staff or admin JWT |
| `/api/admin-register` | Admin JWT matching `admin_id` in body |
| `/api/gemini-generate` (POST) | Any authenticated user |
| `/api/send-mail` bulk/admin actions | Admin JWT |
| `/api/send-mail` OTP | Rate-limited (8 / 15 min per IP+email) |
| `/storage/v1/*` upload/delete | Bearer JWT |
| `/api/payment/create-order` | Server validates fee vs college/university rules |

## HTTP headers (Vercel)

Static app responses include HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`.

## Reporting

Report vulnerabilities to the project maintainers via the contact email on https://apnaintern.in/contact.
