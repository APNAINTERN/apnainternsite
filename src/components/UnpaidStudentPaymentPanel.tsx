import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Lock, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  canAccessStudentDashboard,
  hasInternshipAccess,
  parseStudentAccessScope,
} from "@/lib/studentPaymentAccess";
import { clearCoalesce } from "@/lib/requestCoalesce";
import {
  fetchPublicPaymentConfig,
  runRegistrationRazorpayCheckout,
  normalizePaymentSettings,
} from "@/lib/registrationPayment";
import { DEFAULT_COLLEGE_FEE_PAISE } from "@/lib/collegeFees";
import { formatRupees } from "@/lib/feeRules";
import { STUDENT_LOGIN_PATH } from "@/lib/authRoutes";
import {
  ensureCourseEnrollment,
  fetchDirectoryStudent,
  logPaymentSuccessRow,
  patchStudentAccessScope,
  resolveCollegeFeePaise,
  resolveCourseFeePaise,
  studentAlreadyPaidRegistration,
  type DirectoryStudentLite,
} from "@/lib/courseEnrollmentFlow";
import { getCourseBySlug } from "@/lib/coursesApi";

/**
 * Payment-only screen for:
 * - unpaid Student Data Upload accounts
 * - internship upgrade (course-only → full internship)
 * - add-on course purchase for existing students
 */
