import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";
import {
  connectSmtpClient,
  getSmtpCredentials,
  resolveMailFrom,
  resolveSmtpHost,
} from "../_shared/smtpConfig.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

import {
  BRAND_NOREPLY_EMAIL,
  BRAND_WEBSITE_URL,
} from "../_shared/brand.ts";

const SMTP_USER = Deno.env.get("SMTP_USER") ?? BRAND_NOREPLY_EMAIL;
const PUBLIC_SITE_ORIGIN = (
  Deno.env.get("PUBLIC_SITE_URL") ??
  Deno.env.get("VITE_PUBLIC_SITE_ORIGIN") ??
  BRAND_WEBSITE_URL
).replace(/\/$/, "");
const DEFAULT_STUDENT_LOGIN = `${PUBLIC_SITE_ORIGIN}/login?portal=student`;

function registrationTemplate(data: any): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f0f4f8; margin: 0; padding: 20px; }
  .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .header { background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 40px 32px; text-align: center; }
  .header img { height: 48px; margin-bottom: 16px; }
  .header h1 { color: white; font-size: 24px; margin: 0; font-weight: 700; }
  .header p { color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px; }
  .body { padding: 32px; }
  .badge { display: inline-block; background: #EEF2FF; color: #4F46E5; font-size: 12px; font-weight: 700; padding: 6px 16px; border-radius: 100px; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 20px; }
  .greeting { font-size: 20px; font-weight: 700; color: #1e293b; margin-bottom: 8px; }
  .text { font-size: 15px; color: #475569; line-height: 1.6; margin-bottom: 24px; }
  .details-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin-bottom: 24px; }
  .details-box h3 { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin: 0 0 16px; }
  .detail-row { display: flex; justify-content: space-between; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid #e2e8f0; }
  .detail-row:last-child { border-bottom: none; padding-bottom: 0; }
  .detail-label { font-size: 13px; color: #64748b; font-weight: 500; }
  .detail-value { font-size: 13px; color: #1e293b; font-weight: 700; text-align: right; max-width: 60%; }
  .reg-id { background: #4F46E5; color: white; font-size: 18px; font-weight: 900; text-align: center; padding: 16px; border-radius: 10px; letter-spacing: 0.1em; margin-bottom: 24px; }
  .cta-btn { display: block; background: linear-gradient(135deg, #4F46E5, #7C3AED); color: white; text-align: center; padding: 16px 32px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 16px; margin-bottom: 24px; }
  .footer { background: #f8fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #e2e8f0; }
  .footer p { font-size: 12px; color: #94a3b8; margin: 4px 0; }
  .footer strong { color: #64748b; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>Welcome to Apna Intern</h1>
    <p>Your internship programme portal.</p>
  </div>
  <div class="body">
    <div class="badge">Registration confirmed</div>
    <div class="greeting">Hello, ${data.fullName}!</div>
    <p class="text">Congratulations on successfully registering for the Apna Intern programme. Your application has been received and your student portal is ready to access.</p>
    
    <div class="reg-id">Your Registration ID: ${data.registrationId}</div>
    
    <div class="details-box">
      <h3>Your registration details</h3>
      <div class="detail-row"><span class="detail-label">Full Name</span><span class="detail-value">${data.fullName}</span></div>
      <div class="detail-row"><span class="detail-label">Email Address</span><span class="detail-value">${data.email}</span></div>
      <div class="detail-row"><span class="detail-label">Contact Number</span><span class="detail-value">${data.contact}</span></div>
      <div class="detail-row"><span class="detail-label">University</span><span class="detail-value">${data.university}</span></div>
      <div class="detail-row"><span class="detail-label">College</span><span class="detail-value">${data.college}</span></div>
      <div class="detail-row"><span class="detail-label">Degree / Department</span><span class="detail-value">${data.degree} - ${data.department}</span></div>
      <div class="detail-row"><span class="detail-label">Internship Domain</span><span class="detail-value">${data.course}</span></div>
      <div class="detail-row"><span class="detail-label">Academic Session</span><span class="detail-value">${data.session}</span></div>
      <div class="detail-row"><span class="detail-label">Semester</span><span class="detail-value">${data.semester}</span></div>
    </div>

    <p class="text">You can now log in to your student portal to view your offer letter, track your internship progress, and access learning resources.</p>
    
    <a href="${data.loginLink || DEFAULT_STUDENT_LOGIN}" class="cta-btn">Sign in to student portal</a>
    
    <p class="text" style="font-size:13px;">If you have any questions, feel free to reach out to us. Keep this email safe — your Registration ID is required for all official communications.</p>
  </div>
  <div class="footer">
    <p><strong>Apna Intern</strong> — Official Internship Programme</p>
    <p>www.apnaintern.in | noreply@apnaintern.in</p>
    <p style="margin-top:8px;font-size:11px;">This is an automated email. Please do not reply to this address.</p>
  </div>
</div>
</body>
</html>
  `;
}

function certificateTemplate(data: any): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f0f4f8; margin: 0; padding: 20px; }
  .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .header { background: linear-gradient(135deg, #059669 0%, #0EA5E9 100%); padding: 40px 32px; text-align: center; }
  .header h1 { color: white; font-size: 24px; margin: 0; font-weight: 700; }
  .header p { color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px; }
  .body { padding: 32px; }
  .badge { display: inline-block; background: #ECFDF5; color: #059669; font-size: 12px; font-weight: 700; padding: 6px 16px; border-radius: 100px; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 20px; }
  .greeting { font-size: 20px; font-weight: 700; color: #1e293b; margin-bottom: 8px; }
  .text { font-size: 15px; color: #475569; line-height: 1.6; margin-bottom: 24px; }
  .cert-id { background: linear-gradient(135deg, #059669, #0EA5E9); color: white; font-size: 16px; font-weight: 900; text-align: center; padding: 16px; border-radius: 10px; letter-spacing: 0.1em; margin-bottom: 24px; }
  .details-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 24px; margin-bottom: 24px; }
  .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #d1fae5; }
  .detail-row:last-child { border-bottom: none; }
  .detail-label { font-size: 13px; color: #6b7280; font-weight: 500; }
  .detail-value { font-size: 13px; color: #065f46; font-weight: 700; }
  .cta-btn { display: block; background: linear-gradient(135deg, #059669, #0EA5E9); color: white; text-align: center; padding: 16px 32px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 16px; margin-bottom: 24px; }
  .footer { background: #f8fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #e2e8f0; }
  .footer p { font-size: 12px; color: #94a3b8; margin: 4px 0; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>Certificate ready</h1>
    <p>Your internship completion certificate is available.</p>
  </div>
  <div class="body">
    <div class="badge">Internship completed</div>
    <div class="greeting">Dear ${data.studentName},</div>
    <p class="text">We are delighted to inform you that your <strong>Internship Certificate of Completion</strong> has been officially generated and is now available for download in your student portal.</p>
    
    <div class="cert-id">Certificate ID: ${data.certificateId}</div>
    
    <div class="details-box">
      <div class="detail-row"><span class="detail-label">Student Name</span><span class="detail-value">${data.studentName}</span></div>
      <div class="detail-row"><span class="detail-label">Programme</span><span class="detail-value">${data.programme}</span></div>
      <div class="detail-row"><span class="detail-label">Certificate ID</span><span class="detail-value">${data.certificateId}</span></div>
      <div class="detail-row"><span class="detail-label">Issue Date</span><span class="detail-value">${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</span></div>
    </div>

    <a href="${PUBLIC_SITE_ORIGIN}/dashboard" class="cta-btn">Download certificate</a>
    
    <p class="text">You can also verify your certificate anytime at <strong>www.apnaintern.in/verify</strong> using your Certificate ID.</p>
  </div>
  <div class="footer">
    <p><strong>Apna Intern</strong> — Official Internship Programme</p>
    <p>This is an automated notification. Do not reply.</p>
  </div>
</div>
</body>
</html>
  `;
}

function otpTemplate(otp: string, type: string): string {
  const isLogin = type === 'login_otp';
  return `
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
        <p style="font-size: 14px; color: #64748b;">This code will expire in 15 minutes. If you did not request this, please ignore this email.</p>
      </div>
      <div style="background-color: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #94a3b8;">
        © 2026 Apna Intern. All rights reserved.
      </div>
    </div>
  `;
}

function contactTemplate(name: string, email: string, message: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px;">
      <h2 style="color: #1e293b; border-bottom: 2px solid #0084FF; padding-bottom: 12px;">New Contact Message</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin-top: 20px;">
        <p><strong>Message:</strong></p>
        <p style="white-space: pre-wrap;">${message}</p>
      </div>
    </div>
  `;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { 
      status: 204, 
      headers: corsHeaders 
    });
  }

  try {
    const { type, to, data } = await req.json();

    if (!type) {
      return new Response(JSON.stringify({ error: "Missing 'type'" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    let subject = "";
    let htmlContent = "";
    let recipient = to;

    if (type === "registration_confirmation") {
      subject = `Apna Intern — Registration confirmed (${data.registrationId})`;
      htmlContent = registrationTemplate(data);
    } else if (type === "certificate_generated") {
      subject = `Apna Intern — Certificate ready (${data.certificateId})`;
      htmlContent = certificateTemplate(data);
    } else if (type === "password_reset_otp" || type === "send_otp" || type === "login_otp") {
      subject = type === "login_otp" ? "Your Login Verification Code" : "Your Password Reset OTP";
      htmlContent = otpTemplate(data.otp, type);
    } else if (type === "contact_form") {
      subject = `New Contact Request from ${data.name}`;
      htmlContent = contactTemplate(data.name, data.email, data.message);
      recipient = BRAND_NOREPLY_EMAIL; // Contact form goes to admin
    } else if (type === "test_diagnostic") {
      subject = `Diagnostic Test: ${data.subject || 'No Subject'}`;
      htmlContent = `
        <div style="font-family: sans-serif; padding: 20px; border: 2px solid #4F46E5; border-radius: 12px;">
          <h2 style="color: #4F46E5;">Apna Intern SMTP diagnostic</h2>
          <p>This is a manual test email triggered from the Super Admin Panel.</p>
          <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4F46E5;">
            <p><strong>Test Message:</strong></p>
            <p style="white-space: pre-wrap;">${data.message || 'No message content provided.'}</p>
          </div>
          <p style="font-size: 12px; color: #94a3b8;">Timestamp: ${new Date().toISOString()}</p>
          <p style="font-size: 12px; color: #94a3b8;">Host: ${resolveSmtpHost()}</p>
        </div>
      `;
    } else {
      return new Response(JSON.stringify({ error: "Unknown email type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!recipient && type !== "contact_form") {
      return new Response(JSON.stringify({ error: "Missing 'to' recipient" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { pass: SMTP_PASS } = getSmtpCredentials();
    if (!SMTP_PASS) {
      return new Response(JSON.stringify({ error: "SMTP credentials missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const mailFrom = resolveMailFrom();
    const client = new SmtpClient();
    await connectSmtpClient(client);

    await client.send({
      from: mailFrom,
      to: recipient,
      subject: subject,
      html: htmlContent,
    });

    // For contact form, also send confirmation to user
    if (type === "contact_form") {
      await client.send({
        from: mailFrom,
        to: data.email,
        subject: "We received your message!",
        html: `<h3>Hi ${data.name},</h3><p>We've received your message and will get back to you soon.</p>`,
      });
    }

    await client.close();

    console.log(`Email sent [${type}] to: ${recipient}`);
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("Email send error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
