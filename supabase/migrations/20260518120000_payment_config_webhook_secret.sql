-- Webhook secret from Razorpay Dashboard (shown once when you create the webhook).
ALTER TABLE public.payment_config
  ADD COLUMN IF NOT EXISTS razorpay_webhook_secret TEXT;
