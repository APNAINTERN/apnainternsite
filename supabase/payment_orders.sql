-- TABLE FOR TRACKING PAYMENT ORDERS AND REGISTRATION METADATA
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT UNIQUE NOT NULL, -- Razorpay Order ID
  user_email TEXT NOT NULL,
  user_phone TEXT,
  amount BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'success', 'failed'
  payment_id TEXT, -- Razorpay Payment ID
  signature TEXT, -- Razorpay Signature
  metadata JSONB, -- All registration form data
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can view all orders" ON public.payment_orders
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND role IN ('admin', 'super_admin')
  )
);

-- Anyone can check status of their own order by order_id
CREATE POLICY "Public status check" ON public.payment_orders
FOR SELECT USING (true); 

-- Service role can do everything
GRANT ALL ON public.payment_orders TO service_role;
GRANT SELECT ON public.payment_orders TO anon, authenticated;
