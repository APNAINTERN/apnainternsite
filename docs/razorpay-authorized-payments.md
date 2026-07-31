# Razorpay authorized payments — capture list

Extracted from screenshots in `captures/` (May 16, 2026). **Status filter: Authorized** (live mode).

> Payment IDs from screenshots may have 1-character OCR/vision typos. If capture fails with “payment not found”, copy the exact ID from the Razorpay payment detail URL.

---

## Pilot: first 10 (most recent **Sat May 16** — use this first)

Source screenshot: `captures/Screenshot from 2026-05-16 17-34-50.png`

| # | Payment ID | Amount | Time (May 16) |
|---|------------|--------|----------------|
| 1 | `pay_Sq1jAsBcxkaBrm` | ₹600 | ~5:26pm |
| 2 | `pay_Sq1USwS0yzUwKV` | ₹549 | ~5:12pm |
| 3 | `pay_Sq1CD46Vf1VtYG` | ₹500 | ~4:55pm |
| 4 | `pay_Sq15Of24Wc39ok` | ₹500 | ~4:48pm |
| 5 | `pay_Sq15K1HXKg40pl` | ₹500 | ~4:48pm |
| 6 | `pay_Sq0zXryqeebK68` | ₹549 | ~4:43pm |
| 7 | `pay_Sq0rHGpiYpgdR8` | ₹600 | ~4:35pm |
| 8 | `pay_Sq0eKWL7DGIo77` | ₹600 | ~4:23pm |
| 9 | `pay_Sq0Y0ZNw7m8sZr` | ₹549 | ~4:17pm |
| 10 | `pay_Sq0Tzl2HjsFPGX` | ₹600 | ~4:13pm |

JSON for script: `captures/payment-ids-first-10.json`

---

## Secrets needed to run the capture script

| Variable | What it is | Where to get it |
|----------|------------|-----------------|
| `RAZORPAY_KEY_ID` | Public key, starts with `rzp_live_` | Razorpay Dashboard → **Account & Settings** → **API keys** (same as in SuperAdmin `payment_config`) |
| `RAZORPAY_KEY_SECRET` | **Secret** — never commit or share | Same API keys page (shown once when generated) |

**Not required** for capture: webhook secret, Supabase keys, `.env` SMTP.

Use **live** keys only when dashboard **Test Mode** is **OFF** (your screenshots are live).

### Run pilot (10 payments)

```bash
cd /home/sandhyam/ezyintern-demo
export RAZORPAY_KEY_ID='rzp_live_...'
export RAZORPAY_KEY_SECRET='...'
node scripts/capture-authorized-payments.mjs captures/payment-ids-first-10.json
```

The script skips already-**captured** rows and only captures **authorized** ones.

---

## Additional IDs from other screenshots (partial — not all 128 images processed)

### Sat May 16 (afternoon / evening scrolls)

`pay_SpydzFNdovEVFo`, `pay_SpycaonU7TXrJo`, `pay_SpyAFgvI5tbsyl`, `pay_SpyWAhlYUDWgbR`, `pay_SpyW1lrvQIBL43`, `pay_SpyVSFvzhr6VMK`, `pay_SpyRzx4zXzd2Pa`, `pay_SpyRhVQ3aE34NF`, `pay_SpyQP8DakQVOxt`, `pay_SpyNUclg52oUPq`, `pay_SpyNTZVxMfvgJw`, `pay_SpyNQ2v8FheNUN`, `pay_SpyN3h1YS0nObo`, `pay_SpyDSd77OX7mYt`, `pay_Spy9lvaI9DW4Yf`, `pay_Spy89NAl9p3re6`, `pay_Spy81PXO3V52uW`, `pay_Spy7VmONV5fvPt`, `pay_Spy7RkGq3SWXeR`, `pay_Spy6BoxcgGWz5L`, `pay_Spy5tXdJYvK8ag`, `pay_Spy5riOCBkrJg7`, `pay_Spy3RtKHbfRSNj`, `pay_Spxar6GoaQBoRA`, `pay_Spxae3qT9T5syo`, `pay_SpxaLLZ0zX8NWE`, `pay_SpxaJCTzaMeN8M`, `pay_Spxa77sEi6YkTI`, `pay_SpxYyRa3F5WlJz`, `pay_SpxXFY6Hozn1GH`, `pay_SpxWgr5knW2Ctx`, `pay_SpxW52KeC3zW0o`, `pay_SpxVtxY0J2jLLJ`, `pay_SpzQsMLO7WMRK3`, `pay_SpzQmrDEtQtC4O`, `pay_SpzOTsbAxkwTst`, `pay_SpzBdD1WAqeMeo`, `pay_Spz7q3zuKDWrlQ`, `pay_Spz6C3q2fkaxUR`, `pay_Spz1L8iHrPmj9s`, `pay_Spz0wkyBHLPQIG`, `pay_SpzyY0kOr1bm7N`, `pay_SpyugSa8N9VDkj`, `pay_SpwyKbHDiYuUgQ`, `pay_SpwxhcWAWlYFmB`, `pay_Spwxgo52qbgCs3`, `pay_Spwxd1cWgprPUx`, `pay_SpwxYksvq816tR`, `pay_SpwxBcvTR6717o`, `pay_SpwwzBdilFumor`, `pay_SpwwciNA2g2YB1`, `pay_SpwvPbAjL1bM7A`, `pay_SpwuLBLr7SGqH`, `pay_Spw5sn7tuyqFd3`, `pay_Spw5cuY7luUYA3`, `pay_Spw4DAzZ6vxfi7`, `pay_Spw2o9lmNujsIQ`, `pay_Spw0gJZmrVJcQd`, `pay_Spvza00cjLUDr8`, `pay_SpvyJMgpGOgAl3`, `pay_SpvxWtLeBVGamO`, `pay_SpvxTkPmtz1jPb`, `pay_Spvv7C9p5GIWaW`, `pay_SpvuePe4z0cFvx`, `pay_SpvtRqxOQWeUSE`, `pay_SpvsFCks5HY0w5`, `pay_SpvqvSuiRPWnZV`, `pay_SpvqYMEeeqqZKi`, `pay_Spvq3O8ySQnipW`

