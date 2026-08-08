/** Amazon SES SMTP (ap-south-1) — shared by Vercel mail API routes. */

export type MailFrom = { name: string; address: string };

export function resolveSmtpHost(): string {
  return (
    process.env.SMTP_HOST ||
    process.env.SES_SMTP_HOST ||
    'email-smtp.ap-south-1.amazonaws.com'
  );
}

export function resolveSmtpPort(): number {
  const raw = process.env.SMTP_PORT || '587';
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 587;
}

/** Verified SES envelope sender — must match a verified identity in SES. */
export function resolveMailFromAddress(): string {
  const explicit = (process.env.MAIL_FROM || process.env.SMTP_FROM || '').trim();
  const angle = explicit.match(/<([^>]+)>/);
  if (angle) return angle[1].trim();
  if (explicit.includes('@')) return explicit;
  return process.env.MAIL_FROM_ADDRESS || 'admin@apnaintern.in';
}

/** Nodemailer `from` object — SES rejects some string-only formats (501). */
export function resolveMailFrom(label = 'Apna Intern'): MailFrom {
  const address = resolveMailFromAddress();
  const explicit = (process.env.MAIL_FROM || '').trim();
  const nameMatch = explicit.match(/^"?([^"<]+)"?\s*</);
  const name = nameMatch ? nameMatch[1].trim() : label;
  return { name, address };
}

export function sesMailHeaders(label = 'Apna Intern'): { from: MailFrom; sender: string } {
  const from = resolveMailFrom(label);
  return { from, sender: from.address };
}

export function getSmtpCredentials(): { user: string; pass: string } {
  return {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  };
}

export async function createSmtpTransporter() {
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
