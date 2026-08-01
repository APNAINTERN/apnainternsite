import type { VercelRequest, VercelResponse } from '@vercel/node';

/** Inlined — importing api/lib/*.ts crashes this Vercel function (FUNCTION_INVOCATION_FAILED). */
type MailFrom = { name: string; address: string };

function resolveSmtpHost(): string {
  return (
    process.env.SMTP_HOST ||
    process.env.SES_SMTP_HOST ||
    'email-smtp.ap-south-1.amazonaws.com'
  );
}

function resolveSmtpPort(): number {
  const raw = process.env.SMTP_PORT || '587';
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 587;
}

function resolveMailFromAddress(): string {
  const explicit = (process.env.MAIL_FROM || process.env.SMTP_FROM || '').trim();
  const angle = explicit.match(/<([^>]+)>/);
  if (angle) return angle[1].trim();
  if (explicit.includes('@')) return explicit;
  return process.env.MAIL_FROM_ADDRESS || 'info@apnaintern.in';
}

function resolveMailFrom(label = 'Apna Intern'): MailFrom {
  const address = resolveMailFromAddress();
  const explicit = (process.env.MAIL_FROM || '').trim();
  const nameMatch = explicit.match(/^"?([^"<]+)"?\s*</);
  const name = nameMatch ? nameMatch[1].trim() : label;
  return { name, address };
}

function sesMailHeaders(label = 'Apna Intern'): { from: MailFrom; sender: string } {
  const from = resolveMailFrom(label);
  return { from, sender: from.address };
}

function getSmtpCredentials(): { user: string; pass: string } {
  return {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  };
}

async function createSmtpTransporter() {
  const nodemailer = (await import('nodemailer')).default;
  const { user, pass } = getSmtpCredentials();
  if (!user || !pass) {
    throw new Error('SMTP credentials missing');
  }
  const port = resolveSmtpPort();
  return nodemailer.createTransport({
    host: resolveSmtpHost(),
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 10000,
  });
}

