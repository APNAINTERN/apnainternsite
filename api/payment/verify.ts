import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { fulfillPaidOrder } from '../lib/paymentEnrollment';
import { getServerDb } from '../lib/getServerDb';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body || {};
  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
    return res.status(400).json({ success: false, message: 'Missing payment details' });
  }

  let db;
  try {
    db = getServerDb();
  } catch (cfgErr: unknown) {
    const msg = cfgErr instanceof Error ? cfgErr.message : String(cfgErr);
    return res.status(500).json({ success: false, message: msg });
  }

  try {
    const { data: config } = await db
      .from('payment_config')
      .select('razorpay_key_id, razorpay_key_secret')
      .eq('id', 1)
      .maybeSingle();

    const razorpaySecret = config?.razorpay_key_secret;
    const razorpayKeyId = config?.razorpay_key_id;
    if (!razorpaySecret || !razorpayKeyId) {
      throw new Error('Razorpay keys not configured');
    }

    const expectedSignature = crypto
      .createHmac('sha256', String(razorpaySecret))
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    const { data: existingOrder, error: fetchError } = await db
      .from('payment_orders')
      .select('*')
      .eq('order_id', razorpay_order_id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existingOrder) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const razorpay = new Razorpay({
      key_id: String(razorpayKeyId),
      key_secret: String(razorpaySecret),
    });

    let result: { userId?: string; alreadyComplete: boolean };
    try {
      result = await fulfillPaidOrder(db, existingOrder as Parameters<typeof fulfillPaidOrder>[1], razorpay_payment_id, {
        razorpay,
      });
    } catch (capErr: unknown) {
      const msg = capErr instanceof Error ? capErr.message : String(capErr);
      const low = msg.toLowerCase();
      const isPasswordPolicy =
        low.includes('weak') ||
        low.includes('password strength') ||
        low.includes('easy to guess') ||
        low.includes('known to be weak') ||
        low.includes('leaked') ||
        (low.includes('password') && low.includes('policy'));
      return res.status(502).json({
        success: false,
        message: isPasswordPolicy
          ? 'Your payment was received. Account setup did not finish — contact support with your email.'
          : `Could not complete registration: ${msg}`,
      });
    }

    return res.status(200).json({
      success: true,
      message: result.alreadyComplete
        ? 'Payment already processed'
        : 'Payment verified and registration complete',
      userId: result.userId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Verification Error:', error);
    return res.status(500).json({ success: false, message });
  }
}
