/**
 * Local development API server — runs on port 3000.
 * Vite (:8080) proxies /api/* → http://localhost:3000
 *
 * Started automatically by: npm run dev
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const nodemailer = require('nodemailer');

// Load .env without extra dependency
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const PORT = 3000;

function smtpTransporter() {
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  if (!user || !pass) throw new Error('SMTP credentials missing in .env');
  const host = process.env.SMTP_HOST || 'email-smtp.ap-south-1.amazonaws.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 10000,
  });
}

function mailFromAddress() {
  const explicit = (process.env.MAIL_FROM || process.env.SMTP_FROM || '').trim();
  const m = explicit.match(/<([^>]+)>/);
  if (m) return m[1].trim();
  if (explicit.includes('@')) return explicit;
  return process.env.MAIL_FROM_ADDRESS || 'admin@apnaintern.in';
}

function mailFrom() {
  const addr = mailFromAddress();
  const explicit = (process.env.MAIL_FROM || '').trim();
  const nameMatch = explicit.match(/^"?([^"<]+)"?\s*</);
  const name = nameMatch ? nameMatch[1].trim() : 'Apna Intern';
  return { name, address: addr };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function jsonRes(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const BULK_BATCH_MAX = 15;

function bulkAnnouncementHtml(message) {
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 32px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800;">Apna Intern Announcement</h1>
      </div>
      <div style="padding: 40px 32px; color: #1e293b; line-height: 1.6;">
        <div style="font-size: 16px;">${String(message || '').replace(/\n/g, '<br/>')}</div>
      </div>
      <div style="background: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="margin: 0; font-size: 12px; color: #94a3b8;">Apna Intern — Empowering Future Careers</p>
      </div>
    </div>
  `;
}

function isSmtpRateLimitError(e) {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return m.includes('451') || m.includes('ratelimit') || m.includes('throttl') || m.includes('maximum sending rate');
}

async function sendBulkMails(transporter, recipients, subject, message) {
  const from = mailFrom();
  const sender = mailFromAddress();
  const html = bulkAnnouncementHtml(message);
  const mailSubject = String(subject || 'Update from Apna Intern').trim();

  let sent = 0;
  let failed = 0;
  let rateLimited = false;
  let lastError = '';

  const outcomes = await Promise.all(
    recipients.map(async (to) => {
      try {
        await transporter.sendMail({ from, sender, to, subject: mailSubject, html });
        return { ok: true };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
          rateLimited: isSmtpRateLimitError(e),
        };
      }
    })
  );

  for (const o of outcomes) {
    if (o.ok) sent++;
    else {
      failed++;
      lastError = o.error;
      if (o.rateLimited) rateLimited = true;
    }
  }

  return { sent, failed, rateLimited, lastError };
}

async function handleSendMail(req, res) {
  try {
    const body = await readJsonBody(req);
    const action = String(body.action || '').trim().toLowerCase();
    const to = String(body.to || body.email || '').trim();
    const otp = String(body.otp || '').trim();

    if ((action === 'login_otp' || action === 'send_otp') && (!to || otp.length < 6)) {
      return jsonRes(res, 400, { success: false, message: 'Missing recipient email or OTP' });
    }

    const transporter = smtpTransporter();
    const from = mailFrom();

    if (action === 'login_otp' || action === 'send_otp') {
      const isLogin = action === 'login_otp';
      await transporter.sendMail({
        from,
        sender: mailFromAddress(),
        to,
        subject: isLogin ? 'Your Login Verification Code' : 'Your Password Reset OTP',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px;">
            <div style="background-color: #0084FF; padding: 24px; text-align: center;">
              <h1 style="color: white; margin: 0;">${isLogin ? 'Login Verification' : 'Password Reset'}</h1>
            </div>
            <div style="padding: 32px; text-align: center;">
              <p>${isLogin ? 'Use this code to complete your login:' : 'Use this OTP to reset your password:'}</p>
              <p style="font-size: 36px; font-weight: 800; letter-spacing: 12px; color: #0084FF;">${otp}</p>
            </div>
          </div>
        `,
      });
      return jsonRes(res, 200, { success: true, message: 'Email sent successfully' });
    }

    if (action === 'bulk_custom_mail') {
      const subject = String(body.subject || 'Update from Apna Intern').trim();
      const msg = String(body.message || '').trim();
      if (!to || !to.includes('@')) {
        return jsonRes(res, 400, { success: false, message: 'Missing recipient email' });
      }
      if (!msg) {
        return jsonRes(res, 400, { success: false, message: 'Message is required' });
      }
      const result = await sendBulkMails(transporter, [to.toLowerCase()], subject, msg);
      if (result.rateLimited && result.sent === 0) {
        return jsonRes(res, 429, {
          success: false,
          sent: 0,
          failed: 1,
          rateLimited: true,
          message: 'SMTP rate limit. Wait and retry in smaller batches.',
          error: result.lastError,
        });
      }
      if (result.sent === 0) {
        return jsonRes(res, 500, {
          success: false,
          message: 'Failed to send email',
          error: result.lastError,
        });
      }
      return jsonRes(res, 200, { success: true, message: 'Email sent successfully!' });
    }

    if (action === 'bulk_custom_mail_batch') {
      const subject = String(body.subject || 'Update from Apna Intern').trim();
      const msg = String(body.message || '').trim();
      const list = (Array.isArray(body.recipients) ? body.recipients : [])
        .map((e) => String(e || '').trim().toLowerCase())
        .filter((e) => e.includes('@'));

      if (!msg) {
        return jsonRes(res, 400, { success: false, message: 'Message is required' });
      }
      if (!list.length) {
        return jsonRes(res, 400, { success: false, message: 'No valid recipient emails' });
      }
      if (list.length > BULK_BATCH_MAX) {
        return jsonRes(res, 400, {
          success: false,
          message: `Maximum ${BULK_BATCH_MAX} recipients per batch`,
        });
      }

      const result = await sendBulkMails(transporter, list, subject, msg);
      if (result.rateLimited && result.sent === 0) {
        return jsonRes(res, 429, {
          success: false,
          sent: result.sent,
          failed: result.failed,
          rateLimited: true,
          message: 'SMTP rate limit. Wait 1 hour, then send in smaller batches.',
          error: result.lastError,
        });
      }
      return jsonRes(res, 200, {
        success: true,
        sent: result.sent,
        failed: result.failed,
        rateLimited: result.rateLimited,
        message: result.rateLimited
          ? `Sent ${result.sent} before rate limit; pause before next batch.`
          : `Batch sent (${result.sent} ok${result.failed ? `, ${result.failed} failed` : ''}).`,
      });
    }

    return jsonRes(res, 400, {
      success: false,
      message: `Local dev server: unsupported action "${action}". Deploy to Vercel for full mail types.`,
    });
  } catch (err) {
    console.error('send-mail error:', err);
    const msg = err.message || String(err);
    const hint = msg.includes('501') || msg.includes('MAIL FROM')
      ? 'Check MAIL_FROM=admin@apnaintern.in in .env (must be SES-verified).'
      : msg.includes('535') || msg.includes('authentication')
        ? 'Check SMTP_USER/SMTP_PASS in .env (SES SMTP credentials).'
        : undefined;
    return jsonRes(res, 500, {
      success: false,
      message: 'Failed to send email',
      error: msg,
      hint,
    });
  }
}

async function handleGeminiGenerate(req, res) {
  try {
    const body = await readJsonBody(req);
    const prompt = String(body.prompt || '').trim();
    if (!prompt) {
      return jsonRes(res, 400, { success: false, error: 'Missing prompt' });
    }

    const apiKey = (
      process.env.GEMINI_API_KEY ||
      process.env.VITE_GEMINI_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      ''
    )
      .trim()
      .replace(/^["']|["']$/g, '');

    if (!apiKey) {
      return jsonRes(res, 500, {
        success: false,
        error: 'GEMINI_API_KEY missing in .env — add your Google AI Studio key and restart npm run dev',
      });
    }

    const models = [
      'gemini-2.5-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-2.5-flash',
      'gemini-flash-latest',
    ];

    let lastError = 'The service is currently unavailable.';

    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      try {
        const r = await fetchJSON(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
          }),
        });

        if (r.status >= 200 && r.status < 300) {
          const text = r.body?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (text) {
            return jsonRes(res, 200, { success: true, text, model });
          }
          lastError = 'Gemini returned no text';
          continue;
        }

        lastError = r.body?.error?.message || `Gemini error (${r.status})`;
        const quota = /quota|rate.?limit|resource exhausted|limit:\s*0/i.test(lastError);
        if (![404, 429, 500, 503].includes(r.status) && !quota) break;
      } catch (e) {
        lastError = e.message || String(e);
      }
    }

    return jsonRes(res, 503, {
      success: false,
      error: lastError,
      hint: 'Get a key at https://aistudio.google.com/app/apikey and set GEMINI_API_KEY in .env',
    });
  } catch (err) {
    console.error('gemini/generate error:', err);
    return jsonRes(res, 500, { success: false, error: err.message || String(err) });
  }
}

async function handleForgotPassword(req, res) {
  try {
    const body = await readJsonBody(req);
    const action = String(body.action || '').trim();
    const email = String(body.email || '').trim().toLowerCase();

    if (!action || !email) {
      return jsonRes(res, 400, { success: false, message: 'Missing action or email' });
    }

    if (action !== 'request_otp') {
      return jsonRes(res, 400, {
        success: false,
        message: `Local dev: only request_otp supported. Use production for ${action}.`,
      });
    }

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return jsonRes(res, 500, {
        success: false,
        message: 'Add SUPABASE_SERVICE_ROLE_KEY to .env for local forgot-password OTP',
      });
    }

    const generatedOtp = String(Math.floor(100000 + Math.random() * 900000));
    const insertRes = await supabaseRequest('/password_resets', 'POST', {
      email,
      otp: generatedOtp,
    });
    if (insertRes.status >= 400) {
      return jsonRes(res, 500, {
        success: false,
        message: `Failed to generate OTP: ${JSON.stringify(insertRes.body)}`,
      });
    }

    const transporter = smtpTransporter();
    await transporter.sendMail({
      from: mailFrom(),
      sender: mailFromAddress(),
      to: email,
      subject: 'Your Password Reset OTP',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px;">
          <div style="background-color: #0084FF; padding: 24px; text-align: center;">
            <h1 style="color: white; margin: 0;">Password Reset</h1>
          </div>
          <div style="padding: 24px; text-align: center;">
            <p>Use this OTP to reset your password:</p>
            <p style="font-size: 32px; letter-spacing: 8px; font-weight: 800; color: #0084FF;">${generatedOtp}</p>
          </div>
        </div>
      `,
    });

    return jsonRes(res, 200, { success: true, message: 'OTP sent successfully' });
  } catch (err) {
    console.error('forgot-password error:', err);
    return jsonRes(res, 500, { success: false, message: err.message || String(err) });
  }
}

const RZP_KEY_ID     = process.env.RAZORPAY_KEY_ID     || '';
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const SUPABASE_URL   = process.env.SUPABASE_URL         || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function razorpayAuth() {
  return 'Basic ' + Buffer.from(`${RZP_KEY_ID}:${RZP_KEY_SECRET}`).toString('base64');
}

async function fetchJSON(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: opts.method || 'GET',
      headers: opts.headers || {},
    };
    const req = lib.request(reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let body = {};
        try {
          body = JSON.parse(data || '{}');
        } catch {
          body = { raw: data };
        }
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function supabaseRequest(path, method = 'GET', body = null, useServiceKey = false) {
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' ? 'return=representation' : undefined,
  };
  Object.keys(headers).forEach(k => headers[k] === undefined && delete headers[k]);
  
  return fetchJSON(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = req.url || '';

  if (url === '/api/health' && req.method === 'GET') {
    return jsonRes(res, 200, {
      ok: true,
      smtp: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS),
      host: process.env.SMTP_HOST || 'email-smtp.ap-south-1.amazonaws.com',
    });
  }

  if (url.startsWith('/api/send-mail') && req.method === 'POST') {
    handleSendMail(req, res);
    return;
  }

  if (url.startsWith('/api/auth/forgot-password') && req.method === 'POST') {
    handleForgotPassword(req, res);
    return;
  }

  if (url.startsWith('/api/gemini/generate') && req.method === 'POST') {
    handleGeminiGenerate(req, res);
    return;
  }

  if (url.startsWith('/api/gemini-generate') && req.method === 'POST') {
    handleGeminiGenerate(req, res);
    return;
  }

  if (url.startsWith('/api/razorpay-recovery') && req.method === 'POST') {
    let rawBody = '';
    req.on('data', chunk => rawBody += chunk);
    req.on('end', async () => {
      try {
        if (!RZP_KEY_ID || !RZP_KEY_SECRET || RZP_KEY_ID.includes('XXXXX')) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Razorpay credentials missing. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to your .env file.' }));
          return;
        }

        const { action, query, paymentDetails, password } = JSON.parse(rawBody || '{}');

        if (action === 'fetch_razorpay_payment') {
          let matchedPayment = null;

          if (String(query).startsWith('pay_')) {
            const rzp = await fetchJSON(`https://api.razorpay.com/v1/payments/${query}`, {
              headers: { Authorization: razorpayAuth() }
            });
            if (rzp.status === 200) matchedPayment = rzp.body;
            else {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: rzp.body?.error?.description || 'Payment ID not found' }));
              return;
            }
          } else {
            const rzp = await fetchJSON('https://api.razorpay.com/v1/payments?count=100', {
              headers: { Authorization: razorpayAuth() }
            });
            if (rzp.status !== 200) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: rzp.body?.error?.description || 'Razorpay API error' }));
              return;
            }
            const items = rzp.body.items || [];
            matchedPayment = items.find(p => p.email && p.email.toLowerCase() === String(query).toLowerCase());
            if (!matchedPayment) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'No payment found for this email in last 100 transactions. Try Payment ID (pay_...) instead.' }));
              return;
            }
          }

          // Check if student exists
          let isRegistered = false;
          if (SUPABASE_URL && SUPABASE_KEY && matchedPayment?.email) {
            const checkRes = await supabaseRequest(`/students?select=id&email=eq.${encodeURIComponent(matchedPayment.email.toLowerCase())}&limit=1`);
            isRegistered = Array.isArray(checkRes.body) && checkRes.body.length > 0;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, payment: matchedPayment, isRegistered }));
          return;
        }

        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: `Unknown action: ${action}` }));

      } catch (err) {
        console.error('Local API Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 404 for unhandled routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`\n✅ Local API server running on http://localhost:${PORT}`);
  console.log(`   Handles: POST /api/send-mail, /api/gemini-generate, /api/auth/forgot-password, /api/razorpay-recovery`);
  if (process.env.SMTP_HOST) {
    console.log(`   SMTP: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}`);
  } else {
    console.log(`\n⚠️  WARNING: SMTP_* not set in .env — OTP emails will fail`);
  }
  if (!RZP_KEY_ID || RZP_KEY_ID.includes('XXXXX')) {
    console.log(`\n⚠️  WARNING: RAZORPAY_KEY_ID not set in .env — Razorpay fetch won't work!`);
  } else {
    console.log(`   Razorpay Key: ${RZP_KEY_ID.substring(0, 12)}...`);
  }
});