/** SMTP provider rate limit (Hostinger legacy or SES throttling). */
function isSmtpRateLimitError(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    m.includes('451') ||
    m.includes('ratelimit') ||
    m.includes('rate limit') ||
    m.includes('throttl') ||
    m.includes('hostinger_out') ||
    m.includes('exceeded for key') ||
    m.includes('maximum sending rate')
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

const BULK_RATE_LIMIT_DELAYS_MS = [15_000, 45_000, 90_000];
/** Per request — emails are sent in parallel inside the handler (no artificial delay). */
const BULK_BATCH_MAX = 15;

function bulkAnnouncementHtml(message: string): string {
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 32px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.02em;">Apna Intern Announcement</h1>
      </div>
      <div style="padding: 40px 32px; color: #1e293b; line-height: 1.6;">
        <div style="font-size: 16px;">
          ${String(message || '').replace(/\n/g, '<br/>')}
        </div>
      </div>
      <div style="background: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="margin: 0; font-size: 12px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Apna Intern — Empowering Future Careers</p>
        <p style="margin: 4px 0 0; font-size: 11px; color: #cbd5e1;">This is an official communication from the Apna Intern platform.</p>
      </div>
    </div>
  `;
}

async function sendMailWithRetry(
  transporter: { sendMail: (opts: Record<string, unknown>) => Promise<unknown> },
  mailOptions: Record<string, unknown>,
  attempts = 3,
  opts?: { bulk?: boolean }
) {
  let last: unknown;
  const maxAttempts = opts?.bulk ? 4 : attempts;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await transporter.sendMail(mailOptions);
    } catch (e) {
      last = e;
      const delay = isSmtpRateLimitError(e)
        ? opts?.bulk
          ? BULK_RATE_LIMIT_DELAYS_MS[i] ?? 120_000
          : 8_000 * (i + 1)
        : 400 * (i + 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw last;
}

async function deliverOutbound(
  mailOptions: Record<string, unknown>,
  transporter: { sendMail: (opts: Record<string, unknown>) => Promise<unknown> },
  opts?: { fast?: boolean; bulk?: boolean; attempts?: number }
) {
  const to = String(mailOptions.to || "").trim();
  const subject = String(mailOptions.subject || "").trim();
  const html = String(mailOptions.html || "");
  const useSes =
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV) ||
    process.env.USE_SES_API === "true";

  if (useSes) {
    const { sendEmailViaSesApi } = await import("./lib/sesSend.js");
    await sendEmailViaSesApi({ to, subject, html });
    return;
  }

  if (opts?.fast) {
    await transporter.sendMail(mailOptions);
    return;
  }
  await sendMailWithRetry(transporter, mailOptions, opts?.attempts ?? 3, {
    bulk: opts?.bulk,
  });
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
    const nodemailer = (await import('nodemailer')).default;

    const body = parseJsonBody(req);
    const name = body.name as string | undefined;
    const email = body.email as string | undefined;
    const message = body.message as string | undefined;
    const otp = body.otp as string | undefined;
    const action = body.action as string | undefined;
    const type = body.type as string | undefined;
    const to = body.to as string | undefined;
    const subject = body.subject as string | undefined;
    const data = (body.data || {}) as Record<string, string | undefined>;

    /** Lovable / some proxies drop `action`; infer college welcome from payload shape. */
    const normalizedAction = (() => {
      const raw = typeof action === "string" ? action.trim().toLowerCase() : "";
      if (raw) return raw;
      const fromType = typeof type === "string" ? type.trim().toLowerCase() : "";
      if (fromType) return fromType;
      const cid = String(data.collegeAdminId || '').trim();
      const recipient = String(to || email || '').trim();
      if (cid && recipient) return 'college_admin_welcome';
      return '';
    })();

    if (normalizedAction === 'send_otp' || normalizedAction === 'login_otp') {
      const recipient = String(to || email || '').trim();
      const code = String(otp || '').trim();
      if (!recipient || code.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Missing recipient email or OTP for send_otp/login_otp',
        });
      }
    }

    const { user: SMTP_USER, pass: SMTP_PASS } = getSmtpCredentials();
    const { from: mailFrom, sender: mailSender } = sesMailHeaders('Apna Intern');
    const useSesApi =
      Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV) ||
      process.env.USE_SES_API === 'true';

    if (!useSesApi && (!SMTP_USER || !SMTP_PASS)) {
      return res.status(500).json({ success: false, message: 'SMTP Credentials missing' });
    }

    const transporter = useSesApi ? null : await createSmtpTransporter();

    if (normalizedAction === 'bulk_custom_mail_batch') {
      if (!transporter) {
        return res.status(500).json({ success: false, message: 'Bulk mail requires SMTP on this host' });
      }
      const rawRecipients = body.recipients;
      const list = (Array.isArray(rawRecipients) ? rawRecipients : [])
        .map((e) => String(e || '').trim().toLowerCase())
        .filter((e) => e.includes('@'));

      if (!String(message || '').trim()) {
        return res.status(400).json({ success: false, message: 'Message is required' });
      }
      if (!list.length) {
        return res.status(400).json({ success: false, message: 'No valid recipient emails' });
      }
      if (list.length > BULK_BATCH_MAX) {
        return res.status(400).json({
          success: false,
          message: `Maximum ${BULK_BATCH_MAX} recipients per batch`,
        });
      }

      const mailSubject = String(subject || 'Update from Apna Intern').trim();
      const html = bulkAnnouncementHtml(String(message));
      const from = mailFrom;
      const sender = mailSender;

      let sent = 0;
      let failed = 0;
      let rateLimited = false;
      let lastError = '';

      const outcomes = await Promise.all(
        list.map(async (to) => {
          try {
            await sendMailWithRetry(
              transporter,
              { from, sender, to, subject: mailSubject, html },
              2,
              { bulk: true }
            );
            return { ok: true as const };
          } catch (e: unknown) {
            return {
              ok: false as const,
              error: e instanceof Error ? e.message : String(e),
              rateLimited: isSmtpRateLimitError(e),
            };
          }
        })
      );

      for (const o of outcomes) {
        if (o.ok) {
          sent++;
          continue;
        }
        failed++;
        lastError = o.error;
        if (o.rateLimited) {
          rateLimited = true;
        }
      }

      if (rateLimited && sent === 0) {
        return res.status(429).json({
          success: false,
          sent,
          failed,
          rateLimited: true,
          message:
            'SMTP rate limit. Wait 1 hour, then send in smaller batches.',
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
    }

    const fastOtpMail =
      normalizedAction === 'login_otp' || normalizedAction === 'send_otp';

    // Skip verify on OTP + bulk — extra SMTP handshakes add 2–10s latency per login code.
    if (
      !fastOtpMail &&
      normalizedAction !== 'bulk_custom_mail' &&
      normalizedAction !== 'bulk_custom_mail_batch' &&
      transporter
    ) {
      try {
        await transporter.verify();
        console.log('SMTP Connection verified');
      } catch (verifyErr: unknown) {
        const m = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
        console.warn('SMTP verify skipped/failed:', m);
      }
    }

    const mailOptions: Record<string, unknown> = {
      from: mailFrom,
      sender: mailSender,
      to: to || email,
    };

    if (normalizedAction === 'test_mail') {
      mailOptions.subject = `[TEST] ${subject || 'Diagnostic Test'}`;
      mailOptions.html = `
        <div style="font-family: sans-serif; padding: 20px; border: 2px solid #0084FF; border-radius: 10px;">
          <h2 style="color: #0084FF;">Apna Intern Mail Test</h2>
          <p>Manual test from Super Admin Panel via Vercel API.</p>
          <hr/>
          <p><strong>Message:</strong> ${message || 'No content'}</p>
        </div>
      `;
    } else if (normalizedAction === 'send_otp' || normalizedAction === 'login_otp') {
      const isLogin = normalizedAction === 'login_otp';
      mailOptions.subject = isLogin ? 'Your Login Verification Code' : 'Your Password Reset OTP';
      mailOptions.html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #0084FF; padding: 24px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">${isLogin ? 'Login Verification' : 'Password Reset'}</h1>
          </div>
          <div style="padding: 32px; text-align: center; color: #1e293b;">
            <p style="font-size: 16px; margin-bottom: 24px;">Hello,</p>
            <p style="font-size: 16px; line-height: 1.5;">${isLogin ? 'Use the following code to complete your login:' : 'You requested to reset your password. Use the 6-digit code below to proceed:'}</p>
            <div style="background-color: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 16px; margin: 32px 0; display: inline-block;">
              <span style="font-size: 36px; font-weight: 800; letter-spacing: 12px; color: #0084FF; font-family: monospace;">${otp}</span>
            </div>
          </div>
        </div>
      `;
    } else if (normalizedAction === 'registration_confirmation' || normalizedAction === 'registration_success') {
      const isResend = normalizedAction === 'registration_success';
      mailOptions.subject = isResend
        ? `Apna Intern — Login credentials (${data.regId || 'your account'})`
        : `Apna Intern — Registration confirmed (${data.registrationId || ''})`;

      mailOptions.html = `
        <div style="font-family: Georgia, 'Times New Roman', serif; padding: 32px; border: 1px solid #e2e8f0; border-radius: 4px; max-width: 600px; margin: 0 auto; color: #1e293b;">
          <div style="border-bottom: 1px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 24px;">
            <p style="margin: 0; font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; color: #64748b;">Apna Intern</p>
            <h1 style="color: #1e293b; margin: 12px 0 0; font-size: 22px; font-weight: 600;">
              ${isResend ? 'Your login credentials' : 'Registration confirmed'}
            </h1>
            <p style="margin: 10px 0 0; color: #64748b; font-size: 15px; font-family: system-ui, sans-serif;">
              ${isResend ? 'Use the details below to sign in to your internship account.' : 'Thank you for registering with Apna Intern.'}
            </p>
          </div>

          <p style="font-size: 15px; line-height: 1.6;">Dear ${data.fullName},</p>
          <p style="font-size: 15px; line-height: 1.6; font-family: system-ui, sans-serif;">
            ${isResend ? 'Below are your current login credentials for the Apna Intern platform.' : 'Your registration has been completed successfully. Your login details are provided below.'}
          </p>

          <div style="background: #f8fafc; padding: 22px 24px; border-radius: 4px; margin: 24px 0; border: 1px solid #e2e8f0; font-family: system-ui, sans-serif;">
            <p style="margin: 0 0 14px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #475569; font-weight: 600;">Login details</p>
            <p style="margin: 8px 0; font-size: 14px;"><strong>Email (sign-in ID):</strong> ${email || to}</p>
            <p style="margin: 8px 0; font-size: 14px;"><strong>Registration ID:</strong> ${data.regId || data.registrationId}</p>
            <p style="margin: 8px 0; font-size: 14px;"><strong>Password:</strong> ${data.password || 'As set during registration'}</p>
          </div>

          <div style="text-align: center; margin: 28px 0;">
            <a href="${data.loginLink || 'https://www.apnaintern.in/login?portal=student'}" style="display:inline-block; padding: 14px 28px; background: #4F46E5; color: #ffffff; text-decoration: none; border-radius: 4px; font-weight: 600; font-size: 14px; font-family: system-ui, sans-serif;">Sign in to dashboard</a>
          </div>

          <div style="background: #f1f5f9; padding: 16px 18px; border-radius: 4px; margin-top: 24px; border-left: 3px solid #4F46E5; font-family: system-ui, sans-serif;">
            <p style="margin: 0; color: #334155; font-size: 13px; font-weight: 600;">Next step</p>
            <p style="margin: 8px 0 0; color: #475569; font-size: 14px; line-height: 1.5;">
              Please sign in using the credentials above to access your dashboard and your offer letter.
            </p>
          </div>

          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 32px; font-family: system-ui, sans-serif;">
            For support, reply to this email or contact us through the official channels listed on our website.<br/>
            <span style="color: #cbd5e1;">© 2026 Apna Intern. All rights reserved.</span>
          </p>
        </div>
      `;
    } else if (normalizedAction === 'admin_password_reset') {
      mailOptions.subject = 'Apna Intern — Password reset by administrator';
      mailOptions.html = `
        <div style="font-family: Georgia, 'Times New Roman', serif; padding: 32px; border: 1px solid #e2e8f0; border-radius: 4px; max-width: 600px; margin: 0 auto; color: #1e293b;">
          <div style="border-bottom: 1px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 24px;">
            <p style="margin: 0; font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; color: #64748b;">Apna Intern</p>
            <h1 style="color: #1e293b; margin: 12px 0 0; font-size: 22px; font-weight: 600;">Password reset notification</h1>
            <p style="margin: 10px 0 0; color: #64748b; font-size: 15px; font-family: system-ui, sans-serif;">
              An administrator has reset your account password.
            </p>
          </div>

          <p style="font-size: 15px; line-height: 1.6;">Dear ${data.fullName},</p>
          <p style="font-size: 15px; line-height: 1.6; font-family: system-ui, sans-serif;">
            Your password for the Apna Intern platform has been reset. Use the new password below to sign in.
          </p>

          <div style="background: #fafaf9; padding: 22px 24px; border-radius: 4px; margin: 24px 0; border: 1px solid #e7e5e4; font-family: system-ui, sans-serif;">
            <p style="margin: 0 0 14px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #57534e; font-weight: 600;">Updated credentials</p>
            <p style="margin: 8px 0; font-size: 14px;"><strong>Email (sign-in ID):</strong> ${email || to}</p>
            <p style="margin: 8px 0; font-size: 14px;"><strong>New password:</strong> <code style="background: #f5f5f4; padding: 4px 10px; border-radius: 4px; font-size: 14px; font-family: ui-monospace, monospace; color: #1c1917;">${data.password}</code></p>
          </div>

          <div style="text-align: center; margin: 28px 0;">
            <a href="${data.loginLink || 'https://www.apnaintern.in/login?portal=student'}" style="display:inline-block; padding: 14px 28px; background: #c2410c; color: #ffffff; text-decoration: none; border-radius: 4px; font-weight: 600; font-size: 14px; font-family: system-ui, sans-serif;">Sign in</a>
          </div>

          <div style="background: #f8fafc; padding: 16px 18px; border-radius: 4px; border-left: 3px solid #334155; font-family: system-ui, sans-serif;">
            <p style="margin: 0; color: #334155; font-size: 13px; font-weight: 600;">Security recommendation</p>
            <p style="margin: 8px 0 0; color: #475569; font-size: 14px; line-height: 1.5;">
              After signing in, please change your password under <strong>Dashboard → Security Settings</strong>.
            </p>
          </div>

          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 32px; font-family: system-ui, sans-serif;">
            If you did not expect this email, contact support immediately.<br/>
            <span style="color: #cbd5e1;">© 2026 Apna Intern. All rights reserved.</span>
          </p>
        </div>
      `;
    } else if (normalizedAction === 'certificate_generated') {
      mailOptions.subject = `Apna Intern — Certificate ready (${data.certificateId})`;
      mailOptions.html = `
        <div style="font-family: sans-serif; padding: 32px; border: 1px solid #eee; border-radius: 16px;">
          <h1 style="color: #059669;">Certificate Ready!</h1>
          <p>Dear ${data.studentName}, your certificate for ${data.programme} is now available.</p>
          <div style="background: #f0fdf4; padding: 20px; border-radius: 12px; margin: 20px 0;">
            <p><strong>Certificate ID:</strong> ${data.certificateId}</p>
          </div>
          <a href="https://www.apnaintern.in/dashboard" style="display:inline-block; padding: 12px 24px; background: #059669; color: white; text-decoration: none; border-radius: 8px;">Download Certificate</a>
        </div>
      `;
    } else if (normalizedAction === 'college_admin_welcome') {
      const loginLink = String(data.loginLink || '').trim() || 'https://www.apnaintern.in/college/login';
      const collegeAdminId = String(data.collegeAdminId || '').trim();
      const fullName = String(data.fullName || data.full_name || name || 'College administrator').trim();
      const toAddr = String(to || email || '').trim();
      if (!toAddr || !collegeAdminId) {
        return res.status(400).json({
          success: false,
          message: 'Missing recipient (to) or collegeAdminId for college_admin_welcome',
        });
      }
      mailOptions.subject = 'Apna Intern — College portal access';
      mailOptions.html = `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; color: #1e293b;">
          <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 28px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800;">College administrator access</h1>
          </div>
          <div style="padding: 28px 24px; line-height: 1.6;">
            <p style="margin: 0 0 12px;">Dear ${fullName},</p>
            <p style="margin: 0 0 16px;">Your Apna Intern <strong>college portal</strong> account is ready. Sign in with your email and the College Admin ID below (this is your sign-in secret; store it safely).</p>
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 18px 20px; margin: 20px 0;">
              <p style="margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #166534; font-weight: 700;">College Admin ID</p>
              <p style="margin: 0; font-size: 18px; font-family: ui-monospace, monospace; font-weight: 800; color: #14532d;">${collegeAdminId}</p>
              <p style="margin: 16px 0 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #166534; font-weight: 700;">Email (sign-in)</p>
              <p style="margin: 4px 0 0; font-size: 15px;">${toAddr}</p>
            </div>
            <div style="text-align: center; margin: 28px 0;">
              <a href="${loginLink}" style="display:inline-block; padding: 14px 28px; background: #059669; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;">Open college sign-in</a>
            </div>
            <p style="margin: 0; font-size: 13px; color: #64748b;">If the button does not work, copy this URL into your browser:<br/><span style="word-break: break-all; color: #0f766e;">${loginLink}</span></p>
          </div>
          <p style="font-size: 11px; color: #94a3b8; text-align: center; padding: 16px; margin: 0; border-top: 1px solid #e2e8f0;">© 2026 Apna Intern</p>
        </div>
      `;
    } else if (normalizedAction === 'bulk_custom_mail') {
      mailOptions.subject = subject || 'Update from Apna Intern';
      mailOptions.html = bulkAnnouncementHtml(String(message || ''));
    } else if (
      !normalizedAction &&
      String(email || '').trim() &&
      (String(message || '').trim() || String(name || '').trim())
    ) {
      Object.assign(mailOptions, sesMailHeaders('Apna Intern Contact'));
      mailOptions.to = 'noreply@apnaintern.in';
      mailOptions.subject = `New Contact Request from ${name || 'User'}`;
      mailOptions.html = `<h3>Message from ${name} (${email}):</h3><p>${message}</p>`;

      const visitor = String(name || 'there').trim() || 'there';
      await deliverOutbound(
        {
          ...sesMailHeaders('Apna Intern Support'),
          to: email,
          subject: 'We received your message!',
          html: `<p>Hi ${visitor}, we received your message and will get back to you soon.</p>`,
        },
        transporter!
      );
    } else if (!normalizedAction) {
      return res.status(400).json({
        success: false,
        message:
          'Missing mail `action`. Send a known action (e.g. college_admin_welcome, registration_success) or a legacy contact payload with name/email/message.',
      });
    } else {
      return res.status(400).json({
        success: false,
        message: `Unknown mail action: ${normalizedAction}`,
      });
    }

    const mailTo = mailOptions.to;
    if (mailTo == null || String(mailTo).trim() === '') {
      return res.status(400).json({ success: false, message: 'Missing recipient email (to)' });
    }
    mailOptions.to = String(mailTo).trim();

    if (fastOtpMail) {
      try {
        await deliverOutbound(mailOptions, transporter!, { fast: true });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        if (
          normalizedAction === 'login_otp' &&
          (process.env.AWS_STAGE === 'staging' ||
            /not verified|MessageRejected/i.test(errMsg))
        ) {
          return res.status(200).json({
            success: true,
            message: 'Verification code generated (email pending SES setup).',
            devOtp: String(otp || ''),
            warning: errMsg,
          });
        }
        if (isSmtpRateLimitError(e)) {
          return res.status(429).json({
            success: false,
            message: 'SMTP rate limit. Wait a few minutes or use password sign-in.',
            error: e instanceof Error ? e.message : String(e),
          });
        }
        throw e;
      }
    } else {
      await deliverOutbound(mailOptions, transporter!, {
        attempts: 3,
        bulk: normalizedAction === 'bulk_custom_mail',
      });
    }
    return res.status(200).json({ success: true, message: 'Email sent successfully!' });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('send-mail error:', err);
    if (isSmtpRateLimitError(error)) {
      return res.status(429).json({
        success: false,
        message:
          'SMTP rate limit. Wait 30–60 minutes or reduce send volume.',
        error: err.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to send email',
      error: err.message,
      code: (error as { code?: string })?.code,
    });
  }
}
