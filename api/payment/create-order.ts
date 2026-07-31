import type { VercelRequest, VercelResponse } from '@vercel/node';
import Razorpay from 'razorpay';
import { assertStudentRegistrationAvailableServer } from '../lib/registrationAvailability';
import { getServerDb } from '../lib/getServerDb';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const reqId = `co_${Date.now()}`;

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  try {
    console.log(`[${reqId}] ▶ create-order called | method=${req.method}`);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    const { studentData, amount } = req.body || {};
    const parsedAmount = Number(amount);
    if (!studentData || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Missing student data or amount' });
    }

    let db;
    try {
      db = getServerDb();
    } catch (cfgErr: unknown) {
      const msg = cfgErr instanceof Error ? cfgErr.message : String(cfgErr);
      return res.status(500).json({ success: false, message: msg });
    }

    const regEmail = String(studentData?.email || '').trim();
    const regPhone = String(studentData?.contact_number || studentData?.contact || '').trim();
    const purpose = String(studentData?.purpose || '').trim().toLowerCase();
    const source = String(studentData?.source || '').trim().toLowerCase();
    // Existing students buying a course / unlocking internship / clearing unpaid upload
    // already have email+phone in the directory — do not block checkout.
    const skipAvailabilityCheck =
      purpose === 'course_purchase' ||
      purpose === 'internship_upgrade' ||
      source.includes('unpaid_student') ||
      source.includes('course_');

    if (regEmail && regPhone && !skipAvailabilityCheck) {
      try {
        await assertStudentRegistrationAvailableServer(db, regEmail, regPhone);
      } catch (availErr: unknown) {
        const msg = availErr instanceof Error ? availErr.message : 'Email or mobile already registered.';
        return res.status(400).json({ success: false, message: msg });
      }
    }

    const { data: config, error: configError } = await db
      .from('payment_config')
      .select('razorpay_key_id, razorpay_key_secret')
      .eq('id', 1)
      .maybeSingle();

    if (configError) {
      return res.status(500).json({ success: false, message: `DB error: ${configError.message}` });
    }

    if (!config?.razorpay_key_id || !config?.razorpay_key_secret) {
      return res.status(500).json({
        success: false,
        message: 'Razorpay credentials not found in payment_config table (id=1).',
      });
    }

    const razorpayKeyId = String(config.razorpay_key_id);
    const razorpay = new Razorpay({
      key_id: razorpayKeyId,
      key_secret: String(config.razorpay_key_secret),
    });

    const amountPaise = Math.round(parsedAmount);
    const receipt = `rcpt_${Date.now()}`;
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt,
      payment_capture: 1,
    });

    const { error: insertError } = await db.from('payment_orders').insert({
      order_id: order.id,
      user_email: studentData.email,
      user_phone: studentData.contact || studentData.contact_number,
      amount: amountPaise,
      status: 'pending',
      metadata: studentData,
    });

    if (insertError) {
      return res.status(500).json({ success: false, message: `DB insert error: ${insertError.message}` });
    }

    return res.status(200).json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: razorpayKeyId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${reqId}] ❌ create-order error:`, msg);
    return res.status(500).json({ success: false, message: msg || 'Unknown server error in create-order' });
  }
}
