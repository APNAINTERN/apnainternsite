// Deploy refresh marker — no functional change (2026-07-08).
import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  ADMIN_LOGIN_PATH,
  COLLEGE_DASHBOARD_PATH,
  COLLEGE_LOGIN_PATH,
  CYBER_CAFE_LEGACY_LOGIN_PATH,
  CYBER_CAFE_LOGIN_PATH,
  REFERRAL_DASHBOARD_PATH,
  REFERRAL_LOGIN_PATH,
  STUDENT_CREDENTIAL_LOGIN_QUERY_KEY,
  STUDENT_CREDENTIAL_LOGIN_QUERY_VALUE,
  STUDENT_LOGIN_PATH,
} from "@/lib/authRoutes";
import { getSendMailApiUrl } from "@/lib/sendMailApi";
import { siteApiUrl } from "@/lib/siteApi";
import { resolveLoginIdentifier } from "@/lib/resolveLoginIdentifier";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { supabase } from "@/integrations/supabase/client";
import { resolveDashboardPath } from "@/lib/resolveDashboardPath";
import {
  attemptStudentPasswordLoginBeforeOtp,
  signInStudentWithPassword,
} from "@/lib/studentAuthLogin";
import { requestStudentLoginOtp, signInStudentWithOtp } from "@/lib/studentOtpLogin";
import { establishAdminAuthSession } from "@/lib/adminAuthSession";
import { requestAdminLoginOtp, verifyAdminLoginOtp } from "@/lib/adminLoginOtp";
import { isLocalDevEnvironment } from "@/lib/isLocalDev";
import { finishPortalLoginAfterAuth } from "@/lib/finishPortalLogin";
import {
  canAccessStudentDashboard,
} from "@/lib/studentPaymentAccess";
import {
  REGISTRATION_PASSWORD_MIN_LENGTH,
  userFacingPasswordError,
} from "@/lib/registrationPassword";
import { PASSWORD_RESETS_SCHEMA_HINT, passwordResetInsertRow } from "@/lib/passwordResetRow";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, KeyRound } from "lucide-react";
import { NoticePopup } from "@/components/NoticePopup";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isCyberCafeLoginRoute =
    location.pathname === CYBER_CAFE_LOGIN_PATH ||
    location.pathname === CYBER_CAFE_LEGACY_LOGIN_PATH;
  const isCollegeLoginRoute = location.pathname === COLLEGE_LOGIN_PATH;
  const isReferralLoginRoute = location.pathname === REFERRAL_LOGIN_PATH;
  // /cybercafe/login is partner portal login (no student-sign-out flow).
  const isAdminLoginRoute =
    location.pathname === ADMIN_LOGIN_PATH || isCyberCafeLoginRoute;
  /** /admin/login only — staff & super-admin OTP gate (not cyber café). */
  const isStaffPortalLogin = location.pathname === ADMIN_LOGIN_PATH;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const [loginLoading, setLoginLoading] = useState(false);
  const isStudentLoginRoute = location.pathname === STUDENT_LOGIN_PATH;

  /** Student portal: password first; email OTP only after password fails. */
  const [studentLoginStep, setStudentLoginStep] = useState<"password" | "otp">("password");
  const [studentOtpEmail, setStudentOtpEmail] = useState("");
  const [studentOtp, setStudentOtp] = useState("");
  const [studentOtpSending, setStudentOtpSending] = useState(false);
  const [studentOtpSent, setStudentOtpSent] = useState(false);

  /** Admin portal: password verified → email OTP before session is kept. */
  const [adminLoginStep, setAdminLoginStep] = useState<"password" | "otp">("password");
  const [adminPendingEmail, setAdminPendingEmail] = useState("");
  const [adminPendingPassword, setAdminPendingPassword] = useState("");
  const [adminOtp, setAdminOtp] = useState("");
  const [adminOtpSending, setAdminOtpSending] = useState(false);
  const [adminOtpSent, setAdminOtpSent] = useState(false);
  const [adminDevOtp, setAdminDevOtp] = useState<string | null>(null);
  const isLocalDev = isLocalDevEnvironment();

  // Captcha State
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [verifyingCaptcha, setVerifyingCaptcha] = useState(false);

  const handleVerifyCaptcha = () => {
    if (captchaVerified || verifyingCaptcha) return;
    setVerifyingCaptcha(true);
    const delay = 3500 + Math.random() * 1000;
    setTimeout(() => {
      setCaptchaVerified(true);
      setVerifyingCaptcha(false);
      toast.success("Security check passed");
    }, delay);
  };

  // Forgot PIN State
  const [showForgotPinDialog, setShowForgotPinDialog] = useState(false);
  const [forgotPinStep, setForgotPinStep] = useState<"email" | "otp" | "new_pin">("email");
  const [forgotPinEmail, setForgotPinEmail] = useState("");
  const [forgotPinOtp, setForgotPinOtp] = useState("");
  const [forgotPinNew, setForgotPinNew] = useState("");
  const [forgotPinLoading, setForgotPinLoading] = useState(false);
  const [forgotPinOtpMode, setForgotPinOtpMode] = useState<"client" | "server">("client");
  
  // Forgot Password State
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetStep, setResetStep] = useState<"email" | "otp" | "password">("email");
  const [resetEmail, setResetEmail] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  // Credential emails link with ?portal=student: sign out so admin/staff session does not steal the student login page.
  // Otherwise any existing session skips the form and redirects to that user's dashboard.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams(location.search);
      const forceStudentPortal =
        location.pathname === STUDENT_LOGIN_PATH &&
        params.get(STUDENT_CREDENTIAL_LOGIN_QUERY_KEY) === STUDENT_CREDENTIAL_LOGIN_QUERY_VALUE;

      if (forceStudentPortal) {
        await supabase.auth.signOut();
        if (cancelled) return;
        navigate(STUDENT_LOGIN_PATH, { replace: true });
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user || cancelled) {
        return;
      }

      // Student /login: paid session → dashboard; else try recovery, then show a clean login form.
      if (isStudentLoginRoute) {
        let paid = await canAccessStudentDashboard(
          supabase,
          session.user.id,
          session.user.email || undefined
        );
        if (!paid) {
          try {
            await supabase.rpc("student_recover_paid_enrollment", { p_payment_id: null });
          } catch {
            /* RPC optional */
          }
          paid = await canAccessStudentDashboard(
            supabase,
            session.user.id,
            session.user.email || undefined
          );
        }
        if (cancelled) return;
        if (paid) {
          navigate("/dashboard", { replace: true });
          return;
        }
        // Unpaid students may browse freely — do not bounce Login → Home in a loop.
        // Leave the login form visible so they can switch accounts or stay signed in.
        return;
      }

      const dest = await resolveDashboardPath(session.user);
      // Unpaid student destination is payment page — don't trap them if they opened a portal login by mistake
      if (String(dest).includes("payment=required")) {
        return;
      }
      navigate(dest, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, location.pathname, location.search, isStudentLoginRoute]);

  const completeAuthAndNavigate = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication failed");

    const finish = await finishPortalLoginAfterAuth(supabase, user, {
      isCollegeLoginRoute,
      isReferralLoginRoute,
      isAdminLoginRoute,
    });
    if (!finish.ok) {
      toast.error(finish.message);
      return;
    }

    if (finish.destination.includes("payment=required") || finish.paymentWarning) {
      toast.message(
        "Your dashboard stays locked until payment. Use Pay fee in the menu anytime — you can keep browsing now."
      );
    } else {
      toast.success("Welcome back!");
    }

    if (isStaffPortalLogin || finish.destination === "/admin" || finish.destination === "/staff-dashboard") {
      await establishAdminAuthSession(supabase);
    }

    navigate(finish.destination);
  };

  const sendAdminLoginOtp = async (targetEmail: string) => {
    setAdminOtpSending(true);
    try {
      const sent = await requestAdminLoginOtp(supabase, targetEmail);
      if (!sent.ok) throw sent.error;
      const devCode =
        sent.devOtp ??
        (typeof window !== "undefined" ? window.sessionStorage.getItem("admin_login_otp") : null);
      setAdminDevOtp(devCode);
      setAdminOtpSent(true);
      if (sent.devOtp) {
        toast.info(`Verification code: ${sent.devOtp}`, { duration: 30000 });
      }
      toast.success(`Verification code sent to ${sent.email}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send verification code";
      toast.error(msg);
    } finally {
      setAdminOtpSending(false);
    }
  };

  const handleAdminOtpVerify = async () => {
    if (adminOtp.length !== 6) {
      toast.error("Enter the 6-digit code from your email");
      return;
    }
    if (!captchaVerified) {
      toast.error("Please verify you are human");
      return;
    }
    setLoginLoading(true);
    try {
      const valid = await verifyAdminLoginOtp(supabase, adminPendingEmail, adminOtp);
      if (!valid) {
        throw new Error("Invalid or expired code. Tap Resend code and try again.");
      }
      const signIn = await signInStudentWithPassword(
        supabase,
        adminPendingEmail,
        adminPendingPassword
      );
      if (!signIn.ok) throw signIn.error;
      setAdminPendingPassword("");
      await completeAuthAndNavigate();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Verification failed";
      toast.error(msg);
    } finally {
      setLoginLoading(false);
    }
  };

  const sendStudentLoginOtp = async (targetEmail: string) => {
    setStudentOtpSending(true);
    try {
      const sent = await requestStudentLoginOtp(supabase, targetEmail);
      if (!sent.ok) throw sent.error;
      setStudentOtpEmail(sent.email);
      if (typeof window !== "undefined" && window.location.hostname === "localhost") {
        const devOtp = sessionStorage.getItem("student_login_otp");
        if (devOtp) toast.info(`Dev login code: ${devOtp}`);
      }
      setStudentOtpSent(true);
      toast.success(`Login code sent to ${sent.email}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send login code";
      toast.error(msg);
    } finally {
      setStudentOtpSending(false);
    }
  };

  const offerStudentOtpFallback = (normalizedEmail: string) => {
    setStudentOtpEmail(normalizedEmail);
    setStudentOtp("");
    setStudentOtpSent(false);
    setStudentLoginStep("otp");
    toast.message(
      "Password did not match. Tap Send login code to get a one-time code by email (no email sent until you tap)."
    );
  };

  const handleStudentOtpVerify = async () => {
    if (studentOtp.length !== 6) {
      toast.error("Enter the 6-digit code from your email");
      return;
    }
    if (!captchaVerified) {
      toast.error("Please verify you are human");
      return;
    }
    setLoginLoading(true);
    try {
      const signIn = await signInStudentWithOtp(supabase, studentOtpEmail, studentOtp);
      if (!signIn.ok) throw signIn.error;
      await completeAuthAndNavigate();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Login failed";
      toast.error(msg);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toast.error("Please enter credentials"); return; }
    if (!isReferralLoginRoute && !captchaVerified) { toast.error("Please verify you are human"); return; }
    setLoginLoading(true);
    try {
      const rawInput = email.trim();
      const digitsOnly = rawInput.replace(/\D/g, "");
      if ((isReferralLoginRoute || isCollegeLoginRoute) && digitsOnly.length >= 10 && !rawInput.includes("@")) {
        toast.error("Please sign in with the email address on your invitation (not a phone number).");
        return;
      }

      let normalizedEmail = rawInput.toLowerCase();
      if (isStudentLoginRoute || !rawInput.includes("@")) {
        const resolved = await resolveLoginIdentifier(supabase, rawInput);
        if (!resolved.ok) {
          throw new Error(resolved.message);
        }
        normalizedEmail = resolved.email;
      }

      // One portal-route check only (hits local /rest/v1/rpc when VITE_SUPABASE_URL=localhost).
      if (isCollegeLoginRoute) {
        const { data: mayCollege, error: collegeRpcErr } = await supabase.rpc(
          "account_may_use_college_login",
          { check_email: normalizedEmail }
        );
        if (collegeRpcErr) {
          console.warn("account_may_use_college_login RPC:", collegeRpcErr.message);
        } else if (mayCollege !== true) {
          toast.error(
            "No college administrator account found for this email. Students use the main sign-in; staff use the admin portal."
          );
          return;
        }
      } else if (isReferralLoginRoute) {
        const { data: mayRef, error: refRpcErr } = await supabase.rpc(
          "account_may_use_referral_login",
          { check_email: normalizedEmail }
        );
        if (refRpcErr) {
          console.warn("account_may_use_referral_login RPC:", refRpcErr.message);
        } else if (mayRef !== true) {
          toast.error(
            "No referral promoter account found for this email. Use the promoter sign-in link you received, or contact Apna Intern support."
          );
          return;
        }
      } else if (!isAdminLoginRoute) {
        const { data: needsAdminRoute, error: routeRpcErr } = await supabase.rpc(
          "account_requires_admin_login",
          { check_email: normalizedEmail }
        );
        if (routeRpcErr) {
          console.warn("account_requires_admin_login RPC:", routeRpcErr.message);
        } else if (needsAdminRoute === true) {
          toast.error(
            "You don't have access to the student portal. This sign-in is only for enrolled students."
          );
          return;
        }
      } else {
        const { data: studentOnly, error: studentRpcErr } = await supabase.rpc(
          "account_is_student_only",
          { check_email: normalizedEmail }
        );
        if (studentRpcErr) {
          console.warn("account_is_student_only RPC:", studentRpcErr.message);
        } else if (studentOnly === true) {
          toast.error(
            "You don't have access to the admin portal. This sign-in is only for authorised staff and administrators."
          );
          return;
        }
      }

      if (isStudentLoginRoute) {
        const attempt = await attemptStudentPasswordLoginBeforeOtp(
          supabase,
          normalizedEmail,
          password
        );
        if (attempt.status === "ok") {
          await completeAuthAndNavigate();
          return;
        }
        if (attempt.status === "otp") {
          offerStudentOtpFallback(normalizedEmail);
          return;
        }
        throw attempt.error;
      }

      if (isStaffPortalLogin) {
        const signIn = await signInStudentWithPassword(supabase, normalizedEmail, password);
        if (!signIn.ok) {
          const msg = String(signIn.error.message || "");
          throw new Error(
            msg.includes("invalid login credentials") || msg.includes("invalid credentials")
              ? "Invalid credentials. Check your email and password."
              : msg
          );
        }
        await supabase.auth.signOut();
        setAdminPendingEmail(normalizedEmail);
        setAdminPendingPassword(password);
        setAdminOtp("");
        setAdminOtpSent(false);
        setAdminLoginStep("otp");
        await sendAdminLoginOtp(normalizedEmail);
        return;
      }

      const signIn = await signInStudentWithPassword(supabase, normalizedEmail, password);
      if (!signIn.ok) {
        const msg = String(signIn.error.message || "");
        throw new Error(
          msg.includes("invalid login credentials") || msg.includes("invalid credentials")
            ? "Invalid credentials. Use the exact email and password from your registration email (no extra spaces). Try Forgot password if needed."
            : msg
        );
      }
      await completeAuthAndNavigate();
    } catch (error: any) {
      toast.error(error.message || "Login failed");
    } finally {
      setLoginLoading(false);
    }
  };

  /* PIN login disabled — restore if re-enabled (needs pendingPin / pendingRoute / pendingUserId state again):
  const handleVerifyPin = async () => {
    if (pendingPin.length !== 4) return;
    setLoginLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_security")
        .select("security_pin")
        .eq("user_id", pendingUserId)
        .maybeSingle();

      if (error) {
        console.error("PIN Fetch Error:", error);
        throw new Error("Unable to verify security code. Please contact support.");
      }

      if (data?.security_pin === pendingPin) {
        toast.success("Welcome back!");
        navigate(pendingRoute);
      } else {
        toast.error("Incorrect security code");
        setPendingPin("");
      }
    } catch (err: any) {
      toast.error(err.message || "Verification failed");
      console.error("Verification error:", err);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSaveNewPin = async () => {
    if (pendingPin.length !== 4) return;
    setLoginLoading(true);
    try {
      const { error } = await supabase
        .from("user_security")
        .upsert({ user_id: pendingUserId, security_pin: pendingPin });
      if (error) throw error;
      toast.success("Security code created! Welcome.");
      navigate(pendingRoute);
    } catch (err: any) {
      toast.error(err.message || "Failed to save security code");
    } finally {
      setLoginLoading(false);
    }
  };
  */

  const handleCheckEmailForReset = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!resetEmail) {
      toast.error("Please enter your email");
      return;
    }
    setResetLoading(true);
    try {
      const identifierInput = resetEmail.trim();
      const resolved = await resolveLoginIdentifier(supabase, identifierInput);
      if (!resolved.ok) {
        throw new Error(resolved.message);
      }
      const normalizedEmail = resolved.email;
      setResetEmail(normalizedEmail);

      const { data: registered, error: regErr } = await supabase.rpc(
        'auth_email_registered_for_reset',
        { p_identifier: identifierInput }
      );
      if (regErr) {
        const msg = String(regErr.message || '').toLowerCase();
        if (msg.includes('could not find') || regErr.code === 'PGRST202') {
          throw new Error(
            `Password reset RPC missing. ${PASSWORD_RESETS_SCHEMA_HINT}`
          );
        }
        throw regErr;
      }
      if (!registered) {
        throw new Error(
          resolved.usedPhone
            ? 'No account found for this phone number. It must match the mobile on your profile.'
            : 'No account found for this email. Use the same email you use to sign in.'
        );
      }

      const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

      // Store OTP via local /rest → RDS (awsrds) or hosted PostgREST; email via /api/send-mail.
      const { error: insertError } = await supabase
        .from('password_resets')
        .insert(passwordResetInsertRow(normalizedEmail, generatedOtp));

      if (!insertError) {
        const response = await fetch(getSendMailApiUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send_otp',
            otp: generatedOtp,
            to: normalizedEmail,
            email: normalizedEmail,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
          const detail = [result.message, result.error].filter(Boolean).join(' ');
          throw new Error(detail || 'Failed to send OTP');
        }
      } else {
        // Optional: server inserts OTP + sends mail if SUPABASE_SERVICE_ROLE_KEY is configured.
        const serverRes = await fetch(siteApiUrl('/api/auth/forgot-password'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'request_otp', email: normalizedEmail }),
        });
        const serverJson = await serverRes.json().catch(() => ({}));
        if (!serverRes.ok || !serverJson.success) {
          throw new Error(
            [
              insertError.message,
              serverJson.message,
              serverJson.hint,
              PASSWORD_RESETS_SCHEMA_HINT,
            ]
              .filter(Boolean)
              .join(' ')
          );
        }
      }

      toast.success(
        resolved.usedPhone
          ? `OTP sent to ${normalizedEmail} (email linked to this phone).`
          : resolved.usedRegistrationId
            ? `OTP sent to ${normalizedEmail} (email linked to this registration / roll no.).`
            : 'OTP sent to your email.'
      );
      setResetStep("otp");
    } catch (error: any) {
      toast.error(error.message || 'Failed to send OTP');
    } finally {
      setResetLoading(false);
    }
  };

  const handleVerifyResetOtp = async () => {
    const otp = resetOtp.trim();
    if (otp.length !== 6) {
      toast.error("Please enter your 6-digit OTP");
      return;
    }
    setResetLoading(true);
    try {
      const { data: valid, error: verifyErr } = await supabase.rpc('verify_password_reset_otp', {
        p_identifier: resetEmail.trim(),
        p_otp: otp,
      });
      if (verifyErr) throw verifyErr;
      if (!valid) {
        throw new Error('Invalid or expired OTP. Request a new code and try again.');
      }
      setResetOtp(otp);
      setResetStep("password");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'OTP verification failed';
      toast.error(message);
    } finally {
      setResetLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (newPassword.length < REGISTRATION_PASSWORD_MIN_LENGTH) {
      toast.error(`Password must be at least ${REGISTRATION_PASSWORD_MIN_LENGTH} characters`);
      return;
    }
    setResetLoading(true);
    try {
      const { data: rpcOk, error: rpcError } = await supabase.rpc('reset_user_password', {
        p_identifier: resetEmail.trim(),
        p_otp: resetOtp.trim(),
        p_new_password: newPassword.trim(),
      });

      if (rpcError) {
        const msg = String(rpcError.message || '').toLowerCase();
        const rpcMissing =
          msg.includes('could not find') ||
          msg.includes('404') ||
          msg.includes('not found') ||
          rpcError.code === 'PGRST202';

        if (rpcMissing) {
          throw new Error(
            `Password reset RPC missing. ${PASSWORD_RESETS_SCHEMA_HINT}`
          );
        }
        throw rpcError;
      }

      if (!rpcOk) {
        throw new Error('Invalid/expired OTP or user not found.');
      }

      toast.success("Password updated successfully! You can now login.");
      setShowResetDialog(false);
      setResetStep("email");
      setResetEmail("");
      setResetOtp("");
      setNewPassword("");
    } catch (error: unknown) {
      toast.error(userFacingPasswordError(error));
    } finally {
      setResetLoading(false);
    }
  };

  const openResetDialog = () => {
    setResetEmail(email);
    setResetStep("email");
    setResetOtp("");
    setNewPassword("");
    setShowResetDialog(true);
  };

  // ─── Forgot PIN handlers ───────────────────────────────────────────────────
  const handleForgotPinSendOtp = async () => {
    const normalizedEmail = forgotPinEmail.trim().toLowerCase();
    if (!normalizedEmail) { toast.error("Please enter your email"); return; }
    setForgotPinLoading(true);
    try {
      const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
      const { error: insertError } = await supabase
        .from("password_resets")
        .insert(passwordResetInsertRow(normalizedEmail, generatedOtp));

      if (!insertError) {
        sessionStorage.setItem("fp_otp", generatedOtp);
        sessionStorage.setItem("fp_email", normalizedEmail);
        const response = await fetch(getSendMailApiUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "login_otp",
            otp: generatedOtp,
            to: normalizedEmail,
            email: normalizedEmail,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
          // SMTP can hit 429. Fall back to server-side OTP generation + delivery.
          const serverRes = await fetch(siteApiUrl("/api/auth/forgot-password"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "request_otp", email: normalizedEmail }),
          });
          const serverJson = await serverRes.json().catch(() => ({}));
          if (!serverRes.ok || !serverJson.success) {
            throw new Error(
              [result.message, result.error, serverJson.message, serverJson.hint]
                .filter(Boolean)
                .join(" ") || "Failed to send OTP"
            );
          }
          setForgotPinOtpMode("server");
          sessionStorage.removeItem("fp_otp");
          sessionStorage.setItem("fp_email", normalizedEmail);
          toast.success("OTP sent! Check your email.");
          setForgotPinStep("otp");
          return;
        }

        setForgotPinOtpMode("client");
        toast.success("OTP sent! Check your email.");
        setForgotPinStep("otp");
        return;
      }

      const serverRes = await fetch(siteApiUrl("/api/auth/forgot-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_otp", email: normalizedEmail }),
      });
      const serverJson = await serverRes.json().catch(() => ({}));
      if (!serverRes.ok || !serverJson.success) {
        throw new Error(
          [insertError.message, serverJson.message, serverJson.hint]
            .filter(Boolean)
            .join(" ") || "Failed to send OTP"
        );
      }
      setForgotPinOtpMode("server");
      sessionStorage.removeItem("fp_otp");
      sessionStorage.setItem("fp_email", normalizedEmail);
      toast.success("OTP sent! Check your email.");
      setForgotPinStep("otp");
    } catch (err: any) {
      if (window.location.hostname === 'localhost') {
        const devOtp = sessionStorage.getItem("fp_otp");
        toast.info(`Dev OTP: ${devOtp}`);
        setForgotPinOtpMode("client");
        setForgotPinStep("otp");
      } else {
        toast.error(err.message || "Failed to send OTP");
      }
    } finally {
      setForgotPinLoading(false);
    }
  };

  const handleForgotPinVerifyOtp = () => {
    if (forgotPinOtp.length !== 6) { toast.error("Enter the 6-digit code"); return; }
    const verify = async () => {
      if (forgotPinOtpMode === "server") {
        const { data: valid, error } = await supabase.rpc("verify_password_reset_otp", {
          p_identifier: forgotPinEmail.trim(),
          p_otp: forgotPinOtp.trim(),
        });
        if (error) throw error;
        if (!valid) throw new Error("Invalid or expired OTP");
      } else {
        const expected = sessionStorage.getItem("fp_otp");
        const storedEmail = sessionStorage.getItem("fp_email");
        if (forgotPinOtp !== expected || forgotPinEmail.trim().toLowerCase() !== storedEmail) {
          throw new Error("Invalid or expired OTP");
        }
      }
      sessionStorage.removeItem("fp_otp");
      sessionStorage.removeItem("fp_email");
      setForgotPinStep("new_pin");
      toast.success("OTP verified! Set your new PIN.");
    };
    void verify().catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : "Invalid or expired OTP";
      toast.error(msg);
    });
  };

  const handleForgotPinSave = async () => {
    if (forgotPinNew.length !== 4) return;
    setForgotPinLoading(true);
    try {
      // OTP was verified client-side. Look up user_id by email across user tables.
      const normalizedEmail = forgotPinEmail.trim().toLowerCase();
      const [studRes, cafeRes] = await Promise.all([
        supabase.from('students').select('id').ilike('email', normalizedEmail).maybeSingle(),
        supabase.from('cybercafe_profiles').select('id').ilike('email', normalizedEmail).maybeSingle(),
      ]);
      const userId = studRes.data?.id || cafeRes.data?.id;
      if (!userId) throw new Error("Could not find user with that email. Please contact support.");

      const { error } = await supabase.from('user_security').upsert({ user_id: userId, security_pin: forgotPinNew });
      if (error) throw error;

      toast.success("PIN reset successfully! You can now log in with your new PIN.");
      setShowForgotPinDialog(false);
      setForgotPinStep("email");
      setForgotPinEmail("");
      setForgotPinOtp("");
      setForgotPinNew("");
      setForgotPinOtpMode("client");
    } catch (err: any) {
      toast.error(err.message || "Failed to reset PIN");
    } finally {
      setForgotPinLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteNav />
      <NoticePopup page="login" />
      <main className="flex-1 gradient-soft py-12 md:py-20">
        <div className="container mx-auto px-4">
          <Card
            className={
              isReferralLoginRoute
                ? "max-w-md mx-auto p-7 md:p-8 shadow-elegant animate-fade-in-up border border-slate-200/80"
                : "max-w-md mx-auto p-8 md:p-10 shadow-elegant animate-fade-in-up"
            }
          >
            <div className="flex justify-center mb-8">
              <Link to="/" className="block">
                <img
                  src="/logo-full.png"
                  alt="Apna Intern"
                  className="h-28 w-auto object-contain"
                />
              </Link>
            </div>
            <div className="text-center mb-8">
              <h1
                className={
                  isReferralLoginRoute
                    ? "text-2xl font-bold tracking-tight text-slate-900 mb-2"
                    : "text-3xl font-black tracking-tight text-slate-900 mb-2"
                }
              >
                {isCyberCafeLoginRoute
                  ? "Cyber café sign-in"
                  : isCollegeLoginRoute
                  ? "College portal sign-in"
                  : isReferralLoginRoute
                  ? "Referral sign-in"
                  : isAdminLoginRoute
                  ? "Admin & partner sign-in"
                  : "Student sign-in"}
              </h1>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">
                {isCyberCafeLoginRoute
                  ? "Sign in to your cyber café partner dashboard"
                  : isCollegeLoginRoute
                  ? "Use the email and College Admin ID from your invitation email"
                  : isReferralLoginRoute
                  ? "Enter the email and login ID from your invitation to see who registered with your referral link."
                  : isAdminLoginRoute
                  ? "For administrators, sub-admins, staff, and cyber café partners"
                  : "For enrolled students (intern dashboard)"}
              </p>
            </div>

            {isStaffPortalLogin && adminLoginStep === "otp" ? (
              <div className="space-y-5">
                <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-slate-700 leading-relaxed">
                  Password verified for{" "}
                  <span className="font-semibold text-slate-900">{adminPendingEmail}</span>.
                  {adminOtpSent ? (
                    <> Enter the <strong>6-digit code</strong> sent to that inbox.</>
                  ) : (
                    <> Sending verification code…</>
                  )}
                </div>
                {adminDevOtp ? (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                    <p className="font-bold text-xs uppercase tracking-wide text-amber-800 mb-1">
                      {isLocalDev ? "Local testing only" : "Email pending — use code below"}
                    </p>
                    <p>
                      Your verification code:{" "}
                      <span className="font-mono text-lg font-black tracking-[0.2em]">{adminDevOtp}</span>
                    </p>
                  </div>
                ) : null}
                <div className="flex flex-col items-center gap-4">
                  <InputOTP
                    maxLength={6}
                    value={adminOtp}
                    onChange={setAdminOtp}
                    onComplete={() => void handleAdminOtpVerify()}
                  >
                    <InputOTPGroup className="gap-2">
                      <InputOTPSlot index={0} className="size-12 text-xl rounded-xl border-2 border-primary/40 font-black" />
                      <InputOTPSlot index={1} className="size-12 text-xl rounded-xl border-2 border-primary/40 font-black" />
                      <InputOTPSlot index={2} className="size-12 text-xl rounded-xl border-2 border-primary/40 font-black" />
                      <InputOTPSlot index={3} className="size-12 text-xl rounded-xl border-2 border-primary/40 font-black" />
                      <InputOTPSlot index={4} className="size-12 text-xl rounded-xl border-2 border-primary/40 font-black" />
                      <InputOTPSlot index={5} className="size-12 text-xl rounded-xl border-2 border-primary/40 font-black" />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <div
                  className={`flex items-center gap-4 p-4 border rounded-xl transition-all cursor-pointer select-none bg-slate-50 shadow-inner
                    ${captchaVerified ? "border-green-400 bg-green-50/50" : "border-slate-200 hover:border-primary/50"}
                  `}
                  onClick={handleVerifyCaptcha}
                >
                  <div className={`flex items-center justify-center size-8 rounded border transition-all ${captchaVerified ? "bg-green-500 border-green-500" : verifyingCaptcha ? "border-transparent" : "bg-white border-slate-300"}`}>
                    {verifyingCaptcha ? (
                      <Loader2 className="size-5 text-primary animate-spin" />
                    ) : captchaVerified ? (
                      <svg className="size-5 text-white animate-fade-in" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    ) : null}
                  </div>
                  <span className={`text-sm font-bold ${captchaVerified ? "text-green-700" : "text-slate-600"}`}>
                    {verifyingCaptcha ? "Verifying..." : captchaVerified ? "Success!" : "Verify you are human"}
                  </span>
                </div>
                <Button
                  type="button"
                  className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-black rounded-xl shadow-glow transition-all disabled:opacity-50"
                  disabled={loginLoading || adminOtpSending || !captchaVerified || adminOtp.length !== 6}
                  onClick={() => void handleAdminOtpVerify()}
                >
                  {loginLoading ? <Loader2 className="size-5 animate-spin mr-2" /> : null}
                  Verify code & sign in
                </Button>
                <div className="flex flex-col items-center gap-2 text-center">
                  <button
                    type="button"
                    className="text-xs font-bold text-primary hover:underline disabled:opacity-50"
                    disabled={adminOtpSending}
                    onClick={() => void sendAdminLoginOtp(adminPendingEmail)}
                  >
                    {adminOtpSending ? "Sending…" : "Resend code"}
                  </button>
                  <button
                    type="button"
                    className="text-xs font-bold text-slate-500 hover:underline"
                    onClick={() => {
                      setAdminLoginStep("password");
                      setAdminPendingPassword("");
                      setAdminOtp("");
                      setAdminOtpSent(false);
                      setAdminDevOtp(null);
                    }}
                  >
                    Back to password sign-in
                  </button>
                </div>
              </div>
            ) : isStudentLoginRoute && studentLoginStep === "otp" ? (
              <div className="space-y-5">
                <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-slate-700 leading-relaxed">
                  {studentOtpSent ? (
                    <>
                      Enter the <strong>6-digit code</strong> sent to{" "}
                      <span className="font-semibold text-slate-900">{studentOtpEmail || email}</span>.
                    </>
                  ) : (
                    <>
                      Password sign-in did not work for{" "}
                      <span className="font-semibold text-slate-900">{studentOtpEmail || email}</span>.
                      Tap below to email a one-time login code (nothing is sent until you tap).
                    </>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-slate-500 ml-1">
                    Email
                  </Label>
                  <Input
                    type="email"
                    className="h-12 bg-slate-50 border-none shadow-inner rounded-xl pl-4"
                    value={studentOtpEmail || email}
                    onChange={(e) => setStudentOtpEmail(e.target.value.trim().toLowerCase())}
                    placeholder="you@example.com"
                    required
                  />
                </div>
                {!studentOtpSent ? (
                  <Button
                    type="button"
                    className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-black rounded-xl shadow-glow transition-all disabled:opacity-50"
                    disabled={studentOtpSending || !(studentOtpEmail || email).includes("@")}
                    onClick={() => void sendStudentLoginOtp(studentOtpEmail || email)}
                  >
                    {studentOtpSending ? <Loader2 className="size-5 animate-spin mr-2" /> : null}
                    Send login code to email
                  </Button>
                ) : (
                  <>
                    <div className="flex flex-col items-center gap-4">
                      <InputOTP
                        maxLength={6}
                        value={studentOtp}
                        onChange={setStudentOtp}
                        onComplete={() => void handleStudentOtpVerify()}
                      >
                        <InputOTPGroup className="gap-2">
                          <InputOTPSlot index={0} className="size-12 text-xl rounded-xl border-2 border-primary/40 font-black" />
                          <InputOTPSlot index={1} className="size-12 text-xl rounded-xl border-2 border-primary/40 font-black" />
                          <InputOTPSlot index={2} className="size-12 text-xl rounded-xl border-2 border-primary/40 font-black" />
                          <InputOTPSlot index={3} className="size-12 text-xl rounded-xl border-2 border-primary/40 font-black" />
                          <InputOTPSlot index={4} className="size-12 text-xl rounded-xl border-2 border-primary/40 font-black" />
                          <InputOTPSlot index={5} className="size-12 text-xl rounded-xl border-2 border-primary/40 font-black" />
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    <div
                      className={`flex items-center gap-4 p-4 border rounded-xl transition-all cursor-pointer select-none bg-slate-50 shadow-inner
                        ${captchaVerified ? "border-green-400 bg-green-50/50" : "border-slate-200 hover:border-primary/50"}
                      `}
                      onClick={handleVerifyCaptcha}
                    >
                      <div className={`flex items-center justify-center size-8 rounded border transition-all ${captchaVerified ? "bg-green-500 border-green-500" : verifyingCaptcha ? "border-transparent" : "bg-white border-slate-300"}`}>
                        {verifyingCaptcha ? (
                          <Loader2 className="size-5 text-primary animate-spin" />
                        ) : captchaVerified ? (
                          <svg className="size-5 text-white animate-fade-in" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        ) : null}
                      </div>
                      <span className={`text-sm font-bold ${captchaVerified ? "text-green-700" : "text-slate-600"}`}>
                        {verifyingCaptcha ? "Verifying..." : captchaVerified ? "Success!" : "Verify you are human"}
                      </span>
                    </div>
                    <Button
                      type="button"
                      className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-black rounded-xl shadow-glow transition-all disabled:opacity-50"
                      disabled={loginLoading || studentOtpSending || !captchaVerified || studentOtp.length !== 6}
                      onClick={() => void handleStudentOtpVerify()}
                    >
                      {loginLoading ? <Loader2 className="size-5 animate-spin mr-2" /> : null}
                      Verify code & sign in
                    </Button>
                  </>
                )}
                <div className="flex flex-col items-center gap-2 text-center">
                  {studentOtpSent ? (
                    <button
                      type="button"
                      className="text-xs font-bold text-primary hover:underline disabled:opacity-50"
                      disabled={studentOtpSending}
                      onClick={() => void sendStudentLoginOtp(studentOtpEmail || email)}
                    >
                      {studentOtpSending ? "Sending…" : "Resend code"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="text-xs font-bold text-slate-500 hover:underline"
                    onClick={() => {
                      setStudentLoginStep("password");
                      setStudentOtp("");
                      setStudentOtpSent(false);
                    }}
                  >
                    Back to password sign-in
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label
                    htmlFor="email"
                    className={
                      isReferralLoginRoute || isStudentLoginRoute
                        ? "text-sm font-medium text-slate-700 ml-0.5"
                        : "text-xs font-black uppercase tracking-widest text-slate-500 ml-1"
                    }
                  >
                    {isReferralLoginRoute
                      ? "Email"
                      : isStudentLoginRoute
                        ? "Email, phone, or registration / roll no."
                        : "Email or Phone Number"}
                  </Label>
                  <Input
                    id="email"
                    type="text"
                    placeholder={
                      isReferralLoginRoute
                        ? "you@example.com"
                        : isStudentLoginRoute
                          ? "Email, mobile, EZY/2026/INT/… or roll no."
                          : "Email or 10-digit phone"
                    }
                    className="h-12 bg-slate-50 border-none shadow-inner rounded-xl pl-4"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between ml-0.5">
                    <Label
                      htmlFor="pass"
                      className={
                        isReferralLoginRoute || isStudentLoginRoute
                          ? "text-sm font-medium text-slate-700"
                          : "text-xs font-black uppercase tracking-widest text-slate-500"
                      }
                    >
                      {isCollegeLoginRoute
                        ? "College Admin ID"
                        : isReferralLoginRoute
                        ? "Login ID from your email"
                        : "Password"}
                    </Label>
                    {!isCollegeLoginRoute && !isReferralLoginRoute ? (
                      <button type="button" onClick={openResetDialog} className="text-[10px] font-black uppercase text-primary hover:underline">Forgot?</button>
                    ) : null}
                  </div>
                  <div className="relative">
                    <Input
                      id="pass"
                      type={showPw ? "text" : "password"}
                      className="h-12 bg-slate-50 border-none shadow-inner rounded-xl pl-4 pr-12"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {!isReferralLoginRoute ? (
                <div 
                  className={`flex items-center gap-4 p-4 border rounded-xl transition-all cursor-pointer select-none bg-slate-50 shadow-inner
                    ${captchaVerified ? "border-green-400 bg-green-50/50" : "border-slate-200 hover:border-primary/50"}
                  `}
                  onClick={handleVerifyCaptcha}
                >
                  <div className={`flex items-center justify-center size-8 rounded border transition-all ${captchaVerified ? 'bg-green-500 border-green-500' : verifyingCaptcha ? 'border-transparent' : 'bg-white border-slate-300'}`}>
                    {verifyingCaptcha ? (
                      <Loader2 className="size-5 text-primary animate-spin" />
                    ) : captchaVerified ? (
                      <svg className="size-5 text-white animate-fade-in" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    ) : null}
                  </div>
                  <span className={`text-sm font-bold ${captchaVerified ? "text-green-700" : "text-slate-600"}`}>
                    {verifyingCaptcha ? "Verifying..." : captchaVerified ? "Success!" : "Verify you are human"}
                  </span>
                  <div className="ml-auto opacity-30 flex items-center gap-1">
                    <img src="/logo-icon.png" alt="Security" className="w-5 h-5 grayscale object-contain" />
                    <span className="text-[10px] font-bold uppercase">Protected</span>
                  </div>
                </div>
                ) : null}

                <Button 
                  type="submit" 
                  className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-black rounded-xl shadow-glow transition-all disabled:opacity-50"
                  disabled={loginLoading || (!isReferralLoginRoute && !captchaVerified)}
                >
                  {loginLoading ? <Loader2 className="size-5 animate-spin mr-2" /> : null}
                  {isReferralLoginRoute ? "Sign in" : "Login"}
                </Button>
              </form>
            )}

            {/* PIN steps (create_pin / enter_pin) removed — see handleLogin + commented handlers below */}

            <p className="text-center text-sm text-muted-foreground mt-6 space-y-2">
              {isCollegeLoginRoute ? (
                <span className="block">
                  Student portal?{" "}
                  <Link to={STUDENT_LOGIN_PATH} className="text-primary font-semibold hover:underline">
                    Main sign-in
                  </Link>
                </span>
              ) : isReferralLoginRoute ? (
                <span className="block">
                  Student portal?{" "}
                  <Link to={STUDENT_LOGIN_PATH} className="text-primary font-semibold hover:underline">
                    Main sign-in
                  </Link>
                </span>
              ) : isAdminLoginRoute ? (
                <>
                  <span className="block">
                    Looking for the student portal?{" "}
                    <Link to={STUDENT_LOGIN_PATH} className="text-primary font-semibold hover:underline">
                      Main sign-in
                    </Link>
                  </span>
                </>
              ) : (
                <>
                  <span className="block">
                    New user?{" "}
                    <Link to="/register" className="text-primary font-semibold hover:underline">
                      Register here
                    </Link>
                  </span>
                </>
              )}
            </p>
          </Card>
        </div>
      </main>

      {/* Forgot Password Flow Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-5 text-primary" />
              Reset Password
            </DialogTitle>
            <DialogDescription>
              {resetStep === "email" &&
                (isAdminLoginRoute
                  ? "Enter your work email or registered 10-digit mobile number."
                  : "Enter your email or registered 10-digit mobile number.")}
              {resetStep === "otp" && `Enter the 6-digit OTP sent to ${resetEmail}.`}
              {resetStep === "password" && "Create a new password for your account."}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-6">
            {resetStep === "email" && (
              <form onSubmit={handleCheckEmailForReset} className="space-y-4">
                <div className="space-y-2">
                  <Label>Email, phone, or registration / roll no.</Label>
                  <Input
                    type="text"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="Email, mobile, EZY/… or roll no."
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={resetLoading}>
                  {resetLoading && <Loader2 className="size-4 animate-spin mr-2" />} 
                  Continue
                </Button>
              </form>
            )}

            {resetStep === "otp" && (
              <div className="flex flex-col items-center justify-center space-y-6">
                <InputOTP maxLength={6} value={resetOtp} onChange={setResetOtp} onComplete={handleVerifyResetOtp}>
                  <InputOTPGroup className="gap-3">
                    <InputOTPSlot index={0} className="size-14 text-2xl rounded-xl border-2 border-primary/40 font-black" />
                    <InputOTPSlot index={1} className="size-14 text-2xl rounded-xl border-2 border-primary/40 font-black" />
                    <InputOTPSlot index={2} className="size-14 text-2xl rounded-xl border-2 border-primary/40 font-black" />
                    <InputOTPSlot index={3} className="size-14 text-2xl rounded-xl border-2 border-primary/40 font-black" />
                    <InputOTPSlot index={4} className="size-14 text-2xl rounded-xl border-2 border-primary/40 font-black" />
                    <InputOTPSlot index={5} className="size-14 text-2xl rounded-xl border-2 border-primary/40 font-black" />
                  </InputOTPGroup>
                </InputOTP>

                <Button
                  className="w-full font-black h-12"
                  onClick={handleVerifyResetOtp}
                  disabled={resetLoading || resetOtp.length !== 6}
                >
                  {resetLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verify OTP & Continue
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  Need to change your email?{" "}
                  <button
                    onClick={() => setResetStep("email")}
                    className="text-primary font-bold hover:underline"
                    disabled={resetLoading}
                  >
                    Go Back
                  </button>
                </p>
              </div>
            )}

            {resetStep === "password" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <div className="relative">
                    <Input 
                      type={showPw ? "text" : "password"} 
                      value={newPassword} 
                      onChange={(e) => setNewPassword(e.target.value)} 
                      placeholder="Min. 6 characters" 
                      required 
                    />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={handleUpdatePassword}
                  disabled={resetLoading || newPassword.length < REGISTRATION_PASSWORD_MIN_LENGTH}
                >
                  {resetLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update Password
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Forgot PIN Dialog */}
      <Dialog open={showForgotPinDialog} onOpenChange={(open) => { setShowForgotPinDialog(open); if (!open) { setForgotPinStep("email"); setForgotPinOtp(""); setForgotPinNew(""); setForgotPinOtpMode("client"); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-5 text-primary" /> Reset Security PIN
            </DialogTitle>
            <DialogDescription>
              {forgotPinStep === "email" && "Enter your registered email. We'll send you a 6-digit OTP to verify."}
              {forgotPinStep === "otp" && `We've sent a 6-digit code to ${forgotPinEmail}. Enter it below.`}
              {forgotPinStep === "new_pin" && "Set your new 4-digit security PIN."}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-6">
            {forgotPinStep === "email" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input
                    type="email"
                    value={forgotPinEmail}
                    onChange={(e) => setForgotPinEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <Button className="w-full h-12 font-black" onClick={handleForgotPinSendOtp} disabled={!forgotPinEmail || forgotPinLoading}>
                  {forgotPinLoading && <Loader2 className="size-4 animate-spin mr-2" />}
                  Send OTP
                </Button>
              </div>
            )}

            {forgotPinStep === "otp" && (
              <div className="flex flex-col items-center gap-6">
                <InputOTP maxLength={6} value={forgotPinOtp} onChange={setForgotPinOtp}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
                <Button className="w-full h-12 font-black" onClick={handleForgotPinVerifyOtp} disabled={forgotPinOtp.length !== 6}>
                  Verify OTP
                </Button>
                <button onClick={handleForgotPinSendOtp} className="text-xs text-primary font-bold hover:underline" disabled={forgotPinLoading}>
                  Resend Code
                </button>
              </div>
            )}

            {forgotPinStep === "new_pin" && (
              <div className="flex flex-col items-center gap-6">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700 font-medium text-center w-full">
                  🔐 Choose a new 4-digit security PIN
                </div>
                <InputOTP maxLength={4} value={forgotPinNew} onChange={setForgotPinNew} onComplete={handleForgotPinSave}>
                  <InputOTPGroup className="gap-3">
                    <InputOTPSlot index={0} className="size-14 text-2xl rounded-xl border-2 border-primary/40 font-black" />
                    <InputOTPSlot index={1} className="size-14 text-2xl rounded-xl border-2 border-primary/40 font-black" />
                    <InputOTPSlot index={2} className="size-14 text-2xl rounded-xl border-2 border-primary/40 font-black" />
                    <InputOTPSlot index={3} className="size-14 text-2xl rounded-xl border-2 border-primary/40 font-black" />
                  </InputOTPGroup>
                </InputOTP>
                <Button className="w-full h-12 font-black" onClick={handleForgotPinSave} disabled={forgotPinNew.length !== 4 || forgotPinLoading}>
                  {forgotPinLoading && <Loader2 className="size-4 animate-spin mr-2" />}
                  Save New PIN
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <SiteFooter />
    </div>
  );
};

export default Login;
