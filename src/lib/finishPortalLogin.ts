import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  COLLEGE_DASHBOARD_PATH,
  REFERRAL_DASHBOARD_PATH,
} from "@/lib/authRoutes";
import {
  canAccessStudentDashboard,
  STUDENT_POST_UNPAID_LOGIN_PATH,
} from "@/lib/studentPaymentAccess";
import { fetchCybercafeExists, fetchRolesForUser } from "@/lib/portalAuth";

export type PortalLoginRouteContext = {
  isCollegeLoginRoute: boolean;
  isReferralLoginRoute: boolean;
  isAdminLoginRoute: boolean;
};

export type FinishPortalLoginResult =
  | { ok: true; destination: string; paymentWarning?: boolean }
  | { ok: false; message: string; signedOut?: boolean };

/**
 * Role and portal checks after auth.
 * Uses one roles/cybercafe fetch and resolves destination without a second round-trip.
 */
export async function finishPortalLoginAfterAuth(
  client: SupabaseClient,
  user: User,
  ctx: PortalLoginRouteContext
): Promise<FinishPortalLoginResult> {
  const rolesList = await fetchRolesForUser(client, user.id);
  const isStaffMember = rolesList.includes("staff");
  const hasCollegeAdmin = rolesList.includes("college_admin");
  const hasReferralPartner = rolesList.includes("referral_partner");
  const cybercafe = await fetchCybercafeExists(client, user.id);

  const isAdminPortalAccount =
    rolesList.includes("super_admin") ||
    rolesList.includes("admin") ||
    isStaffMember ||
    cybercafe;

  if (ctx.isCollegeLoginRoute) {
    if (!hasCollegeAdmin) {
      await client.auth.signOut();
      return {
        ok: false,
        signedOut: true,
        message:
          "You do not have access to the college portal. Use the email that received your college administrator invitation.",
      };
    }
  } else if (ctx.isReferralLoginRoute) {
    if (!hasReferralPartner) {
      await client.auth.signOut();
      return {
        ok: false,
        signedOut: true,
        message:
          "You do not have access to the referral promoter portal. Use the email that received your promoter invitation.",
      };
    }
  } else if (ctx.isAdminLoginRoute) {
    if (!isAdminPortalAccount) {
      await client.auth.signOut();
      return {
        ok: false,
        signedOut: true,
        message:
          "You don't have access to the admin portal. This sign-in is only for authorised staff and administrators.",
      };
    }
  } else {
    const elevatedForStudentBlock =
      rolesList.includes("super_admin") ||
      rolesList.includes("admin") ||
      isStaffMember ||
      hasCollegeAdmin ||
      hasReferralPartner ||
      cybercafe;
    if (elevatedForStudentBlock) {
      await client.auth.signOut();
      return {
        ok: false,
        signedOut: true,
        message:
          "You don't have access to the student portal. This sign-in is only for enrolled students.",
      };
    }
  }

  let destination = "/dashboard";
  let needsPaymentPrompt = false;
  if (ctx.isCollegeLoginRoute) destination = COLLEGE_DASHBOARD_PATH;
  else if (ctx.isReferralLoginRoute) destination = REFERRAL_DASHBOARD_PATH;
  else if (rolesList.includes("super_admin")) destination = "/admin";
  else if (isStaffMember) destination = "/staff-dashboard";
  else if (rolesList.includes("admin")) destination = "/admin";
  else if (hasCollegeAdmin) destination = COLLEGE_DASHBOARD_PATH;
  else if (hasReferralPartner) destination = REFERRAL_DASHBOARD_PATH;
  else if (cybercafe) destination = "/cybercafe/dashboard";
  else {
    // Student path — one payment/directory check (coalesced; reused by StudentDashboardGate)
    const mayUse = await canAccessStudentDashboard(
      client,
      user.id,
      user.email || undefined
    );
    if (mayUse) {
      destination = "/dashboard";
    } else {
      // Land on home so unpaid students can browse; pay later via nav / dashboard.
      destination = STUDENT_POST_UNPAID_LOGIN_PATH;
      needsPaymentPrompt = true;
    }
  }

  return {
    ok: true,
    destination,
    paymentWarning: needsPaymentPrompt || destination.includes("payment=required"),
  };
}
