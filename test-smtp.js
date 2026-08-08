import nodemailer from 'nodemailer';

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_HOST = process.env.SMTP_HOST || 'email-smtp.ap-south-1.amazonaws.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const MAIL_FROM =
  process.env.MAIL_FROM ||
  `"Apna Intern Test" <${process.env.MAIL_FROM_ADDRESS || 'admin@apnaintern.in'}>`;

console.log('SMTP host:', SMTP_HOST, 'port:', SMTP_PORT);
console.log('SMTP user:', SMTP_USER ? `${SMTP_USER.slice(0, 6)}…` : '(missing)');

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

const sendTestMail = async () => {
  const to = process.argv[2] || process.env.TEST_MAIL_TO;
  if (!to) {
    console.error('Usage: TEST_MAIL_TO=you@example.com node test-smtp.js');
    process.exit(1);
  }
  try {
    const info = await transporter.sendMail({
      from: MAIL_FROM,
      to,
      subject: 'Apna Intern SES SMTP test',
      html: '<p>Hello!</p><p>This is a test email from the Apna Intern SES SMTP setup.</p>',
    });
    console.log('Email sent successfully:', info.messageId);
  } catch (error) {
    console.error('Error sending test email:', error);
    process.exit(1);
  }
};

sendTestMail();