### Detail page (morning)

- `pay_SpTTNm8hu6yVKZ` (₹500 — verify exact ID in dashboard URL; may be `pay_SptTNm8hu6yVKZ`)

### Fri May 15 (from later scroll screenshots)

`pay_SpYauCc8HDhsII`, `pay_SpYaXdpMoLxtUt`, `pay_SpYZzsywpRmMHn`, `pay_SpYZeZV8XpCwIh`, `pay_SpYZ9IXfXd1wq`, `pay_SpYYb61ktWkV0L`, `pay_SpYYUdrTiExA69`, `pay_SpYVvqKmoaJ1Td`, `pay_SpYVCQBLBv8qLI`, `pay_SpYUqxSxRqeWmk`, `pay_SpYUccxtAEv88C`, `pay_SpYUK47ejxJoyO`, `pay_SpYTtW7FbBwZSk`, `pay_SpYT88M8I0MeIm`, `pay_SpYSrfgJJ74S4G`, `pay_SpYSOky8JoZiWT`, `pay_SpZaQ6in9q2qSJ`, `pay_SpZaAw28VjWj3C`, `pay_SpZZonDoUVM5Ow`, `pay_SpZZXscb7FWl77`, `pay_SpZZ1ds4GfM0Rs`, `pay_SpZY5rgmZrZTwz`, `pay_SpZXpYHpycgXpa`, `pay_SpZWVSwloKUBGw`, `pay_SpZWRkATAB01pn`, `pay_SpZV3M2LBEL2D9`, `pay_SpZThI2I05UaZE`, `pay_SpZTbDADZr7SK2`, `pay_SpZSc1Cj1yrz7Y`, `pay_SpZRrVywgse09r`, `pay_SpZRUVcwX43hSH`, `pay_SpZRF6DSbk5q0i`, `pay_SpXeeqAk1wSggP`, `pay_SpXeQXeW8ZOGOd`, `pay_SpXd8zxrrivGRT`, `pay_SpXcGjvGzkLmUc`, `pay_SpXcEcvR7WSFb6`, `pay_SpXbtsAFZi9aSJ`, `pay_SpXbpMUD0h6QxB`, `pay_SpXZ904YFmHxjC`, `pay_SpXYYSNtioykXb`, `pay_SpXY0z3p9B3mjg`

---

## Full list from all 128 images

Automated OCR is not set up in this environment. ~**15 list screenshots** were read; **~100+ unique IDs** are likely across all images (many are duplicate scrolls or single-payment detail pages).

**Better options for “capture all”:**

1. Razorpay Dashboard → filter **Authorized** → capture in batches manually.
2. Razorpay API: `GET /v1/payments?status=authorized` with date range (no screenshots needed) — can add a small script later if you want.
3. Ask to process remaining screenshots in batches (slower).

Do **not** commit `RAZORPAY_KEY_SECRET` or paste it in chat.
