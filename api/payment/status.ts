import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServerDb } from '../lib/getServerDb';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { orderId } = req.query;
  if (!orderId) {
    return res.status(400).json({ success: false, message: 'OrderId is required' });
  }

  let db;
  try {
    db = getServerDb();
  } catch (cfgErr: unknown) {
    const msg = cfgErr instanceof Error ? cfgErr.message : String(cfgErr);
    return res.status(500).json({ success: false, message: msg });
  }

  try {
    const { data, error } = await db
      .from('payment_orders')
      .select('status, payment_id')
      .eq('order_id', String(orderId))
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: 'Order not found' });

    return res.status(200).json({
      success: true,
      status: data.status,
      paymentId: data.payment_id,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Status Check Error:', error);
    return res.status(500).json({ success: false, message });
  }
}
