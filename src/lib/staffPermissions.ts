/** Canonical staff/sub-admin service permission flags. */

export const STAFF_PERMISSION_KEYS = [
  // Students
  "can_manage_students",
  "can_manage_engineering",
  "can_manage_non_engineering",
  // Academics
  "can_manage_attendance",
  "can_manage_employee_attendance",
  "can_manage_staff",
  "can_manage_certificates",
  "can_manage_id_cards",
  "can_manage_uploads",
  "can_manage_classes",
  "can_manage_courses",
  "can_manage_course_leads",
  // Revenue
  "can_view_payments",
  "can_manage_leads",
  "can_manage_fees",
  // Communications
  "can_manage_notifications",
  "can_manage_assignments",
  "can_manage_communications",
  // Partners
  "can_manage_cybercafe",
  "can_manage_referrals",
  "can_manage_college_rosters",
  // Institutions
  "can_manage_institutions",
  // System
  "can_manage_settings",
] as const;

export type StaffPermissionKey = (typeof STAFF_PERMISSION_KEYS)[number];

export type StaffPermissions = Record<StaffPermissionKey, boolean>;

export const STAFF_PERMISSION_CATALOG: {
  id: StaffPermissionKey;
  label: string;
  description?: string;
  section?: string;
}[] = [
  // Students
  { id: "can_manage_students",          label: "Students & Add Registration", description: "Student directory, records, and Add Registration", section: "Students" },
  { id: "can_manage_engineering",       label: "Engineering Directory & Management", description: "Engineering directory and Eng. Management configs", section: "Students" },
  { id: "can_manage_non_engineering",   label: "Non-Tech Management", description: "Configure non-tech universities, colleges, and programmes", section: "Students" },
  // Academics
  { id: "can_manage_attendance",        label: "Attendance Tracking",        description: "Manage student attendance records",       section: "Academics" },
  { id: "can_manage_employee_attendance", label: "Employee Attendance",      description: "Manage staff/employee attendance",       section: "Academics" },
  { id: "can_manage_staff",             label: "Staff Management",           description: "Create and manage staff / service access", section: "Academics" },
  { id: "can_manage_certificates",      label: "Certificates",               description: "Issue internship certificates",           section: "Academics" },
  { id: "can_manage_id_cards",          label: "ID Card Generation",         description: "Generate and manage student ID cards",    section: "Academics" },
  { id: "can_manage_uploads",           label: "Uploads & Learning Materials", description: "Upload and manage learning content",  section: "Academics" },
  { id: "can_manage_classes",           label: "Live Classes",               description: "Schedule and manage live class links",    section: "Academics" },
  { id: "can_manage_courses",           label: "Course Management",          description: "Manage LMS courses and curriculum",       section: "Academics" },
  { id: "can_manage_course_leads",      label: "Course Leads",               description: "Manage course inquiry leads",             section: "Academics" },
  // Revenue
  { id: "can_view_payments",            label: "Payments & Revenue",         description: "View payment transactions",               section: "Revenue" },
  { id: "can_manage_leads",             label: "Assigned Leads",             description: "View and work leads assigned by Admin",   section: "Revenue" },
  { id: "can_manage_fees",              label: "Fees Management",            description: "Manage fee rules and collections",        section: "Revenue" },
  // Communications
  { id: "can_manage_notifications",     label: "System Notifications",       description: "Send push announcements",                 section: "Communications" },
  { id: "can_manage_assignments",       label: "Assignments",                description: "Create and grade assignments",            section: "Communications" },
  { id: "can_manage_communications",    label: "Email Communications",       description: "Bulk email / Comms Center",               section: "Communications" },
  // Partners
  { id: "can_manage_cybercafe",         label: "Cyber Cafes",                description: "Manage cyber café partner accounts",     section: "Partners" },
  { id: "can_manage_referrals",         label: "Referrals",                  description: "View and manage referral partners",       section: "Partners" },
  { id: "can_manage_college_rosters",   label: "College Rosters",            description: "Manage college student rosters",          section: "Partners" },
  // Institutions
  { id: "can_manage_institutions",      label: "Academic Partners",          description: "Universities and colleges",               section: "Institutions" },
  // System
  { id: "can_manage_settings",          label: "System Settings",            description: "View and modify system configuration",    section: "System" },
];

export function emptyStaffPermissions(): StaffPermissions {
  return STAFF_PERMISSION_KEYS.reduce((acc, key) => {
    acc[key] = false;
    return acc;
  }, {} as StaffPermissions);
}

/** Normalize any raw permissions object / admin_permissions row to full boolean map (default false). */
export function normalizeStaffPermissions(raw: unknown): StaffPermissions {
  const base = emptyStaffPermissions();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;

  // Legacy / mistaken keys written by older staff UI
  const aliases: Record<string, StaffPermissionKey> = {
    can_manage_learning_materials: "can_manage_uploads",
    can_manage_site_settings: "can_manage_settings",
  };
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (typeof obj[alias] === "boolean" && typeof obj[canonical] !== "boolean") {
      obj[canonical] = obj[alias];
    }
  }

  for (const key of STAFF_PERMISSION_KEYS) {
    if (typeof obj[key] === "boolean") {
      base[key] = obj[key] as boolean;
    }
  }
  return base;
}

/**
 * Merge admin_permissions row + admin_staff.permissions JSON.
 * Service Access writes the full map to admin_staff.permissions — that is the source of truth.
 * Table columns are a partial sync; do not AND them against JSON (that hid Non-Tech / Attendance).
 */
export function mergeStaffPermissions(
  adminPermsRow: unknown,
  staffJson: unknown
): StaffPermissions {
  const fromTable = normalizeStaffPermissions(adminPermsRow);
  const fromJson = normalizeStaffPermissions(staffJson);
  const hasTable =
    adminPermsRow && typeof adminPermsRow === "object" && Object.keys(adminPermsRow as object).length > 0;
  const hasJson =
    staffJson && typeof staffJson === "object" && Object.keys(staffJson as object).length > 0;

  if (!hasTable && !hasJson) return emptyStaffPermissions();
  if (hasJson) {
    const out = emptyStaffPermissions();
    for (const key of STAFF_PERMISSION_KEYS) {
      const jsonExplicit = typeof (staffJson as Record<string, unknown>)?.[key] === "boolean";
      const tableExplicit = typeof (adminPermsRow as Record<string, unknown>)?.[key] === "boolean";
      if (jsonExplicit) out[key] = fromJson[key];
      else if (tableExplicit) out[key] = fromTable[key];
      else out[key] = false;
    }
    return out;
  }
  return fromTable;
}

export function hasStaffPerm(perms: StaffPermissions | null | undefined, key: StaffPermissionKey): boolean {
  return perms?.[key] === true;
}

/** Payload suitable for upsert into admin_permissions + admin_staff.permissions */
export function staffPermissionsPayload(perms: StaffPermissions): StaffPermissions {
  return { ...normalizeStaffPermissions(perms) };
}
