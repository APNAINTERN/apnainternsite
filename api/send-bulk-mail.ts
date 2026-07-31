import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  createSmtpTransporter,
  getSmtpCredentials,
  sesMailHeaders,
} from './lib/smtpTransport';

/** Max recipients per request (one SMTP connection, ~45s on Vercel 60s limit). */
const MAX_BATCH_SIZE = 15;
const DELAY_BETWEEN_SENDS_MS = 2_500;

function isSmtpRateLimitError(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    m.includes('451') ||
    m.includes('ratelimit') ||
    m.includes('rate limit') ||
    m.includes('hostinger_out') ||
    m.includes('exceeded for key')
  );
}

function parseJsonBody(req: VercelRequest): Record<string, unknown> {
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

function bulkAnnouncementHtml(message: string): string {
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 32px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.02em;">EzyIntern Announcement</h1>
      </div>
      <div style="padding: 40px 32px; color: #1e293b; line-height: 1.6;">
        <div style="font-size: 16px;">
          ${String(message || '').replace(/\n/g, '<br/>')}
        </div>
      </div>
      <div style="background: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="margin: 0; font-size: 12px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">EzyIntern — Empowering Future Careers</p>
      </div>
    </div>
  `;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const body = parseJsonBody(req);
    const subject = String(body.subject || 'Update from EzyIntern').trim();
    const message = String(body.message || '').trim();
    const raw = body.recipients;
    const list = (Array.isArray(raw) ? raw : [])
      .map((e) => String(e || '').trim().toLowerCase())
      .filter((e) => e.includes('@'));

    if (!message) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }
    if (!list.length) {
      return res.status(400).json({ success: false, message: 'No valid recipient emails' });
    }
    if (list.length > MAX_BATCH_SIZE) {
      return res.status(400).json({
        success: false,
        message: `Maximum ${MAX_BATCH_SIZE} recipients per batch`,
      });
    }

    const { user: SMTP_USER, pass: SMTP_PASS } = getSmtpCredentials();
    if (!SMTP_USER || !SMTP_PASS) {
      return res.status(500).json({ success: false, message: 'SMTP Credentials missing' });
    }

    const transporter = await createSmtpTransporter();
    const html = bulkAnnouncementHtml(message);
    const { from, sender } = sesMailHeaders();
    let sent = 0;
    let failed = 0;
    let rateLimited = false;
    let lastError = '';

    for (let i = 0; i < list.length; i++) {
      if (i > 0) await sleep(DELAY_BETWEEN_SENDS_MS);

      try {
        await transporter.sendMail({
          from,
          sender,
          to: list[i],
          subject,
          html,
        });
        sent++;
      } catch (e: unknown) {
        failed++;
        lastError = e instanceof Error ? e.message : String(e);
        if (isSmtpRateLimitError(e)) {
          rateLimited = true;
          break;
        }
      }
    }

    if (rateLimited && sent === 0) {
      return res.status(429).json({
        success: false,
        sent,
        failed,
        rateLimited: true,
        message:
          'SMTP rate limit (Hostinger). Wait 1 hour, then continue in smaller batches.',
        error: lastError,
      });
    }

    return res.status(200).json({
      success: true,
      sent,
      failed,
      rateLimited,
      message: rateLimited
        ? `Sent ${sent} before rate limit; pause 1 hour before next batch.`
        : `Batch sent (${sent} ok${failed ? `, ${failed} failed` : ''}).`,
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('send-bulk-mail error:', err);
    if (isSmtpRateLimitError(error)) {
      return res.status(429).json({
        success: false,
        rateLimited: true,
        message: 'SMTP rate limit (Hostinger). Wait 1 hour before retrying.',
        error: err.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Bulk send failed',
      error: err.message,
    });
  }
}
