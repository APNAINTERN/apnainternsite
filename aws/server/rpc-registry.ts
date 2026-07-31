/**
 * Whitelist of Postgres RPCs callable via POST /api/rpc/:name
 *
 * `args` = ordered parameter names (must match pg function identity args).
 * `auth` = public | auth | admin
 *   - public: no Authorization required (login routing, catalogs, verify)
 *   - auth: requires Bearer JWT (presence checked; full JWT verify later)
 *   - admin: requires Bearer JWT (same for now; tighten with role claim later)
 *
 * Gradually convert hot frontend paths from supabase.rpc → this bridge,
 * then replace with dedicated REST handlers.
 */
export type RpcAuth = "public" | "auth" | "admin";

export type RpcDef = {
  args: string[];
  auth: RpcAuth;
};

export const RPC_REGISTRY: Record<string, RpcDef> = {
  // ── Login / account routing (public — no session yet) ─────────────────────
  resolve_login_email: { args: ["p_identifier"], auth: "public" },
  account_requires_admin_login: { args: ["check_email"], auth: "public" },
  account_is_student_only: { args: ["check_email"], auth: "public" },
  account_may_use_college_login: { args: ["check_email"], auth: "public" },
  account_may_use_referral_login: { args: ["check_email"], auth: "public" },
  get_user_id_by_email: { args: ["email_text"], auth: "public" },

  // ── Public catalogs / registration ────────────────────────────────────────
  list_public_universities: { args: [], auth: "public" },
  list_public_colleges: { args: ["p_university_id"], auth: "public" },
  get_registration_universities: { args: [], auth: "public" },
  get_registration_colleges: { args: ["p_university_id"], auth: "public" },
  get_public_payment_config: { args: [], auth: "public" },
  verify_certificate_public: {
    args: ["p_query", "p_student_name", "p_roll_number"],
    auth: "public",
  },
  verify_id_card_public: {
    args: ["p_card_number"],
    auth: "public",
  },
  admin_update_college_fees: {
    args: [
      "p_college_id",
      "p_otp",
      "p_pisa_fee",
      "p_fee_base_paise",
      "p_fee_processing_paise",
      "p_show_fee_breakdown",
    ],
    auth: "admin",
  },
  mark_student_directory_visible: {
    args: ["p_user_id"],
    auth: "admin",
  },
  check_student_registration_available: { args: ["p_email", "p_phone"], auth: "public" },
  validate_referral_code: { args: ["p_code"], auth: "public" },
  resolve_referral_attribution: {
    args: ["p_code", "p_university_name", "p_college_name"],
    auth: "public",
  },
  log_referral_click: { args: ["p_code", "p_session_id"], auth: "public" },
  match_prefilled_student: { args: ["p_reference_number", "p_dob"], auth: "public" },
  match_college_roster: { args: ["p_college_id", "p_email", "p_phone"], auth: "public" },
  allocate_next_registration_id: { args: ["p_year"], auth: "public" },
  upsert_registration_lead: {
    args: [
      "p_email",
      "p_phone",
      "p_step",
      "p_payload",
      "p_cybercafe_shop_name",
      "p_cybercafe_email",
    ],
    auth: "public",
  },
  delete_registration_lead: { args: ["p_email"], auth: "public" },

  // ── Authenticated student ─────────────────────────────────────────────────
  student_has_paid_enrollment: { args: ["p_user_id"], auth: "auth" },
  student_recover_paid_enrollment: { args: ["p_payment_id"], auth: "auth" },
  ensure_student_registration_id: { args: ["p_user_id"], auth: "auth" },
  list_assignments_for_student: { args: [], auth: "auth" },
  // Called before a session exists (password sync) — gated by p_plain match in SQL
  repair_student_auth_login: { args: ["p_email", "p_plain"], auth: "public" },

  // ── Admin / staff (only RPCs that already exist on RDS) ────────────────────
  admin_list_students_directory: {
    args: [
      "p_limit",
      "p_offset",
      "p_search",
      "p_domain",
      "p_university",
      "p_college",
      "p_start",
      "p_end",
    ],
    auth: "admin",
  },
  admin_count_students_directory: {
    args: ["p_search", "p_domain", "p_university", "p_college", "p_start", "p_end", "p_mode"],
    auth: "admin",
  },
  student_unread_notification_count: { args: [], auth: "auth" },
  admin_list_students_light: { args: ["p_limit", "p_offset"], auth: "admin" },
  admin_mark_student_attendance_day: {
    args: ["p_student_id", "p_marked_at"],
    auth: "admin",
  },
  admin_get_attendance_counts: { args: [], auth: "admin" },
  admin_site_visit_stats: { args: [], auth: "admin" },
  admin_list_notifications: { args: ["p_limit"], auth: "admin" },
  list_notifications_for_student: { args: [], auth: "auth" },
  admin_save_payment_config: { args: ["p_config"], auth: "admin" },
  admin_reset_user_password: { args: ["target_user_id", "new_pass"], auth: "admin" },
  admin_referral_overview: { args: [], auth: "admin" },
  admin_referral_partner_students: {
    args: ["p_partner_id", "p_limit", "p_offset", "p_search"],
    auth: "admin",
  },
  finalize_referral_partner_creation: {
    args: ["target_user_id", "p_partner_id", "p_login_secret", "partner_full_name", "partner_email"],
    auth: "admin",
  },
  detach_referral_partner_portal: { args: ["p_partner_id"], auth: "admin" },
  resolve_auth_user_id_by_email: { args: ["p_email"], auth: "admin" },
  student_mark_attendance: { args: [], auth: "auth" },
  list_classes_for_student: { args: [], auth: "auth" },
  admin_list_certificates_directory: {
    args: [
      "p_limit",
      "p_offset",
      "p_search",
      "p_universities",
      "p_colleges",
      "p_domain",
      "p_mode",
    ],
    auth: "admin",
  },
  admin_count_certificates_directory: {
    args: ["p_search", "p_universities", "p_colleges", "p_domain", "p_mode"],
    auth: "admin",
  },
  admin_list_registration_leads: {
    args: ["p_limit", "p_offset", "p_search", "p_university", "p_college"],
    auth: "admin",
  },
  admin_count_registration_leads: {
    args: ["p_search", "p_university", "p_college"],
    auth: "admin",
  },

  finalize_sub_admin_creation: {
    args: ["target_user_id", "staff_email", "staff_full_name", "p_permissions", "p_role"],
    auth: "admin",
  },
  staff_touch_session: {
    args: ["p_session_key", "p_device_label", "p_user_agent", "p_ip_hint"],
    auth: "auth",
  },
  staff_revoke_session: { args: ["p_session_key"], auth: "auth" },
  staff_revoke_other_sessions: { args: ["p_keep_session_key"], auth: "auth" },
  staff_log_activity: { args: ["p_event_type", "p_detail"], auth: "auth" },
  staff_update_profile_image: { args: ["p_profile_image_url"], auth: "auth" },
  finalize_college_admin_creation: {
    args: ["target_user_id", "staff_email", "staff_full_name", "p_college_ids", "p_college_admin_code"],
    auth: "admin",
  },
  update_college_admin_assignments: {
    args: ["target_user_id", "staff_email", "staff_full_name", "p_college_ids", "p_college_admin_code"],
    auth: "admin",
  },
  delete_college_admin: { args: ["target_user_id"], auth: "admin" },
  college_admin_list_students: { args: [], auth: "auth" },
  college_admin_list_students_for_college: { args: ["p_directory_name"], auth: "auth" },
  college_admin_count_students: { args: [], auth: "auth" },
  college_admin_count_students_for_college: { args: ["p_directory_name"], auth: "auth" },
  college_admin_directory_college_names: { args: [], auth: "auth" },

  admin_student_data_upload_import: {
    args: [
      "p_email",
      "p_password",
      "p_phone",
      "p_full_name",
      "p_gender",
      "p_parent_name",
      "p_university_name",
      "p_college_name",
      "p_degree",
      "p_department",
      "p_subject",
      "p_session",
      "p_semester",
      "p_registration_number",
      "p_roll_number",
      "p_internship_domain",
      "p_mode",
      "p_paid",
      "p_upload_id",
    ],
    auth: "admin",
  },
  admin_student_data_upload_delete_batch: {
    args: ["p_upload_id"],
    auth: "admin",
  },
  admin_student_data_upload_delete_all_imported: {
    args: [],
    auth: "admin",
  },
  admin_student_data_upload_delete_students: {
    args: ["p_ids"],
    auth: "admin",
  },
  admin_student_data_upload_save_history: {
    args: [
      "p_upload_id",
      "p_mode",
      "p_file_name",
      "p_total_rows",
      "p_imported_count",
      "p_skipped_count",
      "p_failed_count",
      "p_failed_rows",
      "p_imported_user_ids",
      "p_uploaded_by",
    ],
    auth: "admin",
  },
  admin_student_data_upload_backfill_history: {
    args: [],
    auth: "admin",
  },

  ensure_payment_success_log: { args: ["p_row"], auth: "auth" },

  admin_ensure_lead_crm: { args: ["p_rows"], auth: "admin" },
  admin_assign_leads: { args: ["p_staff_ids", "p_lead_crm_ids", "p_mode"], auth: "admin" },
  admin_unassign_leads: { args: ["p_lead_crm_ids"], auth: "admin" },
  mark_lead_crm_converted_by_email: {
    args: ["p_email", "p_detail"],
    auth: "auth",
  },
  sync_lead_crm_converted_from_enrollments: { args: [], auth: "admin" },
  staff_update_lead_crm: {
    args: [
      "p_lead_crm_id",
      "p_status",
      "p_remarks",
      "p_follow_up_at",
      "p_priority",
      "p_clear_follow_up",
    ],
    auth: "auth",
  },
  admin_upsert_staff_lead_targets: {
    args: ["p_staff_id", "p_daily_calls", "p_weekly_calls", "p_monthly_calls"],
    auth: "admin",
  },

  // ── Referral partner portal ───────────────────────────────────────────────
  referral_partner_stats: { args: [], auth: "auth" },
  referral_partner_list_students: { args: ["p_limit", "p_offset", "p_search"], auth: "auth" },
};

export function getRpcDef(name: string): RpcDef | null {
  return RPC_REGISTRY[name] ?? null;
}
