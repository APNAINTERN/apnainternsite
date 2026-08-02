import { ReactNode, useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { CreditCard, Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BrandLoadingSpinner } from "@/components/BrandLoadingSpinner";
import { loadingMessage } from "@/lib/loadingMessages";
import {
  canAccessStudentDashboard,
  STUDENT_PAYMENT_REQUIRED_PATH,
} from "@/lib/studentPaymentAccess";
import { STUDENT_LOGIN_PATH } from "@/lib/authRoutes";

/**
 * Blocks /dashboard until payment is complete.
 * Unpaid students see a soft gate (pay or leave) — not a forced redirect loop.
 */
export function StudentDashboardGate({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const verifiedUserIdRef = useRef<string | null>(null);
  const allowedCacheRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (authLoading) return;
      if (!user?.id) {
        verifiedUserIdRef.current = null;
        allowedCacheRef.current = false;
        if (!cancelled) {
          setAllowed(false);
          setChecking(false);
        }
        return;
      }

      if (verifiedUserIdRef.current === user.id) {
        if (!cancelled) {
          setAllowed(allowedCacheRef.current);
          setChecking(false);
        }
        return;
      }

      setChecking(true);
      const ok = await canAccessStudentDashboard(supabase, user.id, user.email || undefined);
      if (!cancelled) {
        verifiedUserIdRef.current = user.id;
        allowedCacheRef.current = ok;
        setAllowed(ok);
        setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id, user?.email]);

  if ((authLoading || checking) && verifiedUserIdRef.current !== user?.id) {
    return (
      <BrandLoadingSpinner
        fullScreen
        message={loadingMessage("verifying")}
      />
    );
  }

  if (!user?.id) {
    return <Navigate to={STUDENT_LOGIN_PATH} replace />;
  }

  if (!allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-8 shadow-sm text-center space-y-5">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-amber-50">
            <Lock className="size-6 text-amber-700" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-black text-slate-900">Dashboard locked</h1>
            <p className="text-sm text-slate-600">
              Complete the registration fee to unlock your student dashboard. You can pay now or
              continue browsing the site and pay later.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button asChild className="gap-2 font-bold" size="lg">
              <Link to={STUDENT_PAYMENT_REQUIRED_PATH}>
                <CreditCard className="size-4" /> Pay now
              </Link>
            </Button>
            <Button asChild variant="ghost" size="lg" className="font-semibold text-slate-600">
              <Link to="/">Not now — go to home</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
