import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fulfillPaidOrder, getServiceSupabase } from '../_shared/paymentEnrollment.ts';
import { verifyWebhookSignature } from '../_shared/razorpay.ts';
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';

/**
 * Razorpay webhook (no Vercel / no manual service key).
 * Dashboard URL:
 *   https://unqfphgjilxpbzajcdjl.supabase.co/functions/v1/payment-webhook
 * Events: payment.authorized, payment.captured, payment.failed
 * Secret: payment_config.razorpay_webhook_secret
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  // Razorpay may probe the URL on save (GET or empty POST) — return JSON so save succeeds.
  if (req.method === 'GET') {
    return jsonResponse({ ok: true, message: 'payment-webhook ready' });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ message: 'Method not allowed' }, 405);
  }

  const bodyText = await req.text();
  if (!bodyText.trim()) {
    return jsonResponse({ ok: true, message: 'empty body acknowledged' });
  }

  let event: {
    event?: string;
    payload?: { payment?: { entity?: Record<string, unknown> } };
  };
  try {
    event = JSON.parse(bodyText);
  } catch {
    return jsonResponse({ message: 'Invalid JSON' }, 400);
  }

  try {
    const { supabaseUrl, supabaseServiceKey } = getServiceSupabase();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: config } = await supabase
      .from('payment_config')
      .select('razorpay_key_id, razorpay_key_secret, razorpay_webhook_secret')
      .eq('id', 1)
      .maybeSingle();

    const webhookSecret =
      config?.razorpay_webhook_secret || config?.razorpay_key_secret || '';
    const signature = req.headers.get('x-razorpay-signature') || '';

    if (webhookSecret && signature) {
      const valid = await verifyWebhookSignature(bodyText, signature, webhookSecret);
      if (!valid) {
        console.warn('Invalid Razorpay webhook signature');
        return jsonResponse({ message: 'Invalid signature' }, 400);
      }
    }

    const eventName = event.event || '';
    const paymentEntity = event.payload?.payment?.entity;
    const orderId = paymentEntity?.order_id as string | undefined;
    const paymentId = paymentEntity?.id as string | undefined;

    if (!orderId || !paymentId) {
      return jsonResponse({ message: 'Ignored — no payment entity' });
    }

    console.log(`payment-webhook: ${eventName} order=${orderId}`);

    const { data: existingOrder, error: fetchError } = await supabase
      .from('payment_orders')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existingOrder) {
      return jsonResponse({ message: 'Order not found' }, 404);
    }

    if (eventName === 'payment.failed') {
      if (existingOrder.status !== 'success') {
        await supabase
          .from('payment_orders')
          .update({
            status: 'failed',
            payment_id: paymentId,
            updated_at: new Date().toISOString(),
          })
          .eq('order_id', orderId);
      }

      const metadata = (existingOrder.metadata || {}) as Record<string, unknown>;
      const { data: payLog } = await supabase
        .from('payment_success')
        .select('id')
        .eq('payment_id', paymentId)
        .maybeSingle();

      if (!payLog) {
        await supabase.from('payment_success').insert({
          user_id: existingOrder.user_id || null,
          payment_id: paymentId,
          amount_paise: existingOrder.amount,
          email: metadata.email || existingOrder.user_email,
          full_name: metadata.fullName || metadata.full_name || 'Unknown',
          college_name:
            metadata.collegeName || metadata.college || metadata.college_name || 'Unknown',
          status: 'failed',
          failure_reason:
            (paymentEntity?.error_description as string) || 'Payment Failed or Cancelled',
          metadata,
        });
      }

      return jsonResponse({ message: 'OK' });
    }

    if (eventName === 'payment.authorized' || eventName === 'payment.captured') {
      const razorpay =
        config?.razorpay_key_id && config?.razorpay_key_secret
          ? { keyId: config.razorpay_key_id, keySecret: config.razorpay_key_secret }
          : null;

      await fulfillPaidOrder(supabase, existingOrder, paymentId, {
        razorpay,
        skipCapture: eventName === 'payment.captured',
      });

      return jsonResponse({ message: 'OK' });
    }

    return jsonResponse({ message: 'Ignored event' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('payment-webhook error:', message);
    return jsonResponse({ message }, 500);
  }
});
