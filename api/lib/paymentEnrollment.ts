import type { ServerDbLike } from './rdsAdapter';
import Razorpay from 'razorpay';
import { assertStudentRegistrationAvailableServer } from './registrationAvailability';
import {
  applyStudentRegistrationPassword,
  createStudentAuthWithChosenPassword,
} from './registrationPassword';
import { ensurePaymentSuccessLog } from './recordPaymentSuccess';

export type PaymentOrderRow = {
  order_id: string;
  amount: number;
  status: string;
  payment_id?: string | null;
  metadata?: Record<string, unknown> | null;
  user_email?: string | null;
};

/** Capture an authorised payment; no-op if already captured. */
export async function ensurePaymentCaptured(
  razorpay: Razorpay,
  paymentId: string,
  orderAmountPaise: number
): Promise<void> {
  const pay = (await razorpay.payments.fetch(paymentId)) as {
    status?: string;
    amount?: number;
  };
  const status = pay.status;
  if (status === 'captured') return;

  const amountPaise = Math.floor(
    Number.isFinite(Number(pay.amount)) && Number(pay.amount) > 0
      ? Number(pay.amount)
      : orderAmountPaise
  );

  if (status === 'authorized') {
    try {
      await razorpay.payments.capture(paymentId, amountPaise, 'INR');
    } catch (err: unknown) {
      const e = err as { error?: { description?: string } };
      const desc = String(e?.error?.description || '');
      if (/already\s+captured/i.test(desc)) return;
      throw err;
    }
    return;
  }

  throw new Error(
    `Payment ${paymentId} is not capturable (status: ${status || 'unknown'}).`
  );
}

/**
 * Idempotent: capture (optional) + mark order success + create student account from order metadata.
 * Safe if verify and webhook run in parallel, or student closed the payment page early.
 */
