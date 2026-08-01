import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RegistrationProgressHeader } from "@/components/registration/RegistrationProgressHeader";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { withStoredDirectoryPassword } from "@/lib/studentCredentials";
import {
  REGISTRATION_PASSWORD_MIN_LENGTH,
  applyStudentRegistrationPassword,
  registrationFailureMessage,
  signUpStudentWithChosenPassword,
  validateRegistrationPassword,
} from "@/lib/registrationPassword";
import { signInStudentWithPassword } from "@/lib/studentAuthLogin";
import { ensurePaymentSuccessLog } from "@/lib/recordPaymentSuccess";
import { allocateNextRegistrationId } from "@/lib/registrationId";
import {
  buildRegistrationStudentPayload,
  completeStudentDirectoryRegistration,
  studentRowHasAcademicData,
} from "@/lib/registerStudentDirectory";
import { assertSendMailOk, getSendMailApiUrl } from "@/lib/sendMailApi";
import { adminUpsertStudentProfile } from "@/lib/adminProfileUpsert";
import { createEphemeralSupabaseAuthClient } from "@/lib/createSubUser";
import { buildStudentCredentialLoginLink } from "@/lib/authRoutes";
import { captureReferralFromUrl, peekStoredReferralCode, resolveValidReferralCode, logReferralClickFromUrl } from "@/lib/referral";
import { formatRupees, isBeuStudent } from "@/lib/feeRules";
import { defaultPasswordForCollege } from "@/lib/collegeDefaultPassword";
import { resolveStudentFeeBreakdown } from "@/lib/collegeFees";
import {
  fetchRegistrationColleges,
  fetchRegistrationUniversities,
  type RegistrationCollege,
  type RegistrationUniversity,
} from "@/lib/registrationCatalog";
import {
  canOpenRegistrationCheckout,
  fetchPublicPaymentConfig,
  isRegistrationPaymentRequired,
  normalizePaymentSettings,
  prefetchRegistrationCheckout,
  runRegistrationRazorpayCheckout,
  type RegistrationPaymentResult,
} from "@/lib/registrationPayment";
import {
  studentHasPaidEnrollment,
  STUDENT_PAYMENT_REQUIRED_PATH,
} from "@/lib/studentPaymentAccess";
import { baSubjects, bcomSubjects, bscSubjects } from "@/lib/subjectOptions";
import { displayCollegeName } from "@/lib/collegeDisplay";
import {
  checkStudentRegistrationAvailable,
  registrationFieldErrors,
} from "@/lib/registrationAvailability";
import {
  inferDepartmentFromSubject,
  matchCollegeRoster,
  normalizeDegree,
  normalizeDepartment,
  normalizeGender,
  normalizeInternshipMode,
  normalizeSemester,
  normalizeSession,
  normalizeSubject,
} from "@/lib/collegeRoster";
import { deleteRegistrationLead, upsertRegistrationLead } from "@/lib/registrationLeads";
import { markLeadCrmConvertedByEmail } from "@/lib/leadAssignment";
import { BeuRegistrationModal } from "@/components/BeuRegistrationModal";
import {
  beuFormToStudentFields,
  type BeuFormData,
} from "@/lib/beuRegistration";
import { upsertBeuDetails } from "@/lib/beuDetails";
import {
  fetchEngineeringConfigMap,
  type EngineeringUniversityConfig,
} from "@/lib/engineeringConfig";
import {
  fetchNonEngineeringConfigMap,
  resolveNonEngineeringOptions,
  type NonEngineeringUniversityConfig,
} from "@/lib/nonEngineeringConfig";
import {
  departmentsForNonTechDegree,
  filterNonEngineeringCoursesForDegree,
} from "@/lib/studentTrack";
import {
  isAllowedConsentLetterFile,
  uploadConsentLetterToStorage,
} from "@/lib/studentDocuments";
import { Eye, EyeOff, Loader2, CheckCircle2, ChevronLeft, ChevronRight, MessageSquare, Info, Upload, FileText } from "lucide-react";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";

const REGISTRATION_HELP_WHATSAPP_URL = "https://whatsapp.com/channel/0029VbC9lvi3bbV8TS7TbB00";
const REGISTRATION_HELP_PHONE_E164 = "+917050936593";
const REGISTRATION_HELP_PHONE_DISPLAY = "+91 70509 36593";

type Step = 1 | 2 | 3 | 4 | 5;

const CONSENT_MAX_BYTES = 10 * 1024 * 1024;

type University = RegistrationUniversity;
type College = RegistrationCollege;

type RegistrationVariant = "public" | "admin" | "cybercafe";

