import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  canAccessStudentDashboard,
  STUDENT_PAYMENT_REQUIRED_PATH,
} from "@/lib/studentPaymentAccess";
import { clearCoalesce } from "@/lib/requestCoalesce";
import { shouldRunBackgroundPoll } from "@/lib/apiPollingGuard";

const POLL_MS = 5000;
const MAX_ATTEMPTS = 72;

const PaymentStatus = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orderId = searchParams.get("orderId");

  const [status, setStatus] = useState<"pending" | "success" | "failed" | "checking">("checking");
  const [attempts, setAttempts] = useState(0);

  const statusRef = useRef(status);
  statusRef.current = status;
  const attemptRef = useRef(0);

  useEffect(() => {
    if (!orderId) {
      toast.error("Invalid payment session");
      navigate("/register");
      return;
    }

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const checkStatus = async () => {
      try {
        const { data: row, error } = await supabase
          .from("payment_orders")
          .select("status")
          .eq("order_id", orderId)
          .maybeSingle();

        if (cancelled) return;

        if (!error && row) {
          if (row.status === "success") {
            setStatus("success");
            toast.success("Payment verified successfully!");
            if (intervalId) clearInterval(intervalId);
          } else if (row.status === "failed") {
            setStatus("failed");
            if (intervalId) clearInterval(intervalId);
          } else {
            setStatus((s) => (s === "checking" ? "pending" : s));
          }
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    };

    void checkStatus();

    intervalId = setInterval(async () => {
      if (statusRef.current === "success" || statusRef.current === "failed") {
        if (intervalId) clearInterval(intervalId);
        return;
      }
      if (!shouldRunBackgroundPoll()) return;
      attemptRef.current += 1;
      setAttempts(attemptRef.current);
      if (attemptRef.current >= MAX_ATTEMPTS) {
        if (intervalId) clearInterval(intervalId);
        if (statusRef.current !== "success") setStatus("failed");
        return;
      }
      await checkStatus();
    }, POLL_MS);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [orderId, navigate]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteNav />
      <main className="flex-1 gradient-soft flex items-center justify-center py-16">
        <Card className="max-w-md w-full mx-4 p-10 text-center shadow-elegant animate-fade-in-up">
          {status === "checking" || status === "pending" ? (
            <div className="space-y-6">
              <div className="relative mx-auto size-20">
                <Loader2 className="size-20 text-primary animate-spin" />
                <Clock className="absolute inset-0 m-auto size-8 text-primary/40" />
              </div>
              <div>
                <h1 className="text-2xl font-bold mb-2">Verifying Payment...</h1>
                <p className="text-muted-foreground">
                  Please do not refresh or close this window. We are confirming your transaction with the bank.
                </p>
              </div>
              <p className="text-xs text-muted-foreground italic">
                Status check attempt: {attempts + 1}
              </p>
            </div>
          ) : status === "success" ? (
            <div className="space-y-6 animate-fade-in">
              <div className="inline-flex size-16 items-center justify-center rounded-full bg-green-100 mb-4">
                <CheckCircle2 className="size-9 text-green-600" />
              </div>
              <h1 className="text-3xl font-bold">Payment Successful!</h1>
              <p className="text-muted-foreground mb-6">
                Your registration is complete. We've sent your credentials to your email.
              </p>
              <Button
                variant="hero"
                className="w-full"
                onClick={async () => {
                  const {
                    data: { session },
                  } = await supabase.auth.getSession();
                  if (!session?.user?.id) {
                    navigate("/login");
                    return;
                  }
                  clearCoalesce(`access:${session.user.id}`);
                  clearCoalesce(`paid:${session.user.id}`);
                  const ok = await canAccessStudentDashboard(
                    supabase,
                    session.user.id,
                    session.user.email || undefined
                  );
                  navigate(ok ? "/dashboard" : STUDENT_PAYMENT_REQUIRED_PATH);
                }}
              >
                Go to Dashboard
              </Button>
            </div>
          ) : (
            <div className="space-y-6 animate-fade-in">
              <div className="inline-flex size-16 items-center justify-center rounded-full bg-red-100 mb-4">
                <XCircle className="size-9 text-red-600" />
              </div>
              <h1 className="text-3xl font-bold">Payment Failed</h1>
              <p className="text-muted-foreground mb-6">
                Something went wrong with your payment. If money was deducted, it will be refunded within 5-7 business days.
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  variant="hero"
                  className="w-full"
                  onClick={() => navigate("/register")}
                >
                  Try Again
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate("/")}
                >
                  Back to Home
                </Button>
              </div>
            </div>
          )}
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
};

export default PaymentStatus;
