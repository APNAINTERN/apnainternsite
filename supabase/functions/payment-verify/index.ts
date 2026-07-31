import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fulfillPaidOrder, getServiceSupabase } from '../_shared/paymentEnrollment.ts';
import { verifyPaymentSignature } from '../_shared/razorpay.ts';
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, message: 'Method not allowed' }, 405);
  }

  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = await req.json();

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return jsonResponse({ success: false, message: 'Missing payment details' }, 400);
    }

    const { supabaseUrl, supabaseServiceKey } = getServiceSupabase();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: config } = await supabase
      .from('payment_config')
      .select('razorpay_key_id, razorpay_key_secret')
      .eq('id', 1)
      .maybeSingle();

    if (!config?.razorpay_key_secret) {
      return jsonResponse({ success: false, message: 'Razorpay keys not configured' }, 500);
    }

    const valid = await verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      config.razorpay_key_secret
    );

    if (!valid) {
      return jsonResponse({ success: false, message: 'Invalid payment signature' }, 400);
    }

    const { data: existingOrder, error: fetchError } = await supabase
      .from('payment_orders')
      .select('*')
      .eq('order_id', razorpay_order_id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existingOrder) {
      return jsonResponse({ success: false, message: 'Order not found' }, 404);
    }

    const razorpay =
      config.razorpay_key_id && config.razorpay_key_secret
        ? { keyId: config.razorpay_key_id, keySecret: config.razorpay_key_secret }
        : null;

    const result = await fulfillPaidOrder(supabase, existingOrder, razorpay_payment_id, {
      razorpay,
    });

    return jsonResponse({
      success: true,
      message: result.alreadyComplete
        ? 'Payment already processed'
        : 'Payment verified and registration complete',
      userId: result.userId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('payment-verify:', message);
    return jsonResponse({ success: false, message }, 500);
  }
});