export const RegistrationForm = ({
  onSuccess,
  onRegisterAnother,
  initialData,
  variant = "public",
  onAdminComplete,
  onPaymentOpenChange,
}: {
  onSuccess?: () => void;
  /** Cyber cafe: remount / open a fresh form for the next student. */
  onRegisterAnother?: () => void;
  initialData?: any;
  variant?: RegistrationVariant;
  onAdminComplete?: (info: { email: string; full_name: string }) => void;
  /** Called with true when Razorpay opens, false when it closes/resolves. */
  onPaymentOpenChange?: (open: boolean) => void;
}) => {
  const navigate = useNavigate();
  const isAdminVariant = variant === "admin";
  const isCyberCafeVariant = variant === "cybercafe";
  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [paymentSettings, setPaymentSettings] = useState<any>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);

  // Step 1
  const [fullName, setFullName] = useState(initialData?.fullName || "");
  const [gender, setGender] = useState(initialData?.gender || "");
  const [parentName, setParentName] = useState(initialData?.parentName || "");
  const [contact, setContact] = useState(initialData?.contact || "");
  const [email, setEmail] = useState(initialData?.email || "");
  const [registrationFieldError, setRegistrationFieldError] = useState<{
    email?: string;
    phone?: string;
  }>({});
  const [checkingRegistration, setCheckingRegistration] = useState(false);

  // Step 2
  const [unis, setUnis] = useState<University[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [domains, setDomains] = useState<any[]>([]);
  const [universityId, setUniversityId] = useState(""); // We might need to resolve ID from name if needed
  const [collegeId, setCollegeId] = useState("");
  const [degree, setDegree] = useState(initialData?.degree || "");
  const [departmentName, setDepartmentName] = useState(initialData?.department || "");
  const [classSem, setClassSem] = useState(initialData?.semester || "");
  const [session, setSession] = useState(initialData?.session || "");
  const [subject, setSubject] = useState(initialData?.subject || "");
  const [rollNo, setRollNo] = useState(initialData?.rollNo || "");
  const [course, setCourse] = useState(initialData?.course || "");
  const [internshipMode, setInternshipMode] = useState(
    (initialData as { internshipMode?: string })?.internshipMode || "Online"
  );

  const [beuModalOpen, setBeuModalOpen] = useState(false);
  const [beuSaving, setBeuSaving] = useState(false);
  const [beuFormData, setBeuFormData] = useState<BeuFormData | null>(null);
  const [beuDetailsCompleted, setBeuDetailsCompleted] = useState(false);
  const [engineeringConfigByUniId, setEngineeringConfigByUniId] = useState<
    Map<string, EngineeringUniversityConfig>
  >(new Map());
  const [nonTechConfigByUniId, setNonTechConfigByUniId] = useState<
    Map<string, NonEngineeringUniversityConfig>
  >(new Map());

  // Step 3
  const [emName, setEmName] = useState(initialData?.emName || "");
  const [emPhone, setEmPhone] = useState(initialData?.emPhone || "");
  const [emRel, setEmRel] = useState(initialData?.emRel || "");

  // Step 4
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [agree, setAgree] = useState(false);

  const [consentLetterFile, setConsentLetterFile] = useState<File | null>(null);
  const consentFormUrlRef = useRef<string | null>(null);
  /** Disable only after repeated RLS/JWT failures on registration_leads. */
  const skipRegistrationLeadsRef = useRef(false);

  /** Dedicated consent step for public/cyber café flows; upload is always optional. */
  const showConsentStep = !isAdminVariant;

  const domainOptions = useMemo(
    () => domains.map((d) => d.name),
    [domains]
  );

  const selectedUni = useMemo(
    () => unis.find((u) => u.id === universityId) || null,
    [unis, universityId]
  );
  const activeEngineeringConfig = universityId
    ? engineeringConfigByUniId.get(universityId) || null
    : null;
  const activeNonTechConfig = universityId
    ? nonTechConfigByUniId.get(universityId) || null
    : null;
  const nonTechOptions = useMemo(
    () => resolveNonEngineeringOptions(activeNonTechConfig),
    [activeNonTechConfig]
  );
  const departmentOptions = useMemo(() => {
    if (activeNonTechConfig) {
      return filterNonEngineeringCoursesForDegree(degree, nonTechOptions.courses);
    }
    return departmentsForNonTechDegree(degree);
  }, [activeNonTechConfig, degree, nonTechOptions.courses]);
  const isEngineeringFlow = Boolean(activeEngineeringConfig) || isBeuStudent(selectedUni?.name);
  const isBeuFlow = isEngineeringFlow;

  const beuExtraMetadata = useMemo(() => {
    if (!beuFormData) return {};
    return {
      specialization: beuFormData.specialization,
      section_type: beuFormData.sectionType,
      section_duration: beuFormData.sectionDuration,
      beu_course: beuFormData.course,
      beu_branch: beuFormData.branchSubject,
      registration_source: activeEngineeringConfig ? "engineering_config_flow" : "beu_special_flow",
      internship_duration: beuFormData.sectionDuration,
    };
  }, [beuFormData]);

  const persistBeuDetailsIfNeeded = async (studentId: string) => {
    if (!beuFormData || !studentId) return;
    try {
      await upsertBeuDetails(supabase, studentId, beuFormData);
    } catch (e) {
      console.warn("beu_details upsert:", e);
    }
  };

  const saveRegistrationLeadDraft = async (extraPayload: Record<string, unknown> = {}) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes("@") || isAdminVariant || skipRegistrationLeadsRef.current) return;
    const selectedCollege = colleges.find((c) => c.id === collegeId);
    const cyberData = isCyberCafeVariant ? JSON.parse(sessionStorage.getItem("cybercafe_profile") || "{}") : {};
    const payload: Record<string, unknown> = {
      fullName,
      gender,
      parentName,
      email: normalizedEmail,
      contact,
      universityId,
      collegeId,
      university: selectedUni?.name,
      college: selectedCollege?.name,
      degree,
      department: departmentName,
      subject,
      session,
      semester: classSem,
      rollNo,
      course,
      internship_mode: internshipMode,
      referral_code: peekStoredReferralCode(),
      ...extraPayload,
    };
    if (password.length >= REGISTRATION_PASSWORD_MIN_LENGTH) payload.password = password;
    await upsertRegistrationLead(supabase, {
      email: normalizedEmail,
      phone: contact,
      step,
      payload,
      cybercafe_shop_name: cyberData.shop_name || null,
      cybercafe_email: cyberData.email || null,
    });
  };

  const selectedCollege = useMemo(
    () => colleges.find((c) => c.id === collegeId),
    [colleges, collegeId]
  );

  useEffect(() => {
    const def = defaultPasswordForCollege(selectedUni?.name, selectedCollege?.name);
    if (def) {
      setPassword(def);
      setConfirmPw(def);
    }
  }, [selectedUni?.name, selectedCollege?.name]);

  useEffect(() => {
    if (!showConsentStep) {
      setConsentLetterFile(null);
      consentFormUrlRef.current = null;
      setStep((s) => (s === 5 ? 4 : s));
    }
  }, [showConsentStep]);

  // College roster auto-fill state
  const [rosterStatus, setRosterStatus] = useState<
    "idle" | "checking" | "matched" | "claimed" | "none" | "ambiguous"
  >("idle");
  const [rosterMatchedName, setRosterMatchedName] = useState<string>("");
  const [rosterAlreadyRegisteredOpen, setRosterAlreadyRegisteredOpen] = useState(false);

  // Save incomplete registrations as leads (public flow only; step ≥ 2).
  useEffect(() => {
    if (isAdminVariant || step < 2 || skipRegistrationLeadsRef.current) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes("@")) return;

    const t = window.setTimeout(async () => {
      try {
        const cyberData = isCyberCafeVariant ? JSON.parse(sessionStorage.getItem("cybercafe_profile") || "{}") : {};
        const selectedCollege = colleges.find((c) => c.id === collegeId);
        const selectedUni = unis.find((u) => u.id === universityId);
        const payload: Record<string, unknown> = {
          fullName,
          gender,
          parentName,
          email: normalizedEmail,
          contact,
          universityId,
          collegeId,
          university: selectedUni?.name,
          college: selectedCollege?.name,
          degree,
          department: departmentName,
          subject,
          session,
          semester: classSem,
          rollNo,
          course,
          internship_mode: internshipMode,
          referral_code: peekStoredReferralCode(),
        };
        if (password.length >= REGISTRATION_PASSWORD_MIN_LENGTH) payload.password = password;

        const { ok, error } = await upsertRegistrationLead(supabase, {
          email: normalizedEmail,
          phone: contact,
          step,
          payload,
          cybercafe_shop_name: cyberData.shop_name || null,
          cybercafe_email: cyberData.email || null,
        });
        if (!ok && error) {
          const msg = String(error);
          if (
            msg.includes("401") ||
            msg.includes("JWT") ||
            msg.includes("403") ||
            msg.includes("42501") ||
            msg.includes("Not allowed")
          ) {
            skipRegistrationLeadsRef.current = true;
            return;
          }
          console.warn("registration_leads upsert:", error);
        }
      } catch (e) {
        console.warn("registration_leads upsert:", e);
      }
    }, 900);
    return () => window.clearTimeout(t);
  }, [
    isAdminVariant,
    step,
    fullName,
    gender,
    parentName,
    email,
    contact,
    universityId,
    collegeId,
    degree,
    departmentName,
    subject,
    session,
    classSem,
    rollNo,
    course,
    internshipMode,
    password,
    colleges,
    unis,
  ]);

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);

    void (async () => {
      const [universityResult, domainsResult, engineeringResult, nonTechResult, paymentResult] =
        await Promise.allSettled([
          fetchRegistrationUniversities(supabase),
          supabase.from("internship_domains").select("*").order("name"),
          fetchEngineeringConfigMap(supabase),
          fetchNonEngineeringConfigMap(supabase),
          fetchPublicPaymentConfig(supabase),
        ]);

      if (cancelled) return;

      if (universityResult.status === "fulfilled") {
        setUnis(universityResult.value);
      } else {
        const message =
          universityResult.reason instanceof Error
            ? universityResult.reason.message
            : "Failed to load universities";
        toast.error(message);
      }

      if (domainsResult.status === "fulfilled") {
        setDomains(domainsResult.value.data || []);
      }

      if (engineeringResult.status === "fulfilled") {
        setEngineeringConfigByUniId(engineeringResult.value);
      } else {
        setEngineeringConfigByUniId(new Map());
      }

      if (nonTechResult.status === "fulfilled") {
        setNonTechConfigByUniId(nonTechResult.value);
      } else {
        setNonTechConfigByUniId(new Map());
      }

      if (paymentResult.status === "fulfilled") {
        setPaymentSettings(paymentResult.value);
      }

      setCatalogLoading(false);
    })();

    if (!isAdminVariant) {
      captureReferralFromUrl();
      logReferralClickFromUrl(supabase);
      prefetchRegistrationCheckout();
    }

    return () => {
      cancelled = true;
    };
  }, [isAdminVariant]);

  useEffect(() => {
    if (!isAdminVariant && step >= 3) {
      prefetchRegistrationCheckout();
    }
  }, [step, isAdminVariant]);

  useEffect(() => {
    if (!isBeuFlow) {
      setBeuDetailsCompleted(false);
      setBeuFormData(null);
    }
  }, [isBeuFlow, universityId]);

  useEffect(() => {
    if (!universityId) { setColleges([]); setCollegeId(""); return; }
    fetchRegistrationColleges(supabase, universityId)
      .then(setColleges)
      .catch((e) => {
        setColleges([]);
        toast.error(e instanceof Error ? e.message : "Failed to load colleges");
      });
    setCollegeId("");
  }, [universityId]);

  useEffect(() => {
    setDepartmentName("");
    setSubject("");
    setCourse("");
  }, [degree]);

  // ── College Roster auto-fill ────────────────────────────────────────────────
  // When a student picks a college, ask the DB whether their (email, phone)
  // appears in that college's pre-loaded roster. If yes, fill every academic /
  // internship field for them and let them skip straight to payment.
  useEffect(() => {
    if (isAdminVariant) return;
    if (!collegeId) {
      setRosterStatus("idle");
      setRosterMatchedName("");
      return;
    }
    const normEmail = (email || "").trim().toLowerCase();
    const normPhone = (contact || "").replace(/\D/g, "");
    if (!normEmail && normPhone.length < 10) {
      setRosterStatus("idle");
      return;
    }

    let cancelled = false;
    setRosterStatus("checking");
    (async () => {
      const result = await matchCollegeRoster(collegeId, normEmail, normPhone);
      if (cancelled) return;

      if (result.status === "matched" && result.data) {
        const d = result.data;

        // Plain-text fields (no normalisation needed).
        if (d.full_name && !fullName) setFullName(d.full_name);
        if (d.parent_name && !parentName) setParentName(d.parent_name);
        if (d.registration_number) setRollNo(d.registration_number);
        if (d.course) setCourse(d.course);

        // Normalise dropdown / radio values to match the form's exact options.
        const normGender = normalizeGender(d.gender);
        if (normGender && !gender) setGender(normGender);

        const normDept =
          normalizeDepartment(d.department) ||
          normalizeDepartment(d.degree) ||
          inferDepartmentFromSubject(d.subject);
        const normDegree =
          normalizeDegree(d.degree) ||
          normalizeDegree(d.department) ||
          (normDept ? normalizeDegree(normDept) : "");

        if (normDegree) setDegree(normDegree);
        if (normDept) setDepartmentName(normDept);

        const normSubject = normalizeSubject(d.subject, normDept);
        if (normSubject) setSubject(normSubject);

        const normSem = normalizeSemester(d.class_semester);
        if (normSem) setClassSem(normSem);

        const normSession = normalizeSession(d.academic_session);
        if (normSession) setSession(normSession);

        const normMode = normalizeInternshipMode(d.internship_mode);
        if (normMode) setInternshipMode(normMode);

        setRosterMatchedName(d.full_name || "");
        setRosterStatus("matched");
      } else if (result.status === "claimed") {
        setRosterStatus("claimed");
        setRosterAlreadyRegisteredOpen(true);
      } else if (result.status === "ambiguous") {
        setRosterStatus("ambiguous");
      } else {
        setRosterStatus("none");
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-run when the lookup keys change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collegeId, email, contact, isAdminVariant]);

  const ensureRegistrationIdentityAvailable = async (): Promise<boolean> => {
    setCheckingRegistration(true);
    try {
      const result = await checkStudentRegistrationAvailable(supabase, email, contact);
      if (!result.available) {
        setRegistrationFieldError(registrationFieldErrors(result));
        toast.error(
          result.message ||
            "This email or mobile number is already registered. Sign in if you already have an account."
        );
        return false;
      }
      setRegistrationFieldError({});
      return true;
    } finally {
      setCheckingRegistration(false);
    }
  };

  const validateStep = (): boolean => {
    if (step === 1) {
      const s = z.object({
        fullName: z.string().trim().min(2, "Full name is required").max(100),
        gender: z.string().min(1, "Select gender"),
        parentName: z.string().trim().min(2, "Parent/Guardian name is required").max(100),
        contact: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
        email: z.string().email("Enter a valid email").max(255),
      }).safeParse({ fullName, gender, parentName, contact, email });
      if (!s.success) { toast.error(s.error.issues[0].message); return false; }
    }
    if (step === 2) {
      if (isBeuFlow) {
        if (!universityId || !collegeId) {
          toast.error("Select university and college for engineering registration");
          return false;
        }
      } else if (
        !universityId ||
        !collegeId ||
        !degree ||
        !departmentName ||
        !classSem ||
        !session ||
        !rollNo ||
        !course
      ) {
        toast.error("Please fill all required academic fields");
        return false;
      }
    }
    if (step === 3) {
      const hasAny = emName.trim() || emPhone.trim() || emRel;
      if (hasAny) {
        const s = z.object({
          emName: z.string().trim().min(2).max(100),
          emPhone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit emergency number"),
          emRel: z.string().min(1, "Select relationship"),
        }).safeParse({ emName, emPhone, emRel });
        if (!s.success) {
          toast.error(s.error.issues[0].message);
          return false;
        }
      }
    }
    if (step === 4) {
      const pwErr = validateRegistrationPassword(password, confirmPw);
      if (pwErr) {
        toast.error(pwErr);
        return false;
      }
      if (!agree) { toast.error("Please accept the Terms & Privacy Policy"); return false; }
    }
    if (step === 5 && consentLetterFile) {
      if (consentLetterFile.size > CONSENT_MAX_BYTES) {
        toast.error(
          isEngineeringFlow
            ? "NoC document must be 10 MB or smaller."
            : "Consent letter must be 10 MB or smaller."
        );
        return false;
      }
      if (!isAllowedConsentLetterFile(consentLetterFile)) {
        toast.error("Use a PDF or image file (PNG, JPEG, WebP, GIF).");
        return false;
      }
    }
    return true;
  };

  const handleBeuModalSubmit = async (data: BeuFormData) => {
    setBeuSaving(true);
    try {
      const mapped = beuFormToStudentFields(data);
      setCollegeId(data.collegeId);
      setDegree(mapped.degree);
      setDepartmentName(mapped.departmentName);
      setSubject(mapped.subject);
      setSession(mapped.session);
      setClassSem(mapped.classSem);
      setRollNo(mapped.rollNo);
      setCourse(mapped.course);
      setInternshipMode(mapped.internshipMode);
      setBeuFormData(data);
      setBeuDetailsCompleted(true);
      await saveRegistrationLeadDraft({
        beu_details: data,
        beu_completed: true,
        ...mapped,
      });
      setBeuModalOpen(false);
      toast.success("Engineering details saved successfully");
      setStep((s) => {
        const candidate = Math.min(showConsentStep ? 5 : 4, s + 1) as Step;
        if (candidate === 3 && rosterStatus === "matched" && !isAdminVariant) {
          return 4;
        }
        return candidate;
      });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save engineering details");
    } finally {
      setBeuSaving(false);
    }
  };

  const next = async () => {
    if (!validateStep()) return;
    if (step === 1) {
      const ok = await ensureRegistrationIdentityAvailable();
      if (!ok) return;
    }
    if (step === 2 && isBeuFlow && !beuDetailsCompleted) {
      await saveRegistrationLeadDraft();
      setBeuModalOpen(true);
      return;
    }
    if (step === 2 && isBeuFlow && beuDetailsCompleted) {
      setStep((s) => {
        const candidate = Math.min(showConsentStep ? 5 : 4, s + 1) as Step;
        if (candidate === 3 && rosterStatus === "matched" && !isAdminVariant) {
          return 4;
        }
        return candidate;
      });
      return;
    }
    setStep((s) => {
      const cap = showConsentStep ? 5 : 4;
      const candidate = Math.min(cap, s + 1) as Step;
      // Roster-matched students skip Step 3 (emergency contacts, which are
      // optional anyway) and land straight on the payment step.
      if (candidate === 3 && rosterStatus === "matched" && !isAdminVariant) {
        return 4;
      }
      return candidate;
    });
  };
  const back = () =>
    setStep((s) => {
      const candidate = Math.max(1, s - 1) as Step;
      // Mirror the skip on the way back too, so they don't see Step 3.
      if (candidate === 3 && rosterStatus === "matched" && !isAdminVariant) {
        return 2;
      }
      return candidate;
    });

  const handlePayment = async (
    settings: NonNullable<typeof paymentSettings>
  ): Promise<RegistrationPaymentResult | { success: true }> => {
    const selectedCollege = colleges.find((c) => c.id === collegeId);
    const selectedUni = unis.find((u) => u.id === universityId);

    const breakdown = resolveStudentFeeBreakdown(
      selectedUni?.name,
      selectedCollege?.name,
      selectedCollege,
      selectedUni,
      settings?.amount_paise
    );
    const finalAmount = breakdown.totalPaise;
    const normalizedEmail = email.trim().toLowerCase();

    const selectedUniName = unis.find((u) => u.id === universityId)?.name || "";
    const selectedCollegeName = displayCollegeName(selectedCollege?.name) || "";
    const cyberData = isCyberCafeVariant
      ? JSON.parse(sessionStorage.getItem("cybercafe_profile") || "{}")
      : {};

    onPaymentOpenChange?.(true);
    let payResult: RegistrationPaymentResult;
    try {
      payResult = await runRegistrationRazorpayCheckout({
        paymentSettings: settings,
        amountPaise: finalAmount,
        prefill: { name: fullName, email: normalizedEmail, contact },
        studentData: {
          email: normalizedEmail,
          password,
          fullName,
          full_name: fullName,
          gender,
          parentName,
          parent_name: parentName,
          contact_number: contact,
          contact,
          university: selectedUniName,
          university_name: selectedUniName,
          college: selectedCollegeName,
          college_name: selectedCollegeName,
          college_id: collegeId,
          course,
          degree,
          department: departmentName,
          classSem,
          semester: classSem,
          session,
          rollNo,
          subject,
          internship_mode: internshipMode,
          cybercafe_shop_name: cyberData.shop_name || null,
          cybercafe_email: cyberData.email || null,
          referral_code: peekStoredReferralCode() || null,
        },
        onModalOpen: () => {
          setSubmitting(false);
          toast.info("Complete payment in the Razorpay window.", { duration: 10000 });
        },
      });
    } catch (payErr: unknown) {
      const msg = payErr instanceof Error ? payErr.message : "Could not open payment";
      toast.error(msg);
      return { success: false };
    } finally {
      onPaymentOpenChange?.(false);
    }

    if (!payResult.success) {
      if (!payResult.cancelled) {
        toast.error("Payment failed. Please try again.");
      }
      return { success: false };
    }

    return payResult;
  };

  const submit = async () => {
    if (isBeuFlow && !beuDetailsCompleted) {
      toast.error("Complete the engineering form before submitting");
      setBeuModalOpen(true);
      return;
    }
    if (!validateStep()) return;
    if (isAdminVariant) {
      await performAdminSubmit();
      return;
    }
    await performSubmit();
  };

  const performAdminSubmit = async () => {
    setSubmitting(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const identityOk = await ensureRegistrationIdentityAvailable();
      if (!identityOk) return;

      const { data: sessionWrap } = await supabase.auth.getSession();
      if (!sessionWrap?.session?.user?.id) throw new Error("Your session expired. Please sign in again.");

      const selectedCollege = colleges.find((c) => c.id === collegeId);
      const selectedUni = unis.find((u) => u.id === universityId);

      const ephemeral = createEphemeralSupabaseAuthClient();
      const { userId } = await signUpStudentWithChosenPassword(ephemeral, supabase, {
        email: normalizedEmail,
        password,
        fullName,
      });

      const currentYear = new Date().getFullYear();
      let regId = await allocateNextRegistrationId(supabase, currentYear);

      const cyberData = isCyberCafeVariant ? JSON.parse(sessionStorage.getItem("cybercafe_profile") || "{}") : {};

      const basePayload = {
        id: userId,
        email: normalizedEmail,
        full_name: fullName,
        gender,
        parent_name: parentName,
        contact_number: contact,
        university_name: selectedUni?.name || "",
        college_name: displayCollegeName(selectedCollege?.name) || "",
        course,
        internship_domain: course,
        degree,
        department: departmentName,
        class_semester: classSem,
        academic_session: session,
        roll_number: rollNo,
        emergency_name: emName,
        emergency_contact: emPhone,
        emergency_relation: emRel,
        status: "Active" as const,
        cybercafe_shop_name: cyberData.shop_name || null,
        cybercafe_email: cyberData.email || null,
        metadata: {
          source: "admin_manual_registration",
          access_scope: "internship",
          subject,
          fullName: fullName,
          parentName: parentName,
          gender,
          contact,
          university: selectedUni?.name || "",
          college: selectedCollege?.name || "",
          degree,
          department: departmentName,
          session,
          semester: classSem,
          rollNo,
          course,
          internship_mode: internshipMode,
          ...beuExtraMetadata,
        },
      };

      const studentDataPayload = withStoredDirectoryPassword(basePayload, password);

      const adminProfileRow = {
        id: userId,
        full_name: fullName,
        email: normalizedEmail,
        contact_number: contact,
        gender,
        parent_name: parentName,
      };
      await completeStudentDirectoryRegistration({
        client: supabase,
        studentRow: { ...studentDataPayload, registration_id: regId },
        profileRow: adminProfileRow,
      });

      await persistBeuDetailsIfNeeded(userId);

      await adminUpsertStudentProfile(supabase, {
        id: userId,
        full_name: fullName,
        email: normalizedEmail,
        contact_number: contact,
        gender,
        parent_name: parentName,
      });

      await supabase.from("user_roles").upsert({ user_id: userId, role: "student" }, { onConflict: "user_id,role" });

      await supabase.from("payment_success").insert({
        user_id: userId,
        payment_id: `pay_admin_${Date.now()}`,
        amount_paise: 0,
        email: normalizedEmail,
        full_name: fullName,
        college_name: displayCollegeName(selectedCollege?.name) || "",
        status: "success",
      });

      try {
        const mailRes = await fetch(getSendMailApiUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: normalizedEmail,
            email: normalizedEmail,
            action: "registration_success",
            data: {
              fullName,
              regId,
              password,
              loginLink: buildStudentCredentialLoginLink(),
            },
          }),
        });
        await assertSendMailOk(mailRes);
      } catch {
        /* optional welcome mail */
      }

      toast.success("Student added successfully.");
      onAdminComplete?.({ email: normalizedEmail, full_name: fullName });
      onSuccess?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add student");
    } finally {
      setSubmitting(false);
    }
  };

  const performSubmit = async () => {
    setSubmitting(true);
    let paymentCaptured = false;
    let consentUpload: Promise<string | null> | null = null;

    if (showConsentStep && step === 5 && consentLetterFile) {
      const docKind = isEngineeringFlow ? "noc" : "consent";
      const docLabel = isEngineeringFlow ? "NoC" : "Consent letter";
      consentUpload = uploadConsentLetterToStorage(
        supabase,
        consentLetterFile,
        email.trim().toLowerCase(),
        { documentKind: docKind }
      ).catch((e) => {
        console.warn(`${docLabel} upload failed; proceeding without it.`, e);
        toast.warning(`${docLabel} could not be uploaded. You can still complete registration.`);
        return null;
      });
    } else {
      consentFormUrlRef.current = null;
    }

    try {
      let settings = normalizePaymentSettings(paymentSettings);
      const scriptWarm = prefetchRegistrationCheckout();
      const identityWarm = ensureRegistrationIdentityAvailable();

      let identityOk: boolean;
      if (!settings?.razorpay_key_id) {
        const [fetched, , idOk] = await Promise.all([
          fetchPublicPaymentConfig(supabase),
          scriptWarm,
          identityWarm,
        ]);
        settings = fetched;
        setPaymentSettings(settings);
        identityOk = idOk;
      } else {
        const [, idOk] = await Promise.all([scriptWarm, identityWarm]);
        identityOk = idOk;
      }
      if (!identityOk) {
        setSubmitting(false);
        return;
      }

      let result: RegistrationPaymentResult | { success: true } = { success: true };
      if (isRegistrationPaymentRequired(settings, { isAdmin: isAdminVariant })) {
        if (!canOpenRegistrationCheckout(settings)) {
          toast.error(
            "Payment gateway is not set up yet. Turn on Payments in Super Admin (Razorpay key) and try again."
          );
          setSubmitting(false);
          return;
        }
        result = await handlePayment(settings!);
        if (!result.success) {
          setSubmitting(false);
          return;
        }
        paymentCaptured = true;
        setSubmitting(true);
      }

      if (consentUpload) {
        consentFormUrlRef.current = await consentUpload;
      }

      const normalizedEmail = email.trim().toLowerCase();
      let userId: string | undefined;
      let regId = "";

      const selectedUniForRef =
        unis.find((u) => u.id === universityId)?.name ||
        selectedUni?.name ||
        "";
      const selectedCollegeForRef =
        colleges.find((c) => c.id === collegeId)?.name ||
        selectedCollege?.name ||
        "";
      const validReferral = await resolveValidReferralCode(supabase, peekStoredReferralCode(), {
        universityName: selectedUniForRef,
        collegeName: selectedCollegeForRef,
      });

      const paymentRequired = isRegistrationPaymentRequired(settings, { isAdmin: isAdminVariant });
      const isLegacyPaidFlow = paymentRequired && "mode" in result && result.mode === "legacy";

      if (
        paymentCaptured &&
        paymentRequired &&
        "payment_id" in result &&
        result.payment_id
      ) {
        const earlyAmountPaise = Math.max(
          100,
          Math.round(Number("amount" in result ? result.amount : 0) || 0) ||
            Math.round(Number(settings?.amount_paise) || 0)
        );
        const cyberEarly = isCyberCafeVariant
          ? JSON.parse(sessionStorage.getItem("cybercafe_profile") || "{}")
          : {};
        await ensurePaymentSuccessLog(supabase, {
          payment_id: String(result.payment_id),
          amount_paise: earlyAmountPaise,
          email: normalizedEmail,
          full_name: fullName,
          college_name: displayCollegeName(colleges.find((c) => c.id === collegeId)?.name) || null,
          cybercafe_shop_name: cyberEarly.shop_name || null,
          cybercafe_email: cyberEarly.email || null,
          status: "success",
        });
      }

      if (paymentRequired && !isLegacyPaidFlow) {
        const verified = result as {
          userId?: string;
          payment_id?: string;
          amount?: number;
        };

        userId = verified.userId;
        if (!userId) {
          for (let attempt = 0; attempt < 6; attempt++) {
            const { data: prof } = await supabase
              .from("profiles")
              .select("id")
              .eq("email", normalizedEmail)
              .maybeSingle();
            if (prof?.id) {
              userId = prof.id;
              break;
            }
            const { data } = await supabase
              .from("students")
              .select("id, registration_id")
              .eq("email", normalizedEmail)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (data?.id) {
              userId = data.id;
              regId = data.registration_id || "";
              break;
            }
            await new Promise((r) => setTimeout(r, 200));
          }
        }
        if (userId) {
          const { data: row } = await supabase
            .from("students")
            .select("registration_id")
            .eq("id", userId)
            .maybeSingle();
          regId = row?.registration_id || regId;
        }

        if (!userId) {
          throw new Error("Payment captured but enrollment not completed. Please contact support.");
        }

        const selectedUniNamePaid = unis.find((u) => u.id === universityId)?.name || "";
        const selectedCollegeNamePaid =
          displayCollegeName(colleges.find((c) => c.id === collegeId)?.name) || "";
        const cyberDataPaid = isCyberCafeVariant
          ? JSON.parse(sessionStorage.getItem("cybercafe_profile") || "{}")
          : {};

        const { data: existingStudentRow } = await supabase
          .from("students")
          .select("*")
          .eq("id", userId)
          .maybeSingle();
        const serverEnrollmentDone =
          (await studentHasPaidEnrollment(supabase, userId, normalizedEmail)) &&
          studentRowHasAcademicData(existingStudentRow as Record<string, unknown> | null);

        try {
          await applyStudentRegistrationPassword(
            supabase,
            userId,
            normalizedEmail,
            password
          );
        } catch (pwSyncErr) {
          console.warn("[registration] password sync:", pwSyncErr);
        }

        if (!serverEnrollmentDone) {
          const signIn = await signInStudentWithPassword(supabase, normalizedEmail, password);
          if (!signIn.ok) throw signIn.error;

          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (authUser?.id) {
            userId = authUser.id;
          }

          if (!regId) {
            const currentYear = new Date().getFullYear();
            regId = await allocateNextRegistrationId(supabase, currentYear);
          }

          const paidAmountPaise = Math.max(
            100,
            Math.round(Number(verified.amount) || 0) ||
              Math.round(Number(settings?.amount_paise) || 0)
          );

          if (verified.payment_id) {
            const logged = await ensurePaymentSuccessLog(supabase, {
              user_id: userId,
              payment_id: verified.payment_id,
              amount_paise: paidAmountPaise,
              email: normalizedEmail,
              full_name: fullName,
              college_name: selectedCollegeNamePaid,
              cybercafe_shop_name: cyberDataPaid.shop_name || null,
              cybercafe_email: cyberDataPaid.email || null,
              status: "success",
            });
            if (!logged) {
              console.error("[registration] payment_success log failed after Razorpay verify");
            }
          }

          const paidExtraMeta: Record<string, unknown> = {
            subject,
            internship_mode: internshipMode,
            access_scope: "internship",
            ...beuExtraMetadata,
          };
          if (consentFormUrlRef.current) {
            paidExtraMeta.consent_form_url = consentFormUrlRef.current;
          }

          await completeStudentDirectoryRegistration({
            client: supabase,
            signInPassword: password,
            studentRow: buildRegistrationStudentPayload({
              userId,
              normalizedEmail,
              fullName,
              gender,
              parentName,
              contact,
              universityName: selectedUniNamePaid,
              collegeName: selectedCollegeNamePaid,
              collegeId,
              course,
              degree,
              departmentName,
              classSem,
              session,
              rollNo,
              subject,
              internshipMode,
              emName,
              emPhone,
              emRel,
              referralCode: validReferral,
              cyberShopName: cyberDataPaid.shop_name || null,
              cyberEmail: cyberDataPaid.email || null,
              registrationId: regId,
              password,
              extraMetadata: paidExtraMeta,
            }),
            profileRow: {
              id: userId,
              full_name: fullName,
              email: normalizedEmail,
              contact_number: contact,
              gender,
              parent_name: parentName,
            },
          });
        } else if (!isCyberCafeVariant && !isAdminVariant) {
          const signIn = await signInStudentWithPassword(supabase, normalizedEmail, password);
          if (!signIn.ok) throw signIn.error;
        }
      } else {
        const registrationClient =
          isCyberCafeVariant || isAdminVariant
            ? createEphemeralSupabaseAuthClient()
            : supabase;
        const signUpResult = await signUpStudentWithChosenPassword(
          registrationClient,
          supabase,
          { email: normalizedEmail, password, fullName }
        );
        userId = signUpResult.userId;

        const currentYear = new Date().getFullYear();
        regId = await allocateNextRegistrationId(supabase, currentYear);

        const cyberData = isCyberCafeVariant ? JSON.parse(sessionStorage.getItem('cybercafe_profile') || '{}') : {};
        const selectedUniName = unis.find((u) => u.id === universityId)?.name || "";
        const extraMeta: Record<string, unknown> = {
          subject,
          internship_mode: internshipMode,
          access_scope: "internship",
          ...beuExtraMetadata,
        };
        if (consentFormUrlRef.current) {
          extraMeta.consent_form_url = consentFormUrlRef.current;
        }
        const studentData: Record<string, unknown> = buildRegistrationStudentPayload({
          userId,
          normalizedEmail,
          fullName,
          gender,
          parentName,
          contact,
          universityName: selectedUniName,
          collegeName: displayCollegeName(colleges.find(c => c.id === collegeId)?.name) || "",
          collegeId,
          course,
          degree,
          departmentName,
          classSem,
          session,
          rollNo,
          subject,
          internshipMode,
          emName,
          emPhone,
          emRel,
          referralCode: validReferral,
          cyberShopName: cyberData.shop_name || null,
          cyberEmail: cyberData.email || null,
          password,
          extraMetadata: extraMeta,
        });

        const profileRow = {
          id: userId,
          full_name: fullName,
          email: normalizedEmail,
          contact_number: contact,
          gender,
          parent_name: parentName,
        };
        const legacyAmountPaise = Math.max(
          100,
          Math.round(Number("amount" in result ? result.amount : 0) || 0) ||
            Math.round(Number(settings?.amount_paise) || 0)
        );
        const paymentRow =
          paymentRequired && "payment_id" in result && result.payment_id
            ? {
                user_id: userId,
                payment_id: result.payment_id,
                amount_paise: legacyAmountPaise,
                email: normalizedEmail,
                full_name: fullName,
                college_name: displayCollegeName(colleges.find(c => c.id === collegeId)?.name),
                cybercafe_shop_name: cyberData.shop_name || null,
                cybercafe_email: cyberData.email || null,
                status: "success",
              }
            : undefined;

        if (isCyberCafeVariant) {
          // Ephemeral client keeps the cyber-café partner signed in on the main client.
          const signIn = await signInStudentWithPassword(
            registrationClient,
            normalizedEmail,
            password
          );
          if (!signIn.ok) throw signIn.error;
          await completeStudentDirectoryRegistration({
            client: registrationClient,
            studentRow: { ...studentData, registration_id: regId },
            profileRow,
            paymentRow,
            signInPassword: password,
          });
        } else {
          const existingSession = await supabase.auth.getSession();
          if (!existingSession.data.session) {
            await signInStudentWithPassword(supabase, normalizedEmail, password);
          }
          await completeStudentDirectoryRegistration({
            client: supabase,
            studentRow: { ...studentData, registration_id: regId },
            profileRow,
            paymentRow,
            signInPassword: password,
          });
        }
      }

      if (userId) {
        await persistBeuDetailsIfNeeded(userId);
      }

      // Try sending mail
      try {
        await fetch(getSendMailApiUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: normalizedEmail,
            email: normalizedEmail,
            action: 'registration_confirmation',
            data: { fullName, regId, password, loginLink: buildStudentCredentialLoginLink() },
          })
        });
      } catch (e) {}

      try {
        await deleteRegistrationLead(supabase, normalizedEmail);
      } catch {
        /* draft cleanup optional */
      }

      try {
        await markLeadCrmConvertedByEmail(
          supabase,
          normalizedEmail,
          "Auto-converted: student registration completed"
        );
      } catch {
        /* CRM convert is best-effort; payment path also converts */
      }

      setSuccess(true);
      toast.success(
        isCyberCafeVariant
          ? "Student registered. Credentials sent to their email."
          : "Registration complete!"
      );
      onSuccess?.();

      if (!isCyberCafeVariant && !isAdminVariant) {
        const paymentStillRequired = isRegistrationPaymentRequired(settings, {
          isAdmin: isAdminVariant,
        });

        if (paymentStillRequired) {
          if (!paymentCaptured) {
            toast.error("Complete payment before accessing your dashboard.");
            navigate(STUDENT_PAYMENT_REQUIRED_PATH, { replace: true });
            return;
          }

          const gateUserId =
            userId ||
            (await supabase.auth.getSession()).data.session?.user?.id ||
            "";
          if (gateUserId) {
            const paid = await studentHasPaidEnrollment(supabase, gateUserId, normalizedEmail);
            if (!paid) {
              toast.error(
                "Payment is not confirmed yet. Please wait a moment and sign in again, or contact support."
              );
              navigate(STUDENT_PAYMENT_REQUIRED_PATH, { replace: true });
              return;
            }
          }
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          navigate("/dashboard", { replace: true, state: { registrationComplete: true } });
        } else {
          const signIn = await signInStudentWithPassword(supabase, normalizedEmail, password);
          if (signIn.ok) {
            navigate("/dashboard", { replace: true, state: { registrationComplete: true } });
          } else {
            navigate("/login", { replace: true });
            toast.success("Registration complete. Sign in with your email and password.");
          }
        }
      }
    } catch (err: unknown) {
      toast.error(registrationFailureMessage(err, { paymentCaptured }));
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="p-8 text-center animate-fade-in">
        <div className="inline-flex size-16 items-center justify-center rounded-full bg-primary/10 mb-4">
          <CheckCircle2 className="size-9 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Success!</h2>
        {isCyberCafeVariant ? (
          <>
            <p className="text-muted-foreground mb-2">Student added to the directory.</p>
            <p className="text-sm text-muted-foreground mb-6">
              Login credentials were sent to the student&apos;s email. You can register the next student now.
            </p>
            <Button className="w-full" onClick={() => onRegisterAnother?.()}>
              Register another student
            </Button>
          </>
        ) : (
          <>
            <p className="text-muted-foreground mb-6">Student registered successfully.</p>
            <Button className="w-full" onClick={() => window.location.reload()}>Finish</Button>
          </>
        )}
      </div>
    );
  }

  const maxProgressStep = showConsentStep ? 5 : 4;
  const stepLabels = showConsentStep
    ? isEngineeringFlow
      ? (["Personal", "Academic", "Emergency", "Security", "NoC"] as const)
      : (["Personal", "Academic", "Emergency", "Security", "Consent letter"] as const)
    : (["Personal", "Academic", "Emergency", "Security"] as const);
  const progressTitle = isCyberCafeVariant
    ? "New student registration"
    : isAdminVariant
      ? "Add student"
      : "Student Registration";
  const progressSubtitle = isCyberCafeVariant
    ? "Register a student on behalf of your cyber café"
    : isAdminVariant
      ? "Multi-step form matching the public registration flow"
      : "UGC-mandated internship programme";

  return (
    <div className="max-w-2xl mx-auto p-2">
      <RegistrationProgressHeader
        step={step}
        maxStep={maxProgressStep}
        stepLabels={stepLabels}
        loading={catalogLoading}
        showLogo={variant === "public"}
        title={progressTitle}
        subtitle={progressSubtitle}
      />

      {!catalogLoading ? (
        <>
      {step === 1 && (
        <div className="space-y-4 animate-fade-in">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label className="text-xs">Full Name *</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-8 text-sm" /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">Gender *</Label>
              <RadioGroup value={gender} onValueChange={setGender} className="flex gap-4 pt-1">
                {["Male", "Female"].map((g) => (
                  <label key={g} className="flex items-center gap-1.5 cursor-pointer text-xs">
                    <RadioGroupItem value={g} id={`g-${g}`} /><span className="text-xs">{g}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Parent Name *</Label><Input value={parentName} onChange={(e) => setParentName(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">Contact Number *</Label>
              <Input
                value={contact}
                onChange={(e) => {
                  setContact(e.target.value.replace(/\D/g, "").slice(0, 10));
                  setRegistrationFieldError((prev) => ({ ...prev, phone: undefined }));
                }}
                className={registrationFieldError.phone ? "border-destructive" : undefined}
              />
              {registrationFieldError.phone && (
                <p className="text-[11px] text-destructive font-medium">{registrationFieldError.phone}</p>
              )}
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs">Email Address *</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setRegistrationFieldError((prev) => ({ ...prev, email: undefined }));
                }}
                className={registrationFieldError.email ? "border-destructive" : undefined}
              />
              {registrationFieldError.email && (
                <p className="text-[11px] text-destructive font-medium">{registrationFieldError.email}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4 animate-fade-in">
          {isEngineeringFlow && (
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 text-sm">
              <p className="font-bold text-primary">
                {selectedUni?.name || "Engineering university"} registration
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Select your university and college, then click Next to open the engineering form for course,
                branch, specialization, and internship details configured for your institution.
              </p>
              {beuDetailsCompleted && beuFormData ? (
                <p className="text-xs text-emerald-700 font-medium mt-2">
                  Engineering details saved: {beuFormData.course} · {beuFormData.branchSubject} ·{" "}
                  {beuFormData.sectionDuration}
                </p>
              ) : null}
            </div>
          )}
          {rosterStatus === "checking" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 border rounded-lg px-3 py-2">
              <Loader2 className="size-3.5 animate-spin" />
              Checking your college's enrolment list…
            </div>
          )}
          {rosterStatus === "matched" && (
            <div className="rounded-xl border-2 border-emerald-500/40 bg-emerald-50 text-emerald-900 p-4 flex items-start gap-3">
              <CheckCircle2 className="size-5 mt-0.5 text-emerald-600 shrink-0" />
              <div className="flex-1">
                <p className="font-black text-sm">
                  Great — we found{rosterMatchedName ? ` ${rosterMatchedName.split(" ")[0]}` : " your record"} in the college roster.
                </p>
                <p className="text-xs mt-1">
                  All academic details are pre-filled below. You can continue straight to payment — no need to fill the emergency-contact step.
                </p>
              </div>
            </div>
          )}
          {rosterStatus === "ambiguous" && (
            <div className="rounded-xl border-2 border-amber-500/40 bg-amber-50 text-amber-900 p-4 text-xs">
              Multiple records matched in the college roster. Please continue and fill the details manually — your registration number will help us reconcile.
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">University *</Label>
              <Select value={universityId} onValueChange={setUniversityId}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select university" /></SelectTrigger>
                <SelectContent>{unis.map((u) => (<SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">College *</Label>
              <Select value={collegeId} onValueChange={setCollegeId} disabled={!universityId}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select college" /></SelectTrigger>
                <SelectContent>{colleges.map((c) => (<SelectItem key={c.id} value={c.id}>{displayCollegeName(c.name)}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            {!isBeuFlow && (
              <>
            <div className="space-y-1"><Label className="text-xs">Degree *</Label>
              <RadioGroup
                value={degree}
                onValueChange={setDegree}
                className="flex gap-4 pt-1"
              >
                {["UG", "PG"].map((d) => (<label key={d} className="flex items-center gap-1.5 cursor-pointer text-xs"><RadioGroupItem value={d} id={`d-${d}`} />{d}</label>))}
              </RadioGroup>
            </div>
            <div className="space-y-1"><Label className="text-xs">Department *</Label>
              <Select
                value={departmentName}
                onValueChange={(val) => { setDepartmentName(val); setSubject(""); setCourse(""); }}
                disabled={!degree}
              >
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder={degree ? "Select dept" : "Select degree first"} /></SelectTrigger>
                <SelectContent>
                  {departmentOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Subject</Label>
              {activeNonTechConfig &&
              (nonTechOptions.branchesByCourse[departmentName] || []).filter((s) => s !== "Other")
                .length > 0 ? (
                <Select value={subject} onValueChange={(val) => { setSubject(val); setCourse(""); }}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Subject" /></SelectTrigger>
                  <SelectContent>
                    {(nonTechOptions.branchesByCourse[departmentName] || [])
                      .filter((s) => s !== "Other")
                      .map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              ) : departmentName?.includes(".") ? (
                <Select value={subject} onValueChange={(val) => { setSubject(val); setCourse(""); }}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Subject" /></SelectTrigger>
                  <SelectContent>
                    {departmentName === "B.A." && baSubjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    {departmentName === "B.Sc" && bscSubjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    {departmentName === "B.Com" && bcomSubjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input className="h-9 text-xs" value={subject} onChange={(e) => setSubject(e.target.value)} />
              )}
            </div>
            <div className="space-y-1"><Label className="text-xs">Session *</Label>
              <Select value={session} onValueChange={setSession}><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Session" /></SelectTrigger><SelectContent>{["2023-2027", "2024-2028", "2025-2029"].map(s => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent></Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Semester *</Label>
              <Select value={classSem} onValueChange={setClassSem}><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Semester" /></SelectTrigger><SelectContent>{[1, 2, 3, 4, 5, 6, 7, 8].map(s => (<SelectItem key={s} value={`Semester ${s}`}>Sem {s}</SelectItem>))}</SelectContent></Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Registration number *</Label><Input value={rollNo} onChange={(e) => setRollNo(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Internship domain *</Label>
              <Select value={course} onValueChange={setCourse} disabled={!subject && !!departmentName?.includes(".")}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder={subject ? "Select domain" : "Select subject first"} /></SelectTrigger>
                <SelectContent>{domainOptions.map((name) => (<SelectItem key={name} value={name}>{name}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Mode *</Label>
              <Select value={internshipMode} onValueChange={setInternshipMode}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Online">Online</SelectItem>
                  <SelectItem value="Offline">Offline</SelectItem>
                  <SelectItem value="Hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>
              </>
            )}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4 animate-fade-in">
          <p className="text-[11px] text-muted-foreground">Emergency details are optional. If you fill any field, complete all three.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label className="text-xs">Emergency contact person name</Label><Input value={emName} onChange={(e) => setEmName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Emergency contact number</Label><Input value={emPhone} onChange={(e) => setEmPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile" /></div>
            <div className="sm:col-span-2 space-y-1.5"><Label className="text-xs">Relationship</Label><Select value={emRel} onValueChange={setEmRel}><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Optional" /></SelectTrigger><SelectContent>{["Father", "Mother", "Guardian", "Other"].map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}</SelectContent></Select></div>
          </div>
        </div>
      )}

      {step === 5 && showConsentStep && (
        <div className="space-y-4 animate-fade-in">
          <div className="rounded-xl border-2 border-primary/20 bg-muted/30 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <FileText className="size-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-foreground">
                  {isEngineeringFlow ? "NoC upload" : "Consent letter"}{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                  {isEngineeringFlow
                    ? "Upload your No Objection Certificate (NoC) if available. Accepted formats: PDF, PNG, JPEG, WebP, or GIF (max 10 MB)."
                    : "Not required. Accepted formats: PDF, PNG, JPEG, WebP, or GIF (max 10 MB)."}
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{isEngineeringFlow ? "NoC document" : "Consent letter"}</Label>
              <label className="flex flex-col sm:flex-row sm:items-center gap-2 cursor-pointer">
                <Input
                  type="file"
                  accept=".pdf,application/pdf,image/png,image/jpeg,image/webp,image/gif"
                  className="h-9 text-xs cursor-pointer"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    setConsentLetterFile(f ?? null);
                  }}
                />
                {consentLetterFile && (
                  <span className="text-[10px] text-muted-foreground truncate">{consentLetterFile.name}</span>
                )}
              </label>
            </div>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
              <Upload className="size-3.5 shrink-0" />
              You can skip this upload and continue to payment.
            </p>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4 animate-fade-in">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Password *</Label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="off"
                  name="student-registration-password"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Confirm Password *</Label>
              <Input
                type={showPw ? "text" : "password"}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                autoComplete="off"
                name="student-registration-password-confirm"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
              />
            </div>
          </div>

          {!isAdminVariant && isRegistrationPaymentRequired(paymentSettings, { isAdmin: isAdminVariant }) && (() => {
            const sCollege = colleges.find((c) => c.id === collegeId);
            const sUni = unis.find((u) => u.id === universityId);
            const fee = resolveStudentFeeBreakdown(
              sUni?.name,
              sCollege?.name,
              sCollege,
              sUni,
              paymentSettings?.amount_paise
            );
            return (
              <div className="rounded-xl border-2 border-primary/25 bg-primary/[0.04] p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-black uppercase tracking-widest text-primary">
                    Payment Summary
                  </p>
                </div>
                {fee.hasBreakdown && fee.componentLineLabels && (
                  <div className="space-y-1 text-sm mb-2">
                    <div className="flex justify-between text-muted-foreground">
                      <span>{fee.componentLineLabels.base}</span>
                      <span className="font-medium text-foreground">{formatRupees(fee.basePaise)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>{fee.componentLineLabels.gst}</span>
                      <span className="font-medium text-foreground">{formatRupees(fee.gstPaise)}</span>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-primary/15 pt-2">
                  <span className="font-bold text-foreground">Total payable</span>
                  <span className="font-black text-xl text-primary">
                    {formatRupees(fee.totalPaise)}
                  </span>
                </div>
              </div>
            );
          })()}

          <label className="flex items-start gap-2 cursor-pointer p-3 rounded-lg bg-muted/50 border">
            <Checkbox checked={agree} onCheckedChange={(v) => setAgree(!!v)} className="mt-1" />
            <span className="text-[10px] text-muted-foreground leading-tight">I agree to the Terms & Privacy Policy and internship terms.</span>
          </label>
        </div>
      )}

      <div className="flex items-center justify-between mt-8 pt-4 border-t">
        <Button variant="ghost" size="sm" onClick={back} disabled={step === 1}><ChevronLeft className="size-4 mr-1" /> Back</Button>
        {step < 4 || (step === 4 && showConsentStep) ? (
          <Button size="sm" onClick={() => void next()} disabled={checkingRegistration}>
            {checkingRegistration ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                Next <ChevronRight className="size-4 ml-1" />
              </>
            )}
          </Button>
        ) : (
          <Button size="sm" variant="hero" onClick={() => void submit()} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
            {isAdminVariant ? "Create student (no payment)" : "Complete Registration"}
          </Button>
        )}
      </div>

        </>
      ) : null}

      {!isAdminVariant && (
        <div className="mt-5 rounded-lg border-2 border-emerald-600/30 bg-emerald-50/95 dark:bg-emerald-950/40 dark:border-emerald-700/50 p-3 sm:p-4 space-y-3 shadow-sm">
          <p className="text-xs sm:text-sm font-bold text-emerald-950 dark:text-emerald-50 text-center sm:text-left leading-snug">
            Call us:{" "}
            <a
              href={`tel:${REGISTRATION_HELP_PHONE_E164.replace(/\s/g, "")}`}
              className="underline decoration-emerald-700 underline-offset-2 font-bold text-emerald-900 dark:text-emerald-100 hover:text-emerald-700"
            >
              {REGISTRATION_HELP_PHONE_DISPLAY}
            </a>
          </p>
          <p className="text-[11px] text-emerald-900/90 dark:text-emerald-200/90 font-semibold text-center sm:text-left leading-snug">
            Updates, deadlines & certificate info — join our WhatsApp channel for alerts.
          </p>
          <Button
            asChild
            size="lg"
            className="w-full font-bold bg-[#25D366] hover:bg-[#20bd5a] text-white border-0 shadow-md h-11 text-sm sm:text-base"
          >
            <a href={REGISTRATION_HELP_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
              <MessageSquare className="size-4 mr-2 shrink-0" aria-hidden />
              Join WhatsApp channel
            </a>
          </Button>
          <p className="text-[10px] text-emerald-900/85 dark:text-emerald-200/90 font-semibold text-center border-t border-emerald-600/20 pt-3">
            Instant support & important alerts — internship से जुड़ी मदद और updates के लिए।
          </p>
        </div>
      )}


      <BeuRegistrationModal
        open={beuModalOpen}
        onOpenChange={setBeuModalOpen}
        colleges={colleges}
        engineeringConfig={activeEngineeringConfig}
        universityLabel={selectedUni?.name}
        initialCollegeId={collegeId}
        initialSession={session}
        initialSemester={classSem}
        initialRegistrationNumber={rollNo}
        initialMode={internshipMode}
        initialDomain={course}
        saving={beuSaving}
        onSubmit={handleBeuModalSubmit}
      />

      <Dialog open={rosterAlreadyRegisteredOpen} onOpenChange={setRosterAlreadyRegisteredOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary font-bold">
              <Info className="size-5" /> This enrolment is already registered
            </DialogTitle>
            <DialogDescription>
              We found a matching record in your college's enrolment list, but it has already
              been registered. Please sign in with your existing account instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setRosterAlreadyRegisteredOpen(false)}
            >
              Keep filling
            </Button>
            <Button
              variant="hero"
              onClick={() => {
                setRosterAlreadyRegisteredOpen(false);
                navigate("/login");
              }}
            >
              Go to login
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
