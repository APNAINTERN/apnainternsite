import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BookOpen, CreditCard, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { STUDENT_LOGIN_PATH } from "@/lib/authRoutes";
import {
  ensureCourseEnrollment,
  fetchDirectoryStudent,
  logPaymentSuccessRow,
  patchStudentAccessScope,
  resolveCourseFeePaise,
  saveCourseEnrollmentStudentDraft,
  studentAlreadyPaidRegistration,
  type DirectoryStudentLite,
} from "@/lib/courseEnrollmentFlow";
import { formatUnknownError } from "@/lib/formatUnknownError";
import {
  effectiveCoursePrice,
  formatCoursePrice,
  getCourseBySlug,
  isStudentEnrolled,
  type Course,
} from "@/lib/coursesApi";
import { formatRupees } from "@/lib/feeRules";
import { collegesForUniversity, fetchAllCollegesCatalog } from "@/lib/institutionCatalog";
import { fetchPublicUniversities, type PublicUniversity } from "@/lib/registrationCatalog";
import { checkStudentRegistrationAvailable } from "@/lib/registrationAvailability";
import {
  fetchPublicPaymentConfig,
  normalizePaymentSettings,
  runRegistrationRazorpayCheckout,
} from "@/lib/registrationPayment";
import { signUpStudentWithChosenPassword } from "@/lib/registrationPassword";
import {
  hasInternshipAccess,
  parseStudentAccessScope,
} from "@/lib/studentPaymentAccess";
import { clearCoalesce } from "@/lib/requestCoalesce";

const SESSIONS = ["2023-2027", "2024-2028", "2025-2029"];
const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `Semester ${n}`);

type Step = "loading" | "form" | "pay" | "done";

/**
 * Course enroll funnel:
 * - New student → collect details → pay course fee → course_only dashboard
 * - Existing paid/internship student → skip form → pay course fee only (not registration ₹500)
 */
