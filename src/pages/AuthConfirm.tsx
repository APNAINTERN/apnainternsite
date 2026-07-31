import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, CheckCircle2 } from "lucide-react";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { AUTH_CONFIRM_PATH } from "@/lib/authPaths";
import { STUDENT_LOGIN_PATH } from "@/lib/authRoutes";
import { escapeBlockedHostIfNeeded } from "@/lib/authRedirectGuard";
import { resolveDashboardPath } from "@/lib/resolveDashboardPath";
import { toast } from "sonner";

/**
 * Landing page for Supabase email confirmation links (`emailRedirectTo`).
 * Replaces the old Lovable-hosted Site URL redirect.
 */
const AuthConfirm = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    const finish = async () => {
      if (escapeBlockedHostIfNeeded()) return;

      const params = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(
        (window.location.hash || "").replace(/^#/, "")
      );

      const authError =
        params.get("error_description") ||
        params.get("error") ||
        hashParams.get("error_description") ||
        hashParams.get("error");
      if (authError) {
        if (!cancelled) {
          setStatus("error");
          toast.error(decodeURIComponent(authError.replace(/\+/g, " ")));
          navigate(STUDENT_LOGIN_PATH, { replace: true });
        }
        return;
      }

      const code = params.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          if (!cancelled) {
            setStatus("error");
            toast.error(error.message || "Verification link expired");
            navigate(STUDENT_LOGIN_PATH, { replace: true });
          }
          return;
        }
        window.history.replaceState({}, document.title, AUTH_CONFIRM_PATH);
      }

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (cancelled) return;

      if (sessionError || !session?.user) {
        setStatus("error");
        toast.error("Invalid or expired verification link. Sign in or register again.");
        navigate(STUDENT_LOGIN_PATH, { replace: true });
        return;
      }

      setStatus("ok");
      toast.success("Email verified successfully.");
      const dest = await resolveDashboardPath(session.user);
      navigate(dest, { replace: true });
    };

    finish();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteNav />
      <main className="flex-1 gradient-soft py-12 md:py-20">
        <div className="container mx-auto px-4">
          <Card className="max-w-md mx-auto p-8 md:p-10 shadow-elegant text-center space-y-4">
            {status === "loading" && (
              <>
                <Loader2 className="size-10 text-primary animate-spin mx-auto" />
                <p className="text-slate-600 font-medium">Confirming your email…</p>
              </>
            )}
            {status === "ok" && (
              <>
                <CheckCircle2 className="size-10 text-emerald-600 mx-auto" />
                <p className="text-slate-600 font-medium">Redirecting to your dashboard…</p>
              </>
            )}
            {status === "error" && (
              <p className="text-slate-600 font-medium">Redirecting to sign in…</p>
            )}
          </Card>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default AuthConfirm;
