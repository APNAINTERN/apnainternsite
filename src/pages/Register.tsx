// Deploy refresh marker — no functional change (2026-07-08, pass 2).
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RegistrationForm } from "@/components/RegistrationForm";
import { UnpaidStudentPaymentPanel } from "@/components/UnpaidStudentPaymentPanel";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Card } from "@/components/ui/card";
import { NoticePopup } from "@/components/NoticePopup";
import { captureReferralFromUrl, logReferralClickFromUrl } from "@/lib/referral";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const Register = () => {
  const [searchParams] = useSearchParams();
  const paymentRequired = searchParams.get("payment") === "required";
  const purpose = String(searchParams.get("purpose") || "").trim();
  const [showPayPanel, setShowPayPanel] = useState(false);
  const [checking, setChecking] = useState(paymentRequired);

  useEffect(() => {
    captureReferralFromUrl();
    logReferralClickFromUrl(supabase);
  }, []);

  useEffect(() => {
    if (!paymentRequired) {
      setShowPayPanel(false);
      setChecking(false);
      return;
    }
    let cancelled = false;
    setChecking(true);
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      // Logged-in unpaid students get payment-only UI (not full registration form).
      setShowPayPanel(Boolean(user?.id));
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [paymentRequired]);

  const payTitle =
    purpose === "course_purchase"
      ? "Course Payment"
      : purpose === "internship_upgrade"
        ? "Unlock Internship"
        : "Complete Payment";
  const paySubtitle =
    purpose === "course_purchase"
      ? "Pay only the course fee — registration fee is not charged again"
      : purpose === "internship_upgrade"
        ? "Pay the college registration fee to unlock internship services"
        : "Pay the registration fee to unlock your student dashboard";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteNav />
      <NoticePopup page="registration" />
      <main className="flex-1 gradient-soft py-10 md:py-16">
        <div className="container mx-auto px-4">
          <Card className="max-w-3xl mx-auto p-6 md:p-10 shadow-elegant animate-fade-in-up">
            {checking ? (
              <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                <div className="relative">
                  <div
                    className="absolute inset-0 rounded-full bg-primary/15 blur-md scale-110"
                    aria-hidden
                  />
                  <div className="relative size-20 rounded-full border-[3px] border-white bg-white shadow-md overflow-hidden ring-2 ring-primary/25">
                    <img
                      src="/logo-icon.png"
                      alt="Apna Intern"
                      className="size-full object-cover"
                      width={80}
                      height={80}
                    />
                  </div>
                </div>
                <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
                <p className="text-sm text-muted-foreground">Checking your account…</p>
              </div>
            ) : showPayPanel ? (
              <>
                <div className="text-center mb-6">
                  <div className="relative mx-auto mb-4 w-fit">
                    <div
                      className="absolute inset-0 rounded-full bg-primary/15 blur-md scale-110"
                      aria-hidden
                    />
                    <div className="relative size-20 rounded-full border-[3px] border-white bg-white shadow-md overflow-hidden ring-2 ring-primary/25">
                      <img
                        src="/logo-icon.png"
                        alt="Apna Intern"
                        className="size-full object-cover"
                        width={80}
                        height={80}
                      />
                    </div>
                  </div>
                  <h1 className="text-3xl md:text-4xl font-bold mb-1">{payTitle}</h1>
                  <p className="text-sm text-muted-foreground">{paySubtitle}</p>
                </div>
                <UnpaidStudentPaymentPanel />
              </>
            ) : (
              <RegistrationForm />
            )}
          </Card>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default Register;
