import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { fulfillPaidOrder } from '../lib/paymentEnrollment';
import { getServerDb } from '../lib/getServerDb';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  let db;
  try {
    db = getServerDb();
  } catch (cfgErr: unknown) {
    const msg = cfgErr instanceof Error ? cfgErr.message : String(cfgErr);
    return res.status(500).json({ message: msg });
  }

  const { data: config } = await db
    .from('payment_config')
    .select('razorpay_key_id, razorpay_key_secret, razorpay_webhook_secret')
    .eq('id', 1)
    .maybeSingle();

  const webhookSecret =
    config?.razorpay_webhook_secret ||
    config?.razorpay_key_secret ||
    process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers['x-razorpay-signature'] as string;

  if (webhookSecret) {
    const shasum = crypto.createHmac('sha256', String(webhookSecret));
    shasum.update(JSON.stringify(req.body));
    const digest = shasum.digest('hex');
    if (digest !== signature) {
      return res.status(400).json({ message: 'Invalid signature' });
    }
  }

  const event = req.body as {
    event?: string;
    payload?: { payment?: { entity?: Record<string, unknown> } };
  };
  const eventName = event.event || '';
  const paymentEntity = event.payload?.payment?.entity;
  const orderId = paymentEntity?.order_id as string | undefined;
  const paymentId = paymentEntity?.id as string | undefined;

  if (!orderId || !paymentId) {
    return res.status(200).json({ message: 'Ignored — no payment entity' });
  }

  try {
    const { data: existingOrder, error: fetchError } = await db
      .from('payment_orders')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existingOrder) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (eventName === 'payment.failed') {
      if (existingOrder.status !== 'success') {
        await db
          .from('payment_orders')
          .update({
            status: 'failed',
            payment_id: paymentId,
            updated_at: new Date().toISOString(),
          })
          .eq('order_id', orderId);
      }

      const metadata = (existingOrder.metadata || {}) as Record<string, unknown>;
      const { data: payLog } = await db
        .from('payment_success')
        .select('id')
        .eq('payment_id', paymentId)
        .maybeSingle();

      if (!payLog) {
        await db.from('payment_success').insert({
          user_id: existingOrder.user_id || null,
          payment_id: paymentId,
          amount_paise: existingOrder.amount,
          email: metadata.email || existingOrder.user_email,
          full_name: metadata.fullName || metadata.full_name || 'Unknown',
          college_name: metadata.collegeName || metadata.college || metadata.college_name || 'Unknown',
          status: 'failed',
          failure_reason:
            (paymentEntity?.error_description as string) || 'Payment Failed or Cancelled',
          metadata,
        });
      }

      return res.status(200).json({ message: 'OK' });
    }

    if (eventName === 'payment.authorized' || eventName === 'payment.captured') {
      const razorpayKeyId = config?.razorpay_key_id;
      const razorpayKeySecret = config?.razorpay_key_secret;
      let razorpay: Razorpay | null = null;
      if (razorpayKeyId && razorpayKeySecret) {
        razorpay = new Razorpay({
          key_id: String(razorpayKeyId),
          key_secret: String(razorpayKeySecret),
        });
      }

      try {
        await fulfillPaidOrder(db, existingOrder as Parameters<typeof fulfillPaidOrder>[1], paymentId, {
          razorpay,
          skipCapture: eventName === 'payment.captured',
        });
      } catch (fulfillErr: unknown) {
        const msg = fulfillErr instanceof Error ? fulfillErr.message : String(fulfillErr);
        console.error(`Webhook fulfill failed (${eventName}):`, msg);
        return res.status(500).json({ message: msg });
      }

      return res.status(200).json({ message: 'OK' });
    }

    return res.status(200).json({ message: 'Ignored event' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Webhook Processing Error:', error);
    return res.status(500).json({ message });
  }
}
