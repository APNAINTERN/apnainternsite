// Test email — run: node test-email.cjs you@example.com
// Uses SMTP_* and MAIL_FROM from environment (see .env.example).

const nodemailer = require('nodemailer');

async function sendTestEmail() {
  const to = process.argv[2] || process.env.TEST_MAIL_TO;
  if (!to) {
    console.error('Usage: node test-email.cjs you@example.com');
    process.exit(1);
  }

  const host = process.env.SMTP_HOST || 'email-smtp.ap-south-1.amazonaws.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from =
    process.env.MAIL_FROM ||
    `"Apna Intern" <${process.env.MAIL_FROM_ADDRESS || 'admin@apnaintern.in'}>`;

  if (!user || !pass) {
    console.error('SMTP_USER and SMTP_PASS must be set');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: 'Apna Intern Email Test — SES SMTP',
      html: `<p>Test email from Apna Intern via Amazon SES.</p><p>Time: ${new Date().toISOString()}</p>`,
    });

    console.log('Test email sent:', info.messageId);
    console.log('Delivered to:', to);
  } catch (error) {
    console.error('Email failed:', error.message);
    process.exit(1);
  }
}

sendTestEmail();
