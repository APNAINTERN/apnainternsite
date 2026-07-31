import {
  buildRegistrationStudentPayload,
  type RegistrationStudentPayloadInput,
} from "@/lib/registerStudentDirectory";

/** First non-empty trimmed string from candidates. */
export function pickLeadString(...values: unknown[]): string {
  for (const v of values) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

/** Merge registration draft payload, payment metadata, and top-level lead columns. */
export function mergeLeadFieldSources(lead: Record<string, unknown>): Record<string, unknown> {
  const payload =
    typeof lead.payload === "object" && lead.payload !== null && !Array.isArray(lead.payload)
      ? (lead.payload as Record<string, unknown>)
      : {};
  const metadata =
    typeof lead.metadata === "object" && lead.metadata !== null && !Array.isArray(lead.metadata)
      ? (lead.metadata as Record<string, unknown>)
      : {};
  return { ...payload, ...metadata };
}

/** Password stored on the lead (draft/payment metadata), if any. */
export function resolveLeadStoredPassword(lead: Record<string, unknown> | null | undefined): string {
  if (!lead) return "";
  const merged = mergeLeadFieldSources(lead);
  return pickLeadString(merged.password, lead.password);
}

/** Map Lead Hub row → same student shape as paid registration / student directory. */
export function buildLeadTransferStudentPayload(input: {
  userId: string;
  normalizedEmail: string;
  lead: Record<string, unknown>;
  password: string;
  registrationId: string;
}): Record<string, unknown> {
  const { userId, normalizedEmail, lead, password, registrationId } = input;
  const meta = mergeLeadFieldSources(lead);

  const fullName = pickLeadString(
    lead.full_name,
    meta.fullName,
    meta.full_name,
    lead.user_email,
    lead.email
  );
  const contact = pickLeadString(
    lead.user_phone,
    lead.contact_number,
    lead.phone,
    meta.contact,
    meta.contact_number
  );
  const universityName = pickLeadString(
    lead.university_name,
    meta.university,
    meta.university_name
  );
  const collegeName = pickLeadString(lead.college_name, meta.college, meta.college_name);
  const course = pickLeadString(
    meta.course,
    meta.internship_domain,
    lead.course,
    lead.internship_domain
  );
  const subject = pickLeadString(meta.subject);
  const internshipMode = pickLeadString(
    meta.internship_mode,
    meta.internshipMode,
    "Online"
  );

  const registrationInput: RegistrationStudentPayloadInput = {
    userId,
    normalizedEmail,
    fullName: fullName || normalizedEmail,
    gender: pickLeadString(lead.gender, meta.gender),
    parentName: pickLeadString(lead.parent_name, meta.parentName, meta.parent_name),
    contact,
    universityName,
    collegeName,
    course: course || subject,
    degree: pickLeadString(lead.degree, meta.degree),
    departmentName: pickLeadString(lead.department, meta.department),
    classSem: pickLeadString(
      lead.class_semester,
      meta.semester,
      meta.classSem,
      meta.class_semester
    ),
    session: pickLeadString(lead.academic_session, meta.session, meta.academic_session),
    rollNo: pickLeadString(lead.roll_number, meta.rollNo, meta.roll_number),
    subject,
    internshipMode,
    emName: pickLeadString(lead.emergency_name, meta.emName, meta.emergency_name),
    emPhone: pickLeadString(lead.emergency_contact, meta.emPhone, meta.emergency_contact),
    emRel: pickLeadString(lead.emergency_relation, meta.emRel, meta.emergency_relation),
    referralCode:
      pickLeadString(lead.referral_code, meta.referral_code) || null,
    cyberShopName:
      pickLeadString(lead.cybercafe_shop_name, meta.cybercafe_shop_name) || null,
    cyberEmail: pickLeadString(lead.cybercafe_email, meta.cybercafe_email) || null,
    registrationId,
    password,
    extraMetadata: {
      ...meta,
      fullName: fullName || meta.fullName,
      full_name: fullName || meta.full_name,
      parentName: pickLeadString(meta.parentName, meta.parent_name, lead.parent_name),
      parent_name: pickLeadString(meta.parent_name, meta.parentName, lead.parent_name),
      contact,
      contact_number: contact,
      university: universityName,
      university_name: universityName,
      college: collegeName,
      college_name: collegeName,
      course: course || subject,
      internship_domain: pickLeadString(meta.internship_domain, course, subject),
      subject,
      internship_mode: internshipMode,
      semester: pickLeadString(meta.semester, meta.classSem, lead.class_semester),
      classSem: pickLeadString(meta.classSem, meta.semester, lead.class_semester),
      rollNo: pickLeadString(meta.rollNo, meta.roll_number, lead.roll_number),
      roll_number: pickLeadString(meta.roll_number, meta.rollNo, lead.roll_number),
      emName: pickLeadString(meta.emName, meta.emergency_name, lead.emergency_name),
      emPhone: pickLeadString(meta.emPhone, meta.emergency_contact, lead.emergency_contact),
      emRel: pickLeadString(meta.emRel, meta.emergency_relation, lead.emergency_relation),
      internship_duration: pickLeadString(
        meta.internship_duration,
        pickLeadString(meta.section_duration, "120 Hours")
      ),
      address: meta.address,
      consent_form_url: meta.consent_form_url,
      source: "lead_hub_transfer",
      transferred_at: new Date().toISOString(),
      lead_hub_payment_id: lead.payment_id ?? meta.payment_id ?? null,
      lead_hub_failure_reason: lead.failure_reason ?? lead.reason ?? null,
    },
  };

  return buildRegistrationStudentPayload(registrationInput);
}

export function buildLeadTransferProfileRow(
  studentRow: Record<string, unknown>
): Record<string, unknown> {
  return {
    id: studentRow.id,
    full_name: studentRow.full_name,
    email: studentRow.email,
    contact_number: studentRow.contact_number,
    gender: studentRow.gender,
    parent_name: studentRow.parent_name,
  };
}