export default function CourseEnroll() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("loading");
  const [course, setCourse] = useState<Course | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [student, setStudent] = useState<DirectoryStudentLite | null>(null);
  const [hasInternship, setHasInternship] = useState(false);
  const [alreadyPaidRegistration, setAlreadyPaidRegistration] = useState(false);
  const [unis, setUnis] = useState<PublicUniversity[]>([]);
  const [colleges, setColleges] = useState<{ id: string; name: string; university_id?: string }[]>([]);
  const [paying, setPaying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [amountPaise, setAmountPaise] = useState(0);
  const [feeNote, setFeeNote] = useState<string | null>(null);

  // Form fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [universityId, setUniversityId] = useState("");
  const [collegeId, setCollegeId] = useState("");
  const [semester, setSemester] = useState("");
  const [session, setSession] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const collegeOptions = useMemo(() => {
    const uni = unis.find((u) => u.id === universityId);
    if (!uni) return [];
    return collegesForUniversity(colleges as any, unis as any, uni.name || "");
  }, [unis, colleges, universityId]);

  const selectedUniName = unis.find((u) => u.id === universityId)?.name || "";
  const selectedCollegeName =
    collegeOptions.find((c) => String((c as any).id) === collegeId)?.name ||
    colleges.find((c) => c.id === collegeId)?.name ||
    "";

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      setStep("loading");
      try {
        const detail = await getCourseBySlug(supabase, slug);
        if (cancelled) return;
        if (!detail) {
          setCourse(null);
          setStep("form");
          return;
        }
        setCourse(detail);

        const [uniRows, collegeRows] = await Promise.all([
          fetchPublicUniversities(supabase),
          fetchAllCollegesCatalog(supabase),
        ]);
        if (cancelled) return;
        setUnis(uniRows);
        setColleges(collegeRows as any);

        const {
          data: { user },
        } = await supabase.auth.getUser();
        const uid = user?.id || null;
        setUserId(uid);

        if (!uid) {
          // Guest: start on form (prefill query if any)
          setEmail(searchParams.get("email") || "");
          setStep("form");
          return;
        }

        const enr = await isStudentEnrolled(supabase, uid, detail.id);
        if (enr) {
          navigate("/dashboard?view=courses", { replace: true });
          return;
        }

        const row = await fetchDirectoryStudent(supabase, uid, user?.email);
        if (row) {
          setStudent(row);
          const scope = parseStudentAccessScope(row.metadata);
          const intern = hasInternshipAccess(scope);
          setHasInternship(intern);
          const paidReg = await studentAlreadyPaidRegistration(
            supabase,
            uid,
            user?.email,
            row.metadata
          );
          if (cancelled) return;
          setAlreadyPaidRegistration(paidReg);

          setFullName(row.full_name || "");
          setEmail(row.email || user?.email || "");
          setPhone(row.contact_number || "");
          setSemester(row.class_semester || "");
          setSession(row.academic_session || "");

          const fee = resolveCourseFeePaise(detail, { alreadyRegisteredPaid: paidReg });
          setAmountPaise(fee.amountPaise);
          setFeeNote(fee.note);

          // Free course + existing account → enroll immediately
          if (fee.amountPaise <= 0) {
            await ensureCourseEnrollment(supabase, detail.id, uid);
            if (!intern) {
              await patchStudentAccessScope(supabase, uid, row.metadata, "course_only", {
                source: "course_free_enroll",
              });
            }
            toast.success("Enrolled successfully!");
            navigate("/dashboard?view=courses", { replace: true });
            return;
          }

          // Existing student: skip form → pay course fee only
          setStep("pay");
          return;
        }

        // Logged in but no directory row — collect form
        setEmail(user?.email || "");
        setStep("form");
      } catch (err) {
        console.warn("[course-enroll] bootstrap failed:", err);
        toast.error("Could not start enrollment.");
        setStep("form");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, navigate, searchParams]);

  const refreshFeeFromForm = async () => {
    if (!course) return 0;
    const fee = resolveCourseFeePaise(course, { alreadyRegisteredPaid: false });
    setAmountPaise(fee.amountPaise);
    setFeeNote(fee.note);
    return fee.amountPaise;
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!course || submitting) return;

    const name = fullName.trim();
    const mail = email.trim().toLowerCase();
    const contact = phone.trim();
    if (!name || !mail || !contact || !universityId || !collegeId || !semester || !session) {
      toast.error("Please fill all required fields.");
      return;
    }
    if (!mail.includes("@")) {
      toast.error("Enter a valid email address.");
      return;
    }

    setSubmitting(true);
    try {
      let uid = userId;

      if (!selectedUniName || !selectedCollegeName) {
        toast.error("Please select a valid university and college.");
        return;
      }

      if (!uid) {
        if (password.length < 8) {
          toast.error("Password must be at least 8 characters.");
          return;
        }
        if (password !== confirmPw) {
          toast.error("Passwords do not match.");
          return;
        }
        const avail = await checkStudentRegistrationAvailable(supabase, mail, contact);
        if (!avail.available) {
          toast.error(avail.message || "This email or phone is already registered. Please log in.");
          return;
        }

        const { userId: newId } = await signUpStudentWithChosenPassword(supabase, supabase, {
          email: mail,
          password,
          fullName: name,
        });
        uid = newId;
        setUserId(newId);
      } else {
        // Logged-in user: ensure session is alive before directory write.
        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session?.access_token) {
          toast.error("Your session expired. Please log in again.");
          navigate(
            `${STUDENT_LOGIN_PATH}?next=${encodeURIComponent(`/courses/${course.slug}/enroll`)}`
          );
          return;
        }
      }

      const feePaise = await refreshFeeFromForm();
      const paymentRequired = feePaise > 0;

      const row = await saveCourseEnrollmentStudentDraft(supabase, {
        userId: uid!,
        email: mail,
        fullName: name,
        phone: contact,
        universityName: selectedUniName,
        collegeName: selectedCollegeName,
        semester,
        session,
        courseId: course.id,
        courseSlug: course.slug,
        courseTitle: course.title,
        paymentRequired,
        signInPassword: password || undefined,
      });

      if (!paymentRequired) {
        await ensureCourseEnrollment(supabase, course.id, uid!);
        clearCoalesce(`access:${uid}`);
        toast.success("Enrolled successfully!");
        navigate("/dashboard?view=courses", { replace: true });
        return;
      }

      setStudent(row);
      setAmountPaise(feePaise);
      setHasInternship(false);
      setAlreadyPaidRegistration(false);
      setStep("pay");
      toast.message("Details saved. Complete payment to enroll.");
    } catch (err) {
      console.error("[course-enroll] save failed:", err);
      toast.error(formatUnknownError(err, "Could not save enrollment details."));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePay = async () => {
    if (!course || !userId || paying) return;
    const row =
      student ||
      (await fetchDirectoryStudent(supabase, userId, email));
    if (!row) {
      toast.error("Student profile not found. Complete the form first.");
      setStep("form");
      return;
    }

    setPaying(true);
    try {
      const paidReg =
        alreadyPaidRegistration ||
        hasInternship ||
        (await studentAlreadyPaidRegistration(supabase, userId, row.email, row.metadata));
      setAlreadyPaidRegistration(paidReg);

      const fee = resolveCourseFeePaise(course, { alreadyRegisteredPaid: paidReg });
      const payAmount = fee.amountPaise;
      setAmountPaise(payAmount);
      setFeeNote(fee.note);

      if (payAmount <= 0) {
        await ensureCourseEnrollment(supabase, course.id, userId);
        const nextScope = hasInternship || paidReg ? "internship" : "course_only";
        await patchStudentAccessScope(supabase, userId, row.metadata, nextScope, {
          source: "course_free_enroll",
        });
        toast.success("Enrolled successfully!");
        navigate("/dashboard?view=courses", { replace: true });
        return;
      }

      const cfg = await fetchPublicPaymentConfig(supabase);
      const settings = normalizePaymentSettings(cfg);
      if (!settings?.razorpay_key_id) {
        throw new Error("Payment gateway is not configured. Contact support.");
      }

      const result = await runRegistrationRazorpayCheckout({
        paymentSettings: settings,
        amountPaise: payAmount,
        description: "Course Enrollment Fee",
        prefill: {
          name: String(row.full_name || fullName || "Student"),
          email: String(row.email || email || ""),
          contact: String(row.contact_number || phone || ""),
        },
        studentData: {
          user_id: userId,
          email: row.email,
          full_name: row.full_name,
          contact_number: row.contact_number,
          university_name: row.university_name,
          college_name: row.college_name,
          registration_id: row.registration_id,
          purpose: "course_purchase",
          course_id: course.id,
          course_slug: course.slug,
          source: "course_enrollment_payment",
          fee_type: "course",
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
        amount_paise: payAmount,
        email: row.email,
        full_name: row.full_name,
        college_name: row.college_name,
        metadata: {
          purpose: "course_purchase",
          course_id: course.id,
          course_slug: course.slug,
        },
      });

      const nextScope = hasInternship ? "internship" : "course_only";
      await patchStudentAccessScope(supabase, userId, row.metadata, nextScope, {
        razorpay_payment_id: paymentId,
        source: hasInternship ? "course_add_on" : "course_enrollment_payment",
        pending_course_id: null,
        pending_course_slug: null,
      });

      await ensureCourseEnrollment(supabase, course.id, userId);

      toast.success("Payment successful! Course unlocked.");
      navigate("/dashboard?view=courses", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment could not be completed.");
    } finally {
      setPaying(false);
    }
  };

  if (step === "loading") {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <SiteNav />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-10 animate-spin text-primary" />
        </div>
        <SiteFooter />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <SiteNav />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          <BookOpen className="size-16 text-slate-300" />
          <h1 className="text-2xl font-black text-slate-800">Course not found</h1>
          <Button asChild className="rounded-xl font-bold">
            <Link to="/courses">Browse Courses</Link>
          </Button>
        </div>
        <SiteFooter />
      </div>
    );
  }

  const catalogPrice = effectiveCoursePrice(course);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteNav />
      <main className="flex-1 py-10 md:py-14">
        <div className="mx-auto max-w-2xl px-4">
          <Card className="p-6 md:p-8 shadow-elegant space-y-6">
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                Course enrollment
              </p>
              <h1 className="text-2xl font-black text-slate-900">{course.title}</h1>
              <p className="text-sm text-slate-500">
                {hasInternship || alreadyPaidRegistration
                  ? "Registration already completed. You only pay this course fee."
                  : "Fill in your details, then pay the course fee to unlock this course."}
              </p>
              {catalogPrice > 0 ? (
                <p className="text-xs text-slate-400">
                  Course fee {formatCoursePrice(catalogPrice, course.currency)}
                  {hasInternship || alreadyPaidRegistration
                    ? " · registration fee is not charged again"
                    : ""}
                </p>
              ) : (
                <p className="text-xs text-emerald-600 font-semibold">Free course</p>
              )}
            </div>

            {step === "form" && (
              <form className="space-y-4" onSubmit={(e) => void handleFormSubmit(e)}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Full Name *</Label>
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email Address *</Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={Boolean(userId)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone Number *</Label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>University *</Label>
                    <Select
                      value={universityId}
                      onValueChange={(v) => {
                        setUniversityId(v);
                        setCollegeId("");
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select university" />
                      </SelectTrigger>
                      <SelectContent>
                        {unis.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>College Name *</Label>
                    <Select value={collegeId} onValueChange={setCollegeId} disabled={!universityId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select college" />
                      </SelectTrigger>
                      <SelectContent>
                        {collegeOptions.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Semester *</Label>
                    <Select value={semester} onValueChange={setSemester}>
                      <SelectTrigger>
                        <SelectValue placeholder="Semester" />
                      </SelectTrigger>
                      <SelectContent>
                        {SEMESTERS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Session *</Label>
                    <Select value={session} onValueChange={setSession}>
                      <SelectTrigger>
                        <SelectValue placeholder="Session" />
                      </SelectTrigger>
                      <SelectContent>
                        {SESSIONS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {!userId && (
                    <>
                      <div className="space-y-1.5">
                        <Label>Password *</Label>
                        <Input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={8}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Confirm Password *</Label>
                        <Input
                          type="password"
                          value={confirmPw}
                          onChange={(e) => setConfirmPw(e.target.value)}
                          required
                          minLength={8}
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <Button type="submit" className="font-bold gap-2" disabled={submitting} size="lg">
                    {submitting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CreditCard className="size-4" />
                    )}
                    {course.is_free || catalogPrice === 0 ? "Submit & Enroll" : "Submit & Continue to Payment"}
                  </Button>
                  {!userId && (
                    <Button type="button" variant="outline" asChild size="lg">
                      <Link to={`${STUDENT_LOGIN_PATH}?next=${encodeURIComponent(`/courses/${course.slug}/enroll`)}`}>
                        Already registered? Log in
                      </Link>
                    </Button>
                  )}
                </div>
              </form>
            )}

            {step === "pay" && (
              <div className="space-y-5">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex gap-3">
                  <Lock className="size-5 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-amber-950">Course payment</p>
                    <p className="text-sm text-amber-900/80 mt-1">
                      {hasInternship || alreadyPaidRegistration
                        ? "You already paid the registration fee. This checkout charges only the course fee."
                        : "Pay the course fee to unlock this course under My Courses."}
                      {!hasInternship && alreadyPaidRegistration
                        ? ""
                        : !hasInternship
                          ? " Internship services stay locked until upgraded."
                          : ""}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border bg-slate-50 p-5 space-y-2 text-sm">
                  <p>
                    <span className="text-slate-500">Name:</span>{" "}
                    <span className="font-semibold">{student?.full_name || fullName || "—"}</span>
                  </p>
                  <p>
                    <span className="text-slate-500">Email:</span>{" "}
                    <span className="font-semibold">{student?.email || email || "—"}</span>
                  </p>
                  <p>
                    <span className="text-slate-500">College:</span>{" "}
                    <span className="font-semibold">
                      {student?.college_name || selectedCollegeName || "—"}
                    </span>
                  </p>
                </div>

                <div className="rounded-2xl border bg-white p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                      Amount due
                    </p>
                    <p className="text-3xl font-black text-primary">{formatRupees(amountPaise)}</p>
                    {feeNote ? <p className="text-xs text-slate-500 mt-1">{feeNote}</p> : null}
                  </div>
                  <Button
                    size="lg"
                    className="gap-2 font-black"
                    disabled={paying || amountPaise < 100}
                    onClick={() => void handlePay()}
                  >
                    {paying ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CreditCard className="size-4" />
                    )}
                    Pay &amp; Enroll
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