export async function fulfillPaidOrder(
  supabase: ServerDbLike,
  existingOrder: PaymentOrderRow,
  paymentId: string,
  options?: { razorpay?: Razorpay | null; skipCapture?: boolean }
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

  const { data: profileByEmail } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle();

  const { data: studentRowsByEmail } = await supabase
    .from('students')
    .select('id')
    .eq('email', normalizedEmail)
    .order('created_at', { ascending: false })
    .limit(1);

  const existingStudentByEmail = profileByEmail?.id
    ? { id: profileByEmail.id }
    : studentRowsByEmail?.[0];

  const orderAlreadySuccess = existingOrder.status === 'success';

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

  // Persist payment immediately (before enrollment) so login/dashboard gate works even if profile RPC fails.
  await ensurePaymentSuccessLog(supabase, {
    user_id: existingStudentByEmail?.id,
    payment_id: paymentId,
    amount_paise: orderAmountPaise,
    email: normalizedEmail,
    full_name: String(metadata.fullName || metadata.full_name || 'Student'),
    college_name: (metadata.college_name || metadata.college) as string | undefined,
    cybercafe_shop_name: metadata.cybercafe_shop_name as string | undefined,
    cybercafe_email: metadata.cybercafe_email as string | undefined,
    status: 'success',
  });

  let userId: string | undefined = existingStudentByEmail?.id;

  if (!userId) {
    const authResult = await createStudentAuthWithChosenPassword(supabase, {
      email: normalizedEmail,
      password,
      fullName: String(metadata.fullName || metadata.full_name || ''),
    });
    userId = authResult.userId;
  } else {
    await applyStudentRegistrationPassword(supabase, userId, normalizedEmail, password);
  }

  if (!userId) {
    throw new Error('Could not resolve user id after payment');
  }

  const { data: existingStudentRow } = await supabase
    .from('students')
    .select('id, registration_id')
    .eq('id', userId)
    .maybeSingle();

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

  let regId = existingStudentRow?.registration_id
    ? String(existingStudentRow.registration_id)
    : '';
  if (!regId) {
    const { data: lastStudent } = await supabase
      .from('students')
      .select('registration_id')
      .not('registration_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let nextSeq = 10001;
    if (lastStudent?.registration_id) {
      const parts = String(lastStudent.registration_id).split('/');
      if (parts.length === 4) {
        const lastNum = parseInt(parts[3], 10);
        if (!isNaN(lastNum)) nextSeq = lastNum + 1;
      }
    }
    const currentYear = new Date().getFullYear();
    regId = `API/${currentYear}/INT/${nextSeq}`;
  }

  const selectedDuration = String(
    metadata.internship_duration ||
      metadata.section_duration ||
      metaCopy.internship_duration ||
      metaCopy.section_duration ||
      '120 Hours'
  ).trim() || '120 Hours';

  const studentPayload: Record<string, unknown> = {
    id: userId,
    email: normalizedEmail,
    full_name: metadata.fullName || metadata.full_name,
    gender: metadata.gender,
    parent_name: metadata.parentName || metadata.parent_name,
    contact_number: metadata.contact_number || metadata.contact,
    university_name: metadata.university_name || metadata.university,
    college_name: metadata.college_name || metadata.college,
    course: metadata.course,
    internship_domain: metadata.course,
    degree: metadata.degree,
    department: metadata.department,
    class_semester: metadata.classSem || metadata.semester || metadata.class_semester,
    academic_session: metadata.session || metadata.academic_session,
    roll_number: metadata.rollNo || metadata.roll_number,
    emergency_name: metadata.emName || metadata.emergency_name,
    emergency_contact: metadata.emPhone || metadata.emergency_contact,
    emergency_relation: metadata.emRel || metadata.emergency_relation,
    status: 'Active',
    cybercafe_shop_name: metadata.cybercafe_shop_name,
    cybercafe_email: metadata.cybercafe_email,
    referral_code: validatedReferral,
    registration_id: regId,
    internship_duration: selectedDuration,
    metadata: {
      ...metaCopy,
      fullName: metadata.fullName || metadata.full_name,
      gender: metadata.gender,
      parentName: metadata.parentName || metadata.parent_name,
      contact: metadata.contact_number || metadata.contact,
      subject: metadata.subject,
      internship_mode: metadata.internship_mode,
      university: metadata.university_name || metadata.university,
      university_name: metadata.university_name || metadata.university,
      college: metadata.college_name || metadata.college,
      college_name: metadata.college_name || metadata.college,
      degree: metadata.degree,
      department: metadata.department,
      session: metadata.session || metadata.academic_session,
      academic_session: metadata.session || metadata.academic_session,
      semester: metadata.classSem || metadata.semester || metadata.class_semester,
      classSem: metadata.classSem || metadata.semester || metadata.class_semester,
      rollNo: metadata.rollNo || metadata.roll_number,
      roll_number: metadata.rollNo || metadata.roll_number,
      course: metadata.course,
      internship_domain: metadata.course,
      emName: metadata.emName || metadata.emergency_name,
      emPhone: metadata.emPhone || metadata.emergency_contact,
      emRel: metadata.emRel || metadata.emergency_relation,
      ...(metadata.section_duration || metaCopy.section_duration
        ? {
            section_duration:
              metadata.section_duration || metaCopy.section_duration,
          }
        : {}),
      internship_duration: selectedDuration,
      ...(plainPw ? { password: plainPw } : {}),
    },
  };

  const profilePayload = {
    id: userId,
    full_name: metadata.fullName || metadata.full_name,
    email: normalizedEmail,
    contact_number: metadata.contact_number || metadata.contact,
    gender: metadata.gender,
    parent_name: metadata.parentName || metadata.parent_name,
  };

  let enrollError: { message?: string; code?: string } | null = null;
  let retryCount = 0;
  const currentYear = new Date().getFullYear();

  while (retryCount < 5) {
    const { error: rpcErr } = await supabase.rpc('complete_student_registration', {
      p_student: studentPayload,
      p_profile: profilePayload,
    });
    if (!rpcErr) {
      enrollError = null;
      break;
    }
    if (
      rpcErr.code === '23505' &&
      String(rpcErr.message || '').includes('registration_id')
    ) {
      const parts = String(studentPayload.registration_id).split('/');
      const lastNum = parts.length === 4 ? parseInt(parts[3], 10) : 10001;
      studentPayload.registration_id = `API/${currentYear}/INT/${(isNaN(lastNum) ? 10001 : lastNum) + 1}`;
      retryCount++;
      continue;
    }
    enrollError = rpcErr;
    break;
  }

  if (enrollError) {
    console.error('fulfillPaidOrder — complete_student_registration:', enrollError);
    throw new Error(
      enrollError.message || 'Could not save student profile after payment'
    );
  }

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

  await ensurePaymentSuccessLog(supabase, {
    user_id: userId,
    payment_id: paymentId,
    amount_paise: orderAmountPaise,
    email: normalizedEmail,
    full_name: String(metadata.fullName || metadata.full_name || 'Student'),
    college_name: (metadata.college_name || metadata.college) as string | undefined,
    cybercafe_shop_name: metadata.cybercafe_shop_name as string | undefined,
    cybercafe_email: metadata.cybercafe_email as string | undefined,
    status: 'success',
  });

  try {
    await supabase.rpc('mark_lead_crm_converted_by_email', {
      p_email: normalizedEmail,
      p_detail: `Auto-converted: payment ${paymentId}`,
    });
  } catch (convertErr) {
    console.warn('mark_lead_crm_converted_by_email failed:', convertErr);
  }

  return { userId, alreadyComplete: orderAlreadySuccess };
}
