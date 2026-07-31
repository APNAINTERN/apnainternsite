export const ADMIN_ADD_REGISTRATION_SOURCE = "admin_add_registration";
export const ADMIN_BULK_UPLOAD_SOURCE = "admin_bulk_upload";
export const ADMIN_STUDENT_DATA_UPLOAD_SOURCE = "admin_student_data_upload";

export const ADD_REGISTRATION_BADGE_LABEL = "Added through Registration";
export const BULK_UPLOAD_BADGE_LABEL = "Uploaded through Bulk";
export const STUDENT_DATA_UPLOAD_BADGE_LABEL = "Student Data Upload";

export function getStudentRegistrationSource(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const source = metadata.source;
  return typeof source === "string" && source.trim() ? source.trim() : null;
}

function getAdminManualPaymentId(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const payId = metadata.razorpay_payment_id;
  return typeof payId === "string" && payId.trim() ? payId.trim() : null;
}

/** True when admin used Add Registration (including legacy rows before metadata.source existed). */
export function isStudentAdminAddedRegistration(
  metadata: Record<string, unknown> | null | undefined
): boolean {
  const source = getStudentRegistrationSource(metadata);
  if (source === ADMIN_BULK_UPLOAD_SOURCE || source === ADMIN_STUDENT_DATA_UPLOAD_SOURCE) {
    return false;
  }
  if (source === ADMIN_ADD_REGISTRATION_SOURCE) return true;

  const payId = getAdminManualPaymentId(metadata);
  return Boolean(payId?.startsWith("pay_admin_manual_"));
}

export function isStudentBulkUploaded(
  metadata: Record<string, unknown> | null | undefined
): boolean {
  const source = getStudentRegistrationSource(metadata);
  return source === ADMIN_BULK_UPLOAD_SOURCE || source === ADMIN_STUDENT_DATA_UPLOAD_SOURCE;
}

export function isStudentDataUploadImported(
  metadata: Record<string, unknown> | null | undefined
): boolean {
  return getStudentRegistrationSource(metadata) === ADMIN_STUDENT_DATA_UPLOAD_SOURCE;
}
