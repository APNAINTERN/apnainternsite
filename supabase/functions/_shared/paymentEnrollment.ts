import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { type RazorpayCreds, ensurePaymentCaptured } from './razorpay.ts';
import { assertStudentRegistrationAvailableServer } from './registrationAvailability.ts';
import {
  bumpRegistrationId,
  nextRegistrationIdFromRows,
} from './registrationId.ts';

export type PaymentOrderRow = {
  order_id: string;
  amount: number;
  status: string;
  payment_id?: string | null;
  metadata?: Record<string, unknown> | null;
  user_email?: string | null;
  user_id?: string | null;
};

export async function fulfillPaidOrder(
  supabase: SupabaseClient,
  existingOrder: PaymentOrderRow,
  paymentId: string,
  options?: { razorpay?: RazorpayCreds | null; skipCapture?: boolean }
): Promise<{ userId?: string; alreadyComplete: boolean }> {
  const metadata = (existingOrder.metadata || {}) as Record<string, unknown>;
  const normalizedEmail = String(metadata.email || existingOrder.user_email || '')
    .trim()
    .toLowerCase();
  const password = String(metadata.password || '').trim();

  if (!normalizedEmail || !password) {
    throw new Error('Order metadata missing email/password');
  }

  const orderAmountPaise = Number(existingOrder.amount);
  if (!Number.isFinite(orderAmountPaise) || orderAmountPaise <= 0) {
    throw new Error('Invalid order amount');
  }

  const { data: existingStudentByEmail } = await supabase
    .from('students')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (existingOrder.status === 'success' && existingStudentByEmail?.id) {
    return { userId: existingStudentByEmail.id, alreadyComplete: true };
  }

  const contactForCheck = String(
    metadata.contact_number || metadata.contact || ''
  ).trim();
  if (!existingStudentByEmail?.id && contactForCheck) {
    await assertStudentRegistrationAvailableServer(
      supabase,
      normalizedEmail,
      contactForCheck
    );
  }

  if (options?.razorpay && !options.skipCapture) {
    await ensurePaymentCaptured(options.razorpay, paymentId, orderAmountPaise);
  }

  if (existingOrder.status !== 'success') {
    await supabase
      .from('payment_orders')
      .update({
        status: 'success',
        payment_id: paymentId,
        updated_at: new Date().toISOString(),
      })
      .eq('order_id', existingOrder.order_id);
  }

  let userId: string | undefined = existingStudentByEmail?.id;

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: String(metadata.fullName || metadata.full_name || '') },
  });

  if (authError) {
    if (
      authError.message.includes('already registered') ||
      authError.code === 'user_already_exists'
    ) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', normalizedEmail)
        .maybeSingle();
      userId = prof?.id;
    } else {
      throw authError;
    }
  } else {
    userId = authData?.user?.id;
  }

  if (!userId) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();
    userId = prof?.id;
  }

  if (!userId) {
    throw new Error('Could not resolve user id after payment');
  }

  const { data: existingStudent } = await supabase
    .from('students')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (!existingStudent) {
    const { data: recentStudents } = await supabase
      .from('students')
      .select('registration_id')
      .not('registration_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50);

    const currentYear = new Date().getFullYear();
    let currentRegId = nextRegistrationIdFromRows(recentStudents ?? [], currentYear);

    const metaCopy = { ...metadata };
    const plainPw = String(metaCopy.password || password || '').trim();

    let validatedReferral: string | null = null;
    const rawRef = metadata.referral_code
      ? String(metadata.referral_code).trim().toLowerCase()
      : '';
    if (rawRef) {
      const uniName = String(metadata.university_name || metadata.university || '').trim() || null;
      const collegeName = String(metadata.college_name || metadata.college || '').trim() || null;
      const { data: attributed, error: attrErr } = await supabase.rpc('resolve_referral_attribution', {
        p_code: rawRef,
        p_university_name: uniName,
        p_college_name: collegeName,
      });
      if (!attrErr && typeof attributed === 'string' && attributed.length > 0) {
        validatedReferral = attributed;
      } else if (attrErr && /resolve_referral_attribution|does not exist|42883/i.test(attrErr.message || '')) {
        const { data: validated, error: valErr } = await supabase.rpc('validate_referral_code', {
          p_code: rawRef,
        });
        if (!valErr && typeof validated === 'string' && validated.length > 0) {
          validatedReferral = validated;
        } else {
          const { data: rp } = await supabase
            .from('referral_partners')
            .select('referral_code')
            .ilike('referral_code', rawRef)
            .eq('active', true)
            .maybeSingle();
          validatedReferral = rp?.referral_code ?? null;
        }
      } else {
        validatedReferral = null;
      }
    }

    const studentData: Record<string, unknown> = {
      id: userId,
      email: normalizedEmail,
      full_name: metadata.fullName || metadata.full_name,
      gender: metadata.gender,
      parent_name: metadata.parentName,
      contact_number: metadata.contact_number || metadata.contact,
      university_name: metadata.university_name || metadata.university,
      college_name: metadata.college_name || metadata.college,
      course: metadata.course,
      internship_domain: metadata.course,
      degree: metadata.degree,
      department: metadata.department,
      class_semester: metadata.classSem || metadata.semester,
      academic_session: metadata.session,
      roll_number: metadata.rollNo,
      emergency_name: metadata.emName,
      emergency_contact: metadata.emPhone,
      emergency_relation: metadata.emRel,
      status: 'Active',
      cybercafe_shop_name: metadata.cybercafe_shop_name,
      cybercafe_email: metadata.cybercafe_email,
      referral_code: validatedReferral,
      metadata: {
        ...metaCopy,
        subject: metadata.subject,
        internship_mode: metadata.internship_mode,
        ...(plainPw ? { password: plainPw } : {}),
      },
    };

    let studentError: unknown = null;
    let retryCount = 0;

    while (retryCount < 5) {
      studentData.registration_id = currentRegId;
      const { error } = await supabase.from('students').insert(studentData);
      if (error) {
        if (error.code === '23505' && error.message.includes('registration_id')) {
          currentRegId = bumpRegistrationId(currentRegId);
          retryCount++;
          continue;
        }
        studentError = error;
      }
      break;
    }

    if (studentError) {
      console.error('fulfillPaidOrder — student insert:', studentError);
    }

    await supabase.from('profiles').upsert({
      id: userId,
      full_name: metadata.fullName || metadata.full_name,
      email: normalizedEmail,
      contact_number: metadata.contact_number || metadata.contact,
    });

    try {
      const collegeIdForClaim = metadata.college_id || metadata.collegeId;
      if (collegeIdForClaim) {
        await supabase.rpc('claim_college_roster_row', {
          p_college_id: collegeIdForClaim,
          p_user_id: userId,
          p_email: normalizedEmail,
          p_phone: metadata.contact_number || metadata.contact || '',
        });
      }
    } catch (rosterErr) {
      console.warn('claim_college_roster_row failed:', rosterErr);
    }

    try {
      const refNo = metadata.reference_number || metadata.referenceNumber;
      if (refNo) {
        await supabase.rpc('claim_prefilled_student', {
          p_reference_number: refNo,
          p_user_id: userId,
        });
      }
    } catch (prefilledErr) {
      console.warn('claim_prefilled_student failed:', prefilledErr);
    }
  }

  const { data: payLog } = await supabase
    .from('payment_success')
    .select('id')
    .eq('payment_id', paymentId)
    .maybeSingle();

  if (!payLog) {
    await supabase.from('payment_success').insert({
      user_id: userId,
      payment_id: paymentId,
      amount_paise: existingOrder.amount,
      email: normalizedEmail,
      full_name: metadata.fullName || metadata.full_name,
      college_name: metadata.college_name || metadata.college,
      status: 'success',
    });
  }

  return { userId, alreadyComplete: false };
}

export function getServiceSupabase() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase Edge Function env not configured');
  }
  return { supabaseUrl, supabaseServiceKey };
}
