export type AdminStaffProfile = {
  id: string;
  email: string;
  full_name: string | null;
  role_tag: string | null;
  permissions: Record<string, boolean> | null;
  mobile_number: string | null;
  account_number: string | null;
  ifsc_code: string | null;
  bank_name: string | null;
  aadhaar_number: string | null;
  pan_number: string | null;
  profile_image_url: string | null;
  employee_code?: string | null;
  is_blocked: boolean;
  created_at?: string;
  updated_at?: string;
};

export type StaffProfileFormFields = {
  full_name: string;
  email: string;
  mobile_number: string;
  account_number: string;
  ifsc_code: string;
  bank_name: string;
  aadhaar_number: string;
  pan_number: string;
  profile_image_url: string;
};

export const emptyStaffProfileForm = (): StaffProfileFormFields => ({
  full_name: "",
  email: "",
  mobile_number: "",
  account_number: "",
  ifsc_code: "",
  bank_name: "",
  aadhaar_number: "",
  pan_number: "",
  profile_image_url: "",
});

export function staffRowToForm(row: Partial<AdminStaffProfile> | null | undefined): StaffProfileFormFields {
  return {
    full_name: row?.full_name || "",
    email: row?.email || "",
    mobile_number: row?.mobile_number || "",
    account_number: row?.account_number || "",
    ifsc_code: row?.ifsc_code || "",
    bank_name: row?.bank_name || "",
    aadhaar_number: row?.aadhaar_number || "",
    pan_number: row?.pan_number || "",
    profile_image_url: row?.profile_image_url || "",
  };
}

export function staffProfileDbPayload(form: StaffProfileFormFields) {
  return {
    full_name: form.full_name.trim() || null,
    mobile_number: form.mobile_number.trim() || null,
    account_number: form.account_number.trim() || null,
    ifsc_code: form.ifsc_code.trim().toUpperCase() || null,
    bank_name: form.bank_name.trim() || null,
    aadhaar_number: form.aadhaar_number.trim() || null,
    pan_number: form.pan_number.trim().toUpperCase() || null,
    profile_image_url: form.profile_image_url.trim() || null,
    updated_at: new Date().toISOString(),
  };
}