export function UnpaidStudentPaymentPanel() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const purpose = String(searchParams.get("purpose") || "unpaid_registration").trim();
  const courseSlug = String(searchParams.get("course") || "").trim();
  const isCoursePurchase = purpose === "course_purchase";
  const isInternshipUpgrade = purpose === "internship_upgrade";

  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [student, setStudent] = useState<DirectoryStudentLite | null>(null);
  const [amountPaise, setAmountPaise] = useState(DEFAULT_COLLEGE_FEE_PAISE);
  const [feeNote, setFeeNote] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [courseTitle, setCourseTitle] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const nextPath = `/register?payment=required${
          purpose ? `&purpose=${encodeURIComponent(purpose)}` : ""
        }${courseSlug ? `&course=${encodeURIComponent(courseSlug)}` : ""}`;
        if (!user?.id) {
          navigate(`${STUDENT_LOGIN_PATH}?next=${encodeURIComponent(nextPath)}`, {
            replace: true,
          });
          return;
        }
        if (cancelled) return;
        setUserId(user.id);

        const row = await fetchDirectoryStudent(supabase, user.id, user.email);
        if (!row) {
          toast.error("Student profile not found. Contact support.");
          return;
        }
        if (cancelled) return;
        setStudent(row);

        const scope = parseStudentAccessScope(row.metadata);

        if (isCoursePurchase && courseSlug) {
          const course = await getCourseBySlug(supabase, courseSlug);
          if (!course) {
            toast.error("Course not found.");
            return;
          }
          setCourseId(course.id);
          setCourseTitle(course.title);
          // Already enrolled → My Courses
          const { data: enr } = await supabase
            .from("course_enrollments")
            .select("id")
            .eq("student_id", user.id)
            .eq("course_id", course.id)
            .neq("status", "cancelled")
            .maybeSingle();
          if (enr?.id) {
            navigate("/dashboard?view=courses", { replace: true });
            return;
          }

          const paidReg = await studentAlreadyPaidRegistration(
            supabase,
            user.id,
            user.email,
            row.metadata
          );
          const fee = resolveCourseFeePaise(course, { alreadyRegisteredPaid: paidReg });
          if (cancelled) return;
          setAmountPaise(fee.amountPaise);
          setFeeNote(fee.note);

          // Free course — enroll without charging registration fee
          if (fee.amountPaise <= 0) {
            await ensureCourseEnrollment(supabase, course.id, user.id);
            const nextScope = hasInternshipAccess(scope) ? "internship" : "course_only";
            await patchStudentAccessScope(supabase, user.id, row.metadata, nextScope, {
              source: "course_free_enroll",
            });
            toast.success("Enrolled successfully!");
            navigate("/dashboard?view=courses", { replace: true });
            return;
          }
        } else if (isInternshipUpgrade) {
          if (hasInternshipAccess(scope)) {
            navigate("/dashboard", { replace: true });
            return;
          }
          const fee = await resolveCollegeFeePaise(
            supabase,
            row.university_name,
            row.college_name
          );
          if (cancelled) return;
          setAmountPaise(fee.amountPaise);
          setFeeNote(fee.note || null);
        } else {
          const alreadyPaid = await canAccessStudentDashboard(
            supabase,
            user.id,
            user.email || undefined
          );
          if (alreadyPaid) {
            navigate("/dashboard", { replace: true });
            return;
          }
          const fee = await resolveCollegeFeePaise(
            supabase,
            row.university_name,
            row.college_name
          );
          if (cancelled) return;
          setAmountPaise(fee.amountPaise);
          setFeeNote(fee.note || null);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not load payment details.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, purpose, courseSlug, isCoursePurchase, isInternshipUpgrade]);

  const handlePay = async () => {
    if (!student || !userId || paying) return;
    setPaying(true);
    try {
      const cfg = await fetchPublicPaymentConfig(supabase);
      const settings = normalizePaymentSettings(cfg);
      if (!settings?.razorpay_key_id) {
        throw new Error("Payment gateway is not configured. Contact support.");
      }

      const result = await runRegistrationRazorpayCheckout({
        paymentSettings: settings,
        amountPaise,
        description: isCoursePurchase
          ? "Course Enrollment Fee"
          : isInternshipUpgrade
            ? "Internship Unlock Fee"
            : "Internship Registration Fee",
        prefill: {
          name: String(student.full_name || "Student"),
          email: String(student.email || ""),
          contact: String(student.contact_number || ""),
        },
        studentData: {
          user_id: userId,
          email: student.email,
          full_name: student.full_name,
          contact_number: student.contact_number,
          university_name: student.university_name,
          college_name: student.college_name,
          registration_id: student.registration_id,
          purpose,
          course_id: courseId,
          course_slug: courseSlug || null,
          source: isCoursePurchase
            ? "course_purchase_payment"
            : isInternshipUpgrade
              ? "internship_upgrade_payment"
              : "unpaid_student_data_upload_payment",
        },
      });

      if (!result.success) {
        if ("cancelled" in result && result.cancelled) {
          toast.message("Payment cancelled. You can try again when ready.");
        } else {
          toast.error(
            "Payment window did not complete. Try a normal Chrome window (not Incognito), allow checkout.razorpay.com, and disable ad blockers."
          );
        }
        return;
      }

      const paymentId = result.payment_id;
      await logPaymentSuccessRow(supabase, {
        user_id: userId,
        payment_id: paymentId,
        amount_paise: amountPaise,
        email: student.email,
        full_name: student.full_name,
        college_name: student.college_name,
        metadata: {
          purpose,
          course_id: courseId,
          course_slug: courseSlug || null,
        },
      });

      if (isInternshipUpgrade) {
        await patchStudentAccessScope(supabase, userId, student.metadata, "internship", {
          razorpay_payment_id: paymentId,
          source: "internship_upgrade_payment",
        });
        toast.success("Payment successful! Internship dashboard unlocked.");
        navigate("/dashboard", { replace: true });
        return;
      }

      if (isCoursePurchase && courseId) {
        const scope = parseStudentAccessScope(student.metadata);
        const nextScope = hasInternshipAccess(scope) ? "internship" : "course_only";
        await patchStudentAccessScope(supabase, userId, student.metadata, nextScope, {
          razorpay_payment_id: paymentId,
          source: "course_purchase_payment",
        });
        await ensureCourseEnrollment(supabase, courseId, userId);
        toast.success("Payment successful! Course unlocked.");
        navigate("/dashboard?view=courses", { replace: true });
        return;
      }

      await patchStudentAccessScope(supabase, userId, student.metadata, "internship", {
        razorpay_payment_id: paymentId,
        source: "unpaid_student_data_upload_payment",
        payment_required: false,
        bulk_upload_paid: true,
      });

      clearCoalesce(`access:${userId}`);
      clearCoalesce(`paid:${userId}`);

      toast.success("Payment successful! Unlocking your dashboard…");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment could not be completed.");
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Preparing payment…</p>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="text-center py-10 space-y-4">
        <p className="text-sm text-muted-foreground">Unable to load your enrollment details.</p>
        <Button variant="outline" onClick={() => navigate(STUDENT_LOGIN_PATH)}>
          Back to login
        </Button>
      </div>
    );
  }

  const amountLabel = formatRupees(amountPaise);
  const headline = isCoursePurchase
    ? `Enroll in ${courseTitle || "course"}`
    : isInternshipUpgrade
      ? "Unlock Internship Dashboard"
      : "Dashboard locked until payment";
  const blurb = isCoursePurchase
    ? "Pay only the course fee mapped to this course. Your internship registration fee is not charged again."
    : isInternshipUpgrade
      ? "Complete payment to unlock internship classes, attendance, documents, and certifications. Your purchased courses stay available."
      : "Your account is active. Complete the registration fee to unlock classes, attendance, assignments, and certificates.";

  return (
    <Card className="border-none shadow-none bg-transparent p-0 space-y-6">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex gap-3">
        <Lock className="size-5 text-amber-700 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-amber-950">{headline}</p>
          <p className="text-sm text-amber-900/80 mt-1">{blurb}</p>
        </div>
      </div>

      <div className="rounded-2xl border bg-slate-50 p-5 space-y-2 text-sm">
        <p>
          <span className="text-slate-500">Name:</span>{" "}
          <span className="font-semibold">{student.full_name || "—"}</span>
        </p>
        <p>
          <span className="text-slate-500">Email:</span>{" "}
          <span className="font-semibold">{student.email || "—"}</span>
        </p>
        <p>
          <span className="text-slate-500">Registration No:</span>{" "}
          <span className="font-semibold font-mono">{student.registration_id || "—"}</span>
        </p>
        <p>
          <span className="text-slate-500">College:</span>{" "}
          <span className="font-semibold">{student.college_name || "—"}</span>
        </p>
      </div>

      <div className="rounded-2xl border bg-white p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Amount due</p>
          <p className="text-3xl font-black text-primary">{amountLabel}</p>
          {feeNote ? <p className="text-xs text-slate-500 mt-1">{feeNote}</p> : null}
        </div>
        <div className="flex flex-col gap-2 w-full sm:w-auto">
          <Button
            size="lg"
            className="gap-2 font-black"
            disabled={paying || amountPaise < 100}
            onClick={() => void handlePay()}
          >
            {paying ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
            {isCoursePurchase
              ? "Pay & Enroll Course"
              : isInternshipUpgrade
                ? "Pay & Unlock Internship"
                : "Pay & Unlock Dashboard"}
          </Button>
          <Button
            type="button"
            size="lg"
            variant="ghost"
            className="font-semibold text-slate-600"
            disabled={paying}
            onClick={() => navigate(isCoursePurchase ? "/courses" : "/", { replace: true })}
          >
            Not now — continue browsing
          </Button>
        </div>
      </div>
    </Card>
  );
}
