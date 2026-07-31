import { useEffect } from "react";
import ReactGA from "react-ga4";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Login from "./pages/Login.tsx";
import Register from "./pages/Register.tsx";
import Contact from "./pages/Contact.tsx";
import VerifyCertificate from "./pages/VerifyCertificate.tsx";
import VerifyIdCard from "./pages/VerifyIdCard.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Admin from "./pages/Admin.tsx";
import EngineeringManagement from "./pages/EngineeringManagement.tsx";
import NonEngineeringManagement from "./pages/NonEngineeringManagement.tsx";
import { Navigate } from "react-router-dom";
import SuperAdmin from "./pages/SuperAdmin.tsx";
import StaffDashboard from "./pages/StaffDashboard.tsx";
import Benefits from "./pages/Benefits.tsx";
import Courses from "./pages/Courses.tsx";
import CourseDetails from "./pages/CourseDetails.tsx";
import CourseEnroll from "./pages/CourseEnroll.tsx";
import AssignmentTest from "./pages/AssignmentTest.tsx";
import AssignmentResult from "./pages/AssignmentResult.tsx";
import PaymentStatus from "./pages/PaymentStatus.tsx";
import CyberCafeRegister from "./pages/CyberCafeRegister.tsx";
import CyberCafeDashboard from "./pages/CyberCafeDashboard.tsx";
import { VisitorTracker } from "./components/VisitorTracker";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { StudentDashboardGate } from "./components/StudentDashboardGate";
import CollegeDashboard from "./pages/CollegeDashboard.tsx";
import ReferralPartnerDashboard from "./pages/ReferralPartnerDashboard.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import AuthConfirm from "./pages/AuthConfirm.tsx";
import Terms from "./pages/Terms.tsx";
import Privacy from "./pages/Privacy.tsx";
import { AuthRedirectGuard } from "./components/AuthRedirectGuard";
import { AdminSessionRefresh } from "./components/AdminSessionRefresh";
import { StudentSessionRefresh } from "./components/StudentSessionRefresh";
import { authConfirmPathWithTokens } from "@/lib/authRedirectGuard";

function AuthCallbackRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={authConfirmPathWithTokens(search, hash)} replace />;
}

function Analytics() {
  const location = useLocation();

  useEffect(() => {
    ReactGA.send({
      hitType: "pageview",
      page: location.pathname
    });
  }, [location]);

  return null;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Analytics />
        <AdminSessionRefresh />
        <StudentSessionRefresh />
        <VisitorTracker />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/admin/login" element={<Login />} />
          <Route path="/cybercafe/login" element={<Login />} />
          <Route path="/cyber-cafe/login" element={<Navigate to="/cybercafe/login" replace />} />
          <Route path="/register" element={<Register />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth/confirm" element={<AuthConfirm />} />
          <Route path="/auth/callback" element={<AuthCallbackRedirect />} />
          <Route path="/verify" element={<VerifyCertificate />} />
          <Route path="/verify-id" element={<VerifyIdCard />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={["student"]}>
                <StudentDashboardGate>
                  <Dashboard />
                </StudentDashboardGate>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={["admin", "super_admin"]}>
                <Admin />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/engineering-management"
            element={
              <ProtectedRoute allowedRoles={["admin", "super_admin"]}>
                <EngineeringManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/non-engineering-management"
            element={
              <ProtectedRoute allowedRoles={["admin", "super_admin"]}>
                <NonEngineeringManagement />
              </ProtectedRoute>
            }
          />
          <Route path="/admin/referrals" element={<Navigate to="/admin?tab=referrals" replace />} />
          <Route
            path="/super-admin"
            element={
              <ProtectedRoute allowedRoles={["super_admin"]}>
                <SuperAdmin />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff-dashboard"
            element={
              <ProtectedRoute allowedRoles={["staff"]}>
                <StaffDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/college/login" element={<Login />} />
          <Route
            path="/college/dashboard"
            element={
              <ProtectedRoute allowedRoles={["college_admin"]}>
                <CollegeDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/referral/login" element={<Login />} />
          <Route
            path="/referral/dashboard"
            element={
              <ProtectedRoute allowedRoles={["referral_partner"]}>
                <ReferralPartnerDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/benefits" element={<Benefits />} />
          <Route path="/courses" element={<Courses />} />
          <Route path="/courses/:slug/enroll" element={<CourseEnroll />} />
          <Route path="/courses/:slug" element={<CourseDetails />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/assignment/:id" element={<AssignmentTest />} />
          <Route path="/assignment/:id/result" element={<AssignmentResult />} />
          <Route path="/payment-status" element={<PaymentStatus />} />
          <Route path="/cybercafe" element={<CyberCafeRegister />} />
          <Route
            path="/cybercafe/dashboard"
            element={
              <ProtectedRoute allowedRoles={["cybercafe"]}>
                <CyberCafeDashboard />
              </ProtectedRoute>
            }
          />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);
export default App;
