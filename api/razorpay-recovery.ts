import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServerDb } from './lib/getServerDb';
import { nextRegistrationIdFromRows } from './lib/registrationId';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  if (!req.body) {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
    }
    try {
      req.body = JSON.parse(raw);
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid JSON payload' });
    }
  }

  let db;
  try {
    db = getServerDb();
  } catch (cfgErr: unknown) {
    const msg = cfgErr instanceof Error ? cfgErr.message : String(cfgErr);
    return res.status(500).json({ success: false, error: msg });
  }

  try {
    const { data: payConfig, error: configErr } = await db.rpc('admin_get_payment_config');
    if (configErr || !payConfig) {
      return res.status(500).json({
        success: false,
        error: 'Could not load Razorpay config from database. Set it in Super Admin → Payment Settings.',
      });
    }

    const cfg = payConfig as Record<string, unknown>;
    const rzpKeyId = String(cfg.razorpay_key_id || '').trim();
    const rzpKeySecret = String(cfg.razorpay_key_secret || '').trim();

    if (!rzpKeyId || !rzpKeySecret) {
      return res.status(500).json({ success: false, error: 'Razorpay Key ID or Secret is empty.' });
    }

    const rzpAuth = 'Basic ' + Buffer.from(`${rzpKeyId}:${rzpKeySecret}`).toString('base64');
    const { action, query, paymentDetails, password } = req.body as {
      action?: string;
      query?: string;
      paymentDetails?: Record<string, unknown>;
      password?: string;
    };

    if (action === 'fetch_razorpay_payment') {
      if (!query) return res.status(400).json({ success: false, error: 'Missing query (email or pay_id)' });

      let matchedPayment: Record<string, unknown> | null = null;

      if (String(query).startsWith('pay_')) {
        const rzpRes = await fetch(`https://api.razorpay.com/v1/payments/${query}`, {
          headers: { Authorization: rzpAuth },
        });
        if (rzpRes.ok) {
          matchedPayment = (await rzpRes.json()) as Record<string, unknown>;
        } else {
          const err = (await rzpRes.json()) as { error?: { description?: string } };
          return res.status(404).json({ success: false, error: err?.error?.description || 'Payment ID not found' });
        }
      } else {
        const rzpRes = await fetch('https://api.razorpay.com/v1/payments?count=100&expand[]=card', {
          headers: { Authorization: rzpAuth },
        });
        if (!rzpRes.ok) {
          const err = (await rzpRes.json()) as { error?: { description?: string } };
          return res.status(500).json({ success: false, error: err?.error?.description || 'Failed to fetch from Razorpay' });
        }
        const data = (await rzpRes.json()) as { items?: Array<Record<string, unknown>> };
        matchedPayment =
          (data.items || []).find(
            (p) => p.email && String(p.email).toLowerCase() === String(query).toLowerCase()
          ) || null;
        if (!matchedPayment) {
          return res.status(404).json({
            success: false,
            error: 'No payment found for this email in the last 100 transactions.',
          });
        }
      }

      let isRegistered = false;
      if (matchedPayment?.email) {
        const { data: existingStudent } = await db
          .from('students')
          .select('id')
          .eq('email', String(matchedPayment.email).toLowerCase())
          .maybeSingle();
        isRegistered = !!existingStudent;
      }

      return res.status(200).json({ success: true, payment: matchedPayment, isRegistered });
    }

    if (action === 'recover_payment_and_create_student') {
      if (!paymentDetails) return res.status(400).json({ success: false, error: 'Missing paymentDetails' });

      const { name, email, amount, paymentId, contact } = paymentDetails as {
        name?: string;
        email?: string;
        amount?: number;
        paymentId?: string;
        contact?: string;
      };
      if (!email || !paymentId || amount == null) {
        return res.status(400).json({ success: false, error: 'Missing required payment fields' });
      }

      const emailLower = String(email).toLowerCase();
      let authUserId: string | null = null;
      let isNewUser = false;

      const { data: existingStudent } = await db
        .from('students')
        .select('id')
        .eq('email', emailLower)
        .maybeSingle();

      if (existingStudent?.id) {
        authUserId = String(existingStudent.id);
      } else {
        if (!password) {
          return res.status(400).json({ success: false, error: 'Password is required to create a new user account.' });
        }

        const { data: newUser, error: createError } = await db.auth.admin.createUser({
          email: emailLower,
          password,
          email_confirm: true,
          user_metadata: { full_name: name },
        });
        if (createError) throw createError;

        authUserId = newUser?.user?.id || null;
        if (!authUserId) throw new Error('User creation failed');
        isNewUser = true;

        await db.from('user_roles').insert({ user_id: authUserId, role: 'student' });

        const { data: recentStudents } = await db
          .from('students')
          .select('registration_id')
          .not('registration_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(50);

        const regId = nextRegistrationIdFromRows(
          recentStudents ?? [],
          new Date().getFullYear()
        );

        await db.from('students').insert({
          id: authUserId,
          email: emailLower,
          full_name: name,
          contact_number: contact,
          status: 'Active',
          registration_id: regId,
        });

        await db.from('profiles').upsert({
          id: authUserId,
          full_name: name,
          email: emailLower,
          contact_number: contact,
        });
      }

      const { error: paymentError } = await db.from('payment_success').upsert(
        {
          payment_id: paymentId,
          user_id: authUserId,
          email: emailLower,
          amount_paise: Math.round(Number(amount) * 100),
          status: 'success',
          full_name: name,
        },
        { onConflict: 'payment_id' }
      );

      if (paymentError) throw paymentError;

      await db.from('payment_cancelled').delete().eq('user_email', emailLower);
      await db.from('registration_leads').delete().eq('email', emailLower);

      return res.status(200).json({ success: true, userId: authUserId, isNewUser });
    }

    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Razorpay recovery error:', err);
    return res.status(500).json({ success: false, error: message });
  }
}
