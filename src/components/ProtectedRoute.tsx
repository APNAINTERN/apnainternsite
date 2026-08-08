import { ReactNode, useMemo } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, UserRole } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { isAdminAreaPath, isCollegeAreaPath, isReferralAreaPath, loginPathForProtectedRoute } from "@/lib/authRoutes";
import { isAdminPortalSessionActive } from "@/lib/adminAuthSession";
import { isStudentPortalSessionActive } from "@/lib/studentAuthSession";
import { readRolesFromUser } from "@/lib/portalAuth";

const STUDENT_DASHBOARD_PATH = "/dashboard";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: UserRole[];
}

export const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, roles, loading } = useAuth();
  const location = useLocation();
  const isAdminRoute = isAdminAreaPath(location.pathname);
  const isStudentDashboard = location.pathname === STUDENT_DASHBOARD_PATH;
  const adminSessionActive = isAdminPortalSessionActive();
  const studentSessionActive = isStudentPortalSessionActive();
  const keepMountedDuringRefresh =
    (isAdminRoute && adminSessionActive) || (isStudentDashboard && studentSessionActive);

  const effectiveRoles = useMemo(() => {
    if (roles.length > 0) return roles;
    const fromMeta = readRolesFromUser(user, user?.id || "") as UserRole[] | null;
    return fromMeta?.length ? (fromMeta as UserRole[]) : roles;
  }, [roles, user]);

  const showAuthLoader = loading && !(keepMountedDuringRefresh && user);

  if (showAuthLoader) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="size-10 animate-spin text-primary mx-auto mb-4" />
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest animate-pulse">
            Verifying Identity...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (keepMountedDuringRefresh) {
      return <>{children}</>;
    }
    const loginTo = loginPathForProtectedRoute(location.pathname);
    return <Navigate to={loginTo} state={{ from: location }} replace />;
  }

  // Role check
  if (allowedRoles && allowedRoles.length > 0) {
    if (!effectiveRoles.length && user) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-center">
            <Loader2 className="size-10 animate-spin text-primary mx-auto mb-4" />
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest animate-pulse">
              Loading permissions...
            </p>
          </div>
        </div>
      );
    }

    const hasRequiredRole = effectiveRoles.some(role => allowedRoles.includes(role));
    
    if (!hasRequiredRole) {
      // Unauthorized — never render admin/staff/super/cyber-only pages for the wrong role.
      const portalRoles: UserRole[] = ["super_admin", "admin", "staff", "cybercafe"];
      const hasPortalRole = effectiveRoles.some((r) => portalRoles.includes(r));
      const triedAdminArea = isAdminAreaPath(location.pathname);
      const triedCollegeArea = isCollegeAreaPath(location.pathname);
      const triedReferralArea = isReferralAreaPath(location.pathname);

      if (triedReferralArea && !effectiveRoles.includes("referral_partner")) {
        if (effectiveRoles.includes("super_admin")) return <Navigate to="/admin" replace />;
        if (effectiveRoles.includes("admin")) return <Navigate to="/admin" replace />;
        if (effectiveRoles.includes("staff")) return <Navigate to="/staff-dashboard" replace />;
        if (effectiveRoles.includes("college_admin")) return <Navigate to="/college/dashboard" replace />;
        if (effectiveRoles.includes("cybercafe")) return <Navigate to="/cybercafe/dashboard" replace />;
        if (effectiveRoles.includes("student")) return <Navigate to="/dashboard" replace />;
        return <Navigate to="/" replace />;
      }

      if (triedCollegeArea && !effectiveRoles.includes("college_admin")) {
        if (effectiveRoles.includes("super_admin")) return <Navigate to="/admin" replace />;
        if (effectiveRoles.includes("admin")) return <Navigate to="/admin" replace />;
        if (effectiveRoles.includes("staff")) return <Navigate to="/staff-dashboard" replace />;
        if (effectiveRoles.includes("cybercafe")) return <Navigate to="/cybercafe/dashboard" replace />;
        if (effectiveRoles.includes("referral_partner")) return <Navigate to="/referral/dashboard" replace />;
        if (effectiveRoles.includes("student")) return <Navigate to="/dashboard" replace />;
        return <Navigate to="/" replace />;
      }

      if (triedAdminArea && !hasPortalRole) {
        if (effectiveRoles.includes("college_admin")) return <Navigate to="/college/dashboard" replace />;
        if (effectiveRoles.includes("referral_partner")) return <Navigate to="/referral/dashboard" replace />;
        return <Navigate to="/dashboard" replace />;
      }

      if (effectiveRoles.includes("super_admin")) return <Navigate to="/admin" replace />;
      if (effectiveRoles.includes("admin")) return <Navigate to="/admin" replace />;
      if (effectiveRoles.includes("staff")) return <Navigate to="/staff-dashboard" replace />;
      if (effectiveRoles.includes("college_admin")) return <Navigate to="/college/dashboard" replace />;
      if (effectiveRoles.includes("referral_partner")) return <Navigate to="/referral/dashboard" replace />;
      if (effectiveRoles.includes("cybercafe")) return <Navigate to="/cybercafe/dashboard" replace />;
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
};
