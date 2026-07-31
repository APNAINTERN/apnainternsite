import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { query } from '../../aws/server/db';
import { useRds } from '../lib/useRds';

type Action = 'request_otp' | 'reset_password';

function getJsonBody(req: VercelRequest): Record<string, unknown> {
  const b = req.body as unknown;
  if (b == null) return {};
  if (typeof b === 'object' && !Buffer.isBuffer(b)) {
    return b as Record<string, unknown>;
  }
  const s = typeof b === 'string' ? b : Buffer.isBuffer(b) ? b.toString('utf8') : String(b);
  try {
    const parsed = JSON.parse(s) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function sendOtpEmail(normalizedEmail: string, generatedOtp: string): Promise<void> {
  const { createSmtpTransporter, getSmtpCredentials, sesMailHeaders } = await import('../lib/smtpTransport');
  const { user: SMTP_USER, pass: SMTP_PASS } = getSmtpCredentials();
  if (!SMTP_USER || !SMTP_PASS) {
    throw new Error('SMTP Credentials missing');
  }

  const transporter = await createSmtpTransporter();
  await transporter.sendMail({
    ...sesMailHeaders(),
    to: normalizedEmail,
    subject: 'Your Password Reset OTP',
    html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px;">
            <div style="background-color: #0084FF; padding: 24px; text-align: center;">
              <h1 style="color: white; margin: 0;">Password Reset</h1>
            </div>
            <div style="padding: 24px; text-align: center;">
              <p>Use this OTP to reset your password:</p>
              <p style="font-size: 32px; letter-spacing: 8px; font-weight: 800; color: #0084FF;">${generatedOtp}</p>
              <p style="font-size: 12px; color: #64748b;">This code expires in 15 minutes.</p>
            </div>
          </div>
        `,
  });
}

async function handleWithRds(
  action: Action,
  normalizedEmail: string,
  otp: string | undefined,
  newPassword: string | undefined,
  res: VercelResponse
) {
  if (action === 'request_otp') {
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    await query(
      `INSERT INTO public.password_resets (id, email, otp, expires_at)
       VALUES ($1, $2, $3, now() + interval '15 minutes')`,
      [randomUUID(), normalizedEmail, generatedOtp]
    );

    try {
      await sendOtpEmail(normalizedEmail, generatedOtp);
    } catch (mailErr) {
      // Local AWS often has no SMTP — still store OTP so browser/session can verify.
      if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEV_OTP_WITHOUT_SMTP === 'true') {
        return res.status(200).json({
          success: true,
          message: 'OTP stored (email skipped — SMTP missing or failed)',
          devOtp: generatedOtp,
        });
      }
      throw mailErr;
    }

    return res.status(200).json({ success: true, message: 'OTP sent successfully' });
  }

  if (action === 'reset_password') {
    const normalizedOtp = String(otp || '').trim();
    const password = String(newPassword || '');
    if (normalizedOtp.length !== 6 || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Invalid OTP or password' });
    }

    const { rows: otpRows } = await query<{ id: string }>(
      `SELECT id FROM public.password_resets
       WHERE lower(trim(email)) = $1 AND trim(otp) = $2 AND expires_at > now()
       ORDER BY created_at DESC NULLS LAST
       LIMIT 1`,
      [normalizedEmail, normalizedOtp]
    );
    if (!otpRows[0]) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    const { rows: okRows } = await query<{ result: boolean }>(
      `SELECT public.reset_user_password($1, $2, $3) AS result`,
      [normalizedEmail, normalizedOtp, password]
    );
    if (!okRows[0]?.result) {
      return res.status(400).json({ success: false, message: 'Password reset failed' });
    }

    return res.status(200).json({ success: true, message: 'Password reset successful' });
  }

  return res.status(400).json({ success: false, message: 'Invalid action' });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  try {
    const body = getJsonBody(req);
    const { action, email, otp, newPassword } = body as {
      action?: Action;
      email?: string;
      otp?: string;
      newPassword?: string;
    };

    const normalizedEmail = String(email ?? '').trim().toLowerCase();

    if (!action || !normalizedEmail) {
      return res.status(400).json({ success: false, message: 'Missing action or email' });
    }

    if (!useRds()) {
      return res.status(503).json({
        success: false,
        message: 'Password reset requires RDS. Set DATABASE_URL in .env.awsrds.local.',
      });
    }

    return await handleWithRds(action, normalizedEmail, otp, newPassword, res);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('forgot-password error:', msg);
    return res.status(500).json({ success: false, message: msg || 'Internal server error' });
  }
}
