import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { assertStudentRegistrationAvailableServer } from './lib/registrationAvailability';
import { createStudentAuthWithChosenPassword } from './lib/registrationPassword';
import { createSmtpTransporter, getSmtpCredentials, sesMailHeaders } from './lib/smtpTransport';
import { getServerDb } from './lib/getServerDb';
import {
  bumpRegistrationId,
  nextRegistrationIdFromRows,
} from './lib/registrationId';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Setup
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { admin_id, student_data, payment_amount, transaction_id } = req.body;

  if (!admin_id || !student_data || !student_data.email) {
    return res.status(400).json({ success: false, message: 'Missing required details' });
  }

  let db;
  try {
    db = getServerDb();
  } catch (cfgErr: unknown) {
    const msg = cfgErr instanceof Error ? cfgErr.message : String(cfgErr);
    return res.status(503).json({ success: false, message: msg });
  }

  const normalizedEmail = String(student_data?.email || '').trim().toLowerCase();

  try {
    // 1. Verify Admin (Ensure the requester is actually an admin/super_admin)
    const { data: adminRoles, error: roleError } = await db
      .from('user_roles')
      .select('role')
      .eq('user_id', admin_id);
    
    if (roleError || !adminRoles || adminRoles.length === 0) {
      return res.status(403).json({ success: false, message: 'Unauthorized. Admin privileges required.' });
    }

    const hasAdminRole = adminRoles.some(r => r.role === 'admin' || r.role === 'super_admin');
    if (!hasAdminRole) {
      return res.status(403).json({ success: false, message: 'Unauthorized. Admin privileges required.' });
    }

    const regPhone = String(student_data?.contact_number || student_data?.contact || '').trim();
    try {
      await assertStudentRegistrationAvailableServer(db, normalizedEmail, regPhone);
    } catch (availErr: unknown) {
      const msg =
        availErr instanceof Error ? availErr.message : 'Email or mobile already registered.';
      return res.status(400).json({ success: false, message: msg });
    }

    const passwordToUse =
      String(student_data.password || '').trim() || crypto.randomBytes(4).toString('hex');

    console.log(`Creating user for ${student_data.email}...`);
    let userId: string;
    try {
      const authResult = await createStudentAuthWithChosenPassword(db, {
        email: normalizedEmail,
        password: passwordToUse,
        fullName: student_data.full_name,
      });
      userId = authResult.userId;
    } catch (authErr: unknown) {
      console.error('Auth Error:', authErr);
      const msg = authErr instanceof Error ? authErr.message : 'Auth user creation failed';
      return res.status(500).json({ success: false, message: msg });
    }

    // 3. Check if student already exists
    const { data: existingStudent } = await db.from('students').select('id').eq('id', userId).maybeSingle();

    if (existingStudent) {
       return res.status(400).json({ success: false, message: 'Student is already registered' });
    }

    // 4. Determine Registration ID (Sequential)
    const { data: latestStudents } = await db
      .from("students")
      .select("registration_id")
      .not("registration_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);

    const currentYear = new Date().getFullYear();
    let regId = nextRegistrationIdFromRows(latestStudents ?? [], currentYear);

    // 5. Insert Student Record
    const insertPayload: any = {
      id: userId,
      email: normalizedEmail,
      full_name: student_data.full_name,
      gender: student_data.gender,
      parent_name: student_data.parent_name,
      contact_number: student_data.contact_number,
      university_name: student_data.university_name,
      college_name: student_data.college_name,
      course: student_data.course || student_data.internship_domain,
      internship_domain: student_data.internship_domain || student_data.course,
      degree: student_data.degree,
      department: student_data.department,
      class_semester: student_data.class_semester,
      academic_session: student_data.academic_session,
      roll_number: student_data.roll_number,
      emergency_name: student_data.emergency_name,
      emergency_contact: student_data.emergency_contact,
      emergency_relation: student_data.emergency_relation,
      status: 'Active',
      metadata: {
        ...(typeof student_data.metadata === 'object' && student_data.metadata ? student_data.metadata : {}),
        source: 'admin_manual_registration',
        subject: student_data.subject,
        fullName: student_data.full_name,
        parentName: student_data.parent_name,
        gender: student_data.gender,
        contact: student_data.contact_number,
        university: student_data.university_name,
        college: student_data.college_name,
        degree: student_data.degree,
        department: student_data.department,
        session: student_data.academic_session,
        semester: student_data.class_semester,
        rollNo: student_data.roll_number,
        course: student_data.course || student_data.internship_domain,
        password: passwordToUse,
      },
    };

    let retryCount = 0;
    while (retryCount < 10) {
      insertPayload.registration_id = regId;
      const { error: insertError } = await db.from("students").insert(insertPayload);
      if (insertError) {
        if (insertError.code === '23505' && insertError.message.includes('registration_id')) {
          regId = bumpRegistrationId(regId);
          retryCount++;
          continue;
        }
        throw insertError;
      }
      break;
    }

    // 6. Create Profile
    await db.from("profiles").upsert({ 
      id: userId, 
      full_name: student_data.full_name, 
      email: normalizedEmail,
      contact_number: student_data.contact_number,
      gender: student_data.gender,
      parent_name: student_data.parent_name
    });

    // 7. Log Payment Success (Custom Amount)
    const mockPaymentId = transaction_id || `pay_admin_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
    const amountPaise = (parseFloat(payment_amount) || 0) * 100;
    
    await db.from("payment_success").insert({
      user_id: userId,
      payment_id: mockPaymentId,
      amount_paise: amountPaise,
      email: normalizedEmail,
      full_name: student_data.full_name,
      college_name: student_data.college_name,
      status: 'success'
    });
    
    // 8. Send Email (Directly using nodemailer to avoid brittle internal fetch)
    try {
      const { user: SMTP_USER, pass: SMTP_PASS } = getSmtpCredentials();
      if (!SMTP_USER || !SMTP_PASS) {
        throw new Error("SMTP credentials missing");
      }

      const transporter = await createSmtpTransporter();
      const mailOptions = {
        ...sesMailHeaders(),
        to: normalizedEmail,
        subject: `Apna Intern — Account created (${regId})`,
        html: `
          <div style="font-family: Georgia, 'Times New Roman', serif; padding: 32px; border: 1px solid #e2e8f0; border-radius: 4px; max-width: 600px; margin: 0 auto; color: #1e293b;">
            <div style="border-bottom: 1px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 24px;">
              <p style="margin: 0; font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; color: #64748b;">Apna Intern</p>
              <h1 style="color: #1e293b; margin: 12px 0 0; font-size: 22px; font-weight: 600;">Your account is ready</h1>
              <p style="margin: 10px 0 0; color: #64748b; font-size: 15px; font-family: system-ui, sans-serif;">
                An administrator has created your internship portal account.
              </p>
            </div>
            <p style="font-size: 15px; line-height: 1.6;">Dear ${student_data.full_name},</p>
            <p style="font-size: 15px; line-height: 1.6; font-family: system-ui, sans-serif;">
              Use the following credentials to sign in. Please keep them confidential.
            </p>
            <div style="background: #f8fafc; padding: 22px 24px; border-radius: 4px; margin: 24px 0; border: 1px solid #e2e8f0; font-family: system-ui, sans-serif;">
              <p style="margin: 0 0 14px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #475569; font-weight: 600;">Login details</p>
              <p style="margin: 8px 0; font-size: 14px;"><strong>Email (sign-in ID):</strong> ${normalizedEmail}</p>
              <p style="margin: 8px 0; font-size: 14px;"><strong>Registration ID:</strong> ${regId}</p>
              <p style="margin: 8px 0; font-size: 14px;"><strong>Password:</strong> ${passwordToUse}</p>
            </div>
            <div style="text-align: center; margin: 28px 0;">
              <a href="https://www.ezyintern.in/login?portal=student" style="display:inline-block; padding: 14px 28px; background: #4F46E5; color: #ffffff; text-decoration: none; border-radius: 4px; font-weight: 600; font-size: 14px; font-family: system-ui, sans-serif;">Sign in to dashboard</a>
            </div>
            <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 32px; font-family: system-ui, sans-serif;">
              © 2026 Apna Intern. All rights reserved.
            </p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log("Welcome email sent successfully.");
    } catch (mailErr) {
      console.error("Failed to send welcome email:", mailErr);
    }

    return res.status(200).json({ success: true, message: 'Student registered successfully' });

  } catch (error: any) {
    console.error("Admin Registration Error:", error);
    return res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
}
