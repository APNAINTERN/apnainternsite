-- COMPREHENSIVE FIX FOR TRANSACTIONS & LEADS
-- Run this in Supabase SQL Editor

-- 1. Create Successful Payments Table if missing
CREATE TABLE IF NOT EXISTS public.payment_success (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  payment_id TEXT NOT NULL,
  amount_paise BIGINT NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create Cancelled Payments (Leads) Table if missing
CREATE TABLE IF NOT EXISTS public.payment_cancelled (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  user_phone TEXT,
  amount BIGINT,
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE public.payment_success ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_cancelled ENABLE ROW LEVEL SECURITY;

-- 4. Policies for payment_success
DROP POLICY IF EXISTS "Admins view all successful payments" ON public.payment_success;
CREATE POLICY "Admins view all successful payments" ON public.payment_success 
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND role IN ('admin', 'super_admin')
  )
);

DROP POLICY IF EXISTS "Anyone can insert success logs" ON public.payment_success;
CREATE POLICY "Anyone can insert success logs" ON public.payment_success 
FOR INSERT WITH CHECK (true);

-- 5. Policies for payment_cancelled
DROP POLICY IF EXISTS "Admins view all cancelled payments" ON public.payment_cancelled;
CREATE POLICY "Admins view all cancelled payments" ON public.payment_cancelled 
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND role IN ('admin', 'super_admin')
  )
);

DROP POLICY IF EXISTS "Anyone can insert cancellation logs" ON public.payment_cancelled;
CREATE POLICY "Anyone can insert cancellation logs" ON public.payment_cancelled 
FOR INSERT WITH CHECK (true);

-- 6. Payment Configuration Table
CREATE TABLE IF NOT EXISTS public.payment_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  razorpay_key_id TEXT,
  razorpay_key_secret TEXT,
  amount_paise BIGINT DEFAULT 9900,
  is_active BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT one_row CHECK (id = 1)
);

ALTER TABLE public.payment_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active config" ON public.payment_config;
CREATE POLICY "Anyone can view active config" ON public.payment_config FOR SELECT USING (true);

DROP POLICY IF EXISTS "Super admins manage config" ON public.payment_config;
CREATE POLICY "Super admins manage config" ON public.payment_config FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND role = 'super_admin'
  )
);

-- 7. Grant Permissions
GRANT ALL ON public.payment_success TO authenticated, service_role;
GRANT ALL ON public.payment_cancelled TO authenticated, service_role;
GRANT ALL ON public.payment_config TO authenticated, service_role;
GRANT ALL ON public.payment_success TO anon;
GRANT ALL ON public.payment_cancelled TO anon;
GRANT SELECT ON public.payment_config TO anon;
ALTER TABLE public.payment_success ADD COLUMN IF NOT EXISTS metadata JSONB;
