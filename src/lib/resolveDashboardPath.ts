import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  COLLEGE_DASHBOARD_PATH,
  REFERRAL_DASHBOARD_PATH,
} from "@/lib/authRoutes";
import {
  canAccessStudentDashboard,
  STUDENT_POST_UNPAID_LOGIN_PATH,
} from "@/lib/studentPaymentAccess";
import { fetchCybercafeExists, fetchRolesForUser, readRolesFromUser } from "@/lib/portalAuth";

/** Post-login destination from {@link public.user_roles} (never trust user_metadata for access). */
export async function resolveDashboardPath(user: User): Promise<string> {
  const fromMeta = readRolesFromUser(user, user.id);
  const rolesList = fromMeta?.length ? fromMeta : await fetchRolesForUser(supabase, user.id);
  let cybercafe = false;
  try {
    cybercafe = await fetchCybercafeExists(supabase, user.id);
  } catch {
    cybercafe = false;
  }
  if (rolesList.includes("super_admin")) return "/admin";
  if (rolesList.includes("staff")) return "/staff-dashboard";
  if (rolesList.includes("admin")) return "/admin";
  if (rolesList.includes("college_admin")) return COLLEGE_DASHBOARD_PATH;
  if (rolesList.includes("referral_partner")) return REFERRAL_DASHBOARD_PATH;
  if (cybercafe) return "/cybercafe/dashboard";

  const mayUseStudentDashboard = await canAccessStudentDashboard(
    supabase,
    user.id,
    user.email || undefined
  );
  return mayUseStudentDashboard ? "/dashboard" : STUDENT_POST_UNPAID_LOGIN_PATH;
}
