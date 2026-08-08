// Deploy refresh marker — no functional change (2026-07-08).
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { StudentLearningPanel, type LearningPanelTab } from "@/components/student/StudentLearningPanel";
import { StudentHomeView } from "@/components/student/StudentHomeView";
import { StudentMyCoursesPanel } from "@/components/student/StudentMyCoursesPanel";
import { StudentDocumentPreviewDialog } from "@/components/student/StudentDocumentPreviewDialog";
import { useStudentDocumentActions } from "@/hooks/useStudentDocumentActions";
import { fetchStudentLearningMaterials, type LearningMaterialRow } from "@/lib/learningMaterialsApi";
import { useNavigate, useLocation } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fetchRolesForUser } from "@/lib/portalAuth";
import { Loader2, User, GraduationCap, Phone, ShieldCheck, Download, FileText, ExternalLink, Calendar, MapPin, Award, Briefcase, Mail, Globe, BookOpen, CheckCircle2, LogOut, Bell, Clock, CheckSquare, Edit2, Save, LayoutDashboard } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ScrollableDialogBody, scrollableDialogShellClass } from "@/components/ui/scrollable-dialog";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { ChangePinModal } from "@/components/ChangePinModal";
import { syncDirectoryPasswordAfterAuthChange } from "@/lib/studentCredentials";
import {
  REGISTRATION_PASSWORD_MIN_LENGTH,
  setLoginPasswordViaRpc,
  userFacingPasswordError,
} from "@/lib/registrationPassword";
import { OfferLetter } from "@/components/OfferLetter";
import { IssuedCertificateDocument } from "@/components/IssuedCertificateDocument";
import { downloadOfferLetterPdf } from "@/lib/offerLetterPdf";
import { fetchAllCollegesCatalog } from "@/lib/institutionCatalog";
import {
  certificateDisplayFromRecord,
  resolveUniversityRollNo,
  resolveBnmuUniversityRollNumber,
  hasRequiredCertificateIdentityFields,
} from "@/lib/certificateFormat";
import { downloadCertificatePdf } from "@/lib/certificatePdf";
import {
  hasInternshipAccess,
  internshipUpgradePaymentPath,
  parseStudentAccessScope,
} from "@/lib/studentPaymentAccess";
import { normalizeOfferLetterProfile } from "@/lib/offerLetterProfile";
import { loadStudentDashboardProfile } from "@/lib/loadStudentDashboardProfile";
import { displayRegistrationId } from "@/lib/registrationId";
import {
  enrichStudentProfileForDisplay,
  syncStudentProfileMetadata,
} from "@/lib/studentProfileDisplay";
import { updateOwnStudentProfile } from "@/lib/updateOwnStudentProfile";
import {
  fetchStudentNotifications,
  fetchUnreadNotificationCount,
  markNotificationRead,
} from "@/lib/notificationApi";
import { fetchStudentAssignments } from "@/lib/assignmentApi";
import { matchSubjectToOption, subjectsFor } from "@/lib/subjectOptions";
import {
  ClassLinkRow,
  classJoinUrl,
  inferLinkTypeFromUrl,
  linkTypeLabel,
  studentMatchesClassTargets,
  youtubeEmbedUrl,
} from "@/lib/classLinkTargeting";
import {
  ATTENDANCE_ELIGIBILITY_MIN_PERCENT,
  INTERNSHIP_ATTENDANCE_TOTAL_DAYS,
  calcAttendancePercentage,
  hasAttendanceOnLocalDate,
  isAttendanceEligible,
  isLnmuBnmuAttendanceMarkingBlocked,
  localDayEndExclusive,
  localDayStart,
  minDaysForAttendanceEligibility,
} from "@/lib/attendanceStats";
import { countProgrammePresentDays } from "@/lib/studentPortalDocuments";
import {
  resolveInternshipModeForUniversity,
  resolveInternshipProgrammeConfig,
} from "@/lib/internshipProgramme";
import { isBnmuStudent } from "@/lib/feeRules";
import { isStudentSelfProfileEditBlocked } from "@/lib/studentPolicy";
import { StaffSecurityPanel } from "@/components/staff/StaffAccountPanels";

const UG_DEPARTMENTS = ["B.A.", "B.Sc", "B.Com"] as const;
const PG_DEPARTMENTS = ["M.A.", "M.Sc", "M.Com"] as const;
const ATTENDANCE_HOLD_MS = 10000;

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'home' | 'profile' | 'settings' | 'courses'>('home');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [assignmentsList, setAssignmentsList] = useState<any[]>([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isLearningOpen, setIsLearningOpen] = useState(false);
  const [learningDefaultTab, setLearningDefaultTab] = useState<LearningPanelTab>("classes");
  const [learningMaterials, setLearningMaterials] = useState<LearningMaterialRow[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [academic, setAcademic] = useState<any>(null);
  const [emergency, setEmergency] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [cert, setCert] = useState<any>(null);
  const [isOfferLetterOpen, setIsOfferLetterOpen] = useState(false);
  const [isCertOpen, setIsCertOpen] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [payment, setPayment] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [liveClasses, setLiveClasses] = useState<any[]>([]);
  const [systemSettings, setSystemSettings] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const offerLetterRef = useRef<HTMLDivElement>(null);
  const certRef = useRef<HTMLDivElement>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [editProfileData, setEditProfileData] = useState<any>({});
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [unis, setUnis] = useState<any[]>([]);
  const [colleges, setColleges] = useState<any[]>([]);
  const [domains, setDomains] = useState<any[]>([]);

  // Attendance States
  const [attendanceList, setAttendanceList] = useState<any[]>([]);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [attendanceMarkedToday, setAttendanceMarkedToday] = useState(false);
  const holdTimer = useRef<any>(null);

  const certificateDisplayData = useMemo(
    () => certificateDisplayFromRecord(profile, cert),
    [profile, cert]
  );
  const holdStart = useRef<number>(0);

  const offerLetterProfile = useMemo(
    () => normalizeOfferLetterProfile(profile, payment),
    [profile, payment]
  );
  const studentProfileEditLocked = useMemo(
    () => isStudentSelfProfileEditBlocked(profile?.university_name),
    [profile?.university_name]
  );
  const attendanceStats = useMemo(() => {
    const programme = resolveInternshipProgrammeConfig(
      String(profile?.university_name || "")
    );
    const total = countProgrammePresentDays(
      attendanceList,
      String(profile?.university_name || "")
    );
    const percentage = calcAttendancePercentage(total, programme.programmeDayCount);
    const isEligible = isAttendanceEligible(
      total,
      ATTENDANCE_ELIGIBILITY_MIN_PERCENT,
      programme.programmeDayCount
    );
    return {
      total,
      percentage,
      isEligible,
      attendanceTotalDays: programme.programmeDayCount,
      minDaysForEligibility: minDaysForAttendanceEligibility(
        ATTENDANCE_ELIGIBILITY_MIN_PERCENT,
        programme.programmeDayCount
      ),
    };
  }, [attendanceList, profile?.university_name]);

  const studyNotes = useMemo(
    () => learningMaterials.filter((m) => m.material_type === "learning_material"),
    [learningMaterials]
  );
  const projectReports = useMemo(
    () => learningMaterials.filter((m) => m.material_type === "project_report"),
    [learningMaterials]
  );

  const activeAssignmentCount = useMemo(
    () => assignmentsList.filter((a) => !a.submission).length,
    [assignmentsList]
  );

  const editDepartmentOptions = useMemo(() => {
    if (editProfileData.degree === "PG") return [...PG_DEPARTMENTS];
    if (editProfileData.degree === "UG") return [...UG_DEPARTMENTS];
    return [...UG_DEPARTMENTS, ...PG_DEPARTMENTS];
  }, [editProfileData.degree]);

  const editSubjectOptions = useMemo(
    () => subjectsFor(editProfileData.department),
    [editProfileData.department]
  );

  const refreshAfterRegistration =
    (location.state as { registrationComplete?: boolean } | null)?.registrationComplete === true;

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const queryView = params.get("view");
    if (queryView === "courses") {
      setActiveView("courses");
      return;
    }
    const requestedView = (location.state as { view?: "home" | "profile" | "settings" | "courses" } | null)?.view;
    if (requestedView === "profile" || requestedView === "home" || requestedView === "settings" || requestedView === "courses") {
      setActiveView(requestedView);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.search, location.state, navigate]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      let { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        await new Promise((r) => setTimeout(r, 500));
        const retry = await supabase.auth.getSession();
        session = retry.data.session;
      }

      if (!session) {
        navigate("/login");
        return;
      }

      const impersonateId = localStorage.getItem("impersonate_id");
      const uid = impersonateId || session.user.id;
      const isImpersonating = !!impersonateId;
      setCurrentUserId(session.user.id);

      const email = String(session.user.email || "").trim().toLowerCase();

      const [studentLoad, roleNames, c, ss, n, unreadN, assignmentRows, pay] = await Promise.all([
        loadStudentDashboardProfile(supabase, uid, email, {
          retryUntilComplete: refreshAfterRegistration,
          maxAttempts: refreshAfterRegistration ? 10 : 3,
        }),
        fetchRolesForUser(supabase, session.user.id),
        supabase.from("certificates").select("*").eq("user_id", uid).maybeSingle(),
        supabase.from("system_settings").select("*"),
        fetchStudentNotifications(supabase, uid).catch(() => []),
        fetchUnreadNotificationCount(supabase).catch(() => 0),
        fetchStudentAssignments(supabase).catch(() => []),
        supabase.from("payment_success").select("*").eq("user_id", uid).maybeSingle(),
      ]);

      const roles = (roleNames || []).map((role) => ({ role }));
      const isAdminRole = roles.some((x: any) => x.role === "admin" || x.role === "super_admin");
      const isStaffRole = roles.some((x: any) => x.role === "staff");
      setIsAdmin(isAdminRole);

      if (isStaffRole && !isImpersonating) {
        navigate("/staff-dashboard");
        return;
      }
      if (isAdminRole && !isImpersonating) {
        navigate("/admin");
        return;
      }

      if (studentLoad.loadError) {
        console.warn("[dashboard] student profile load error:", studentLoad.loadError);
      }
      if (!studentLoad.profile && refreshAfterRegistration) {
        toast.error(
          "Your account is ready but profile details are still syncing. Refresh the page in a few seconds."
        );
      }

      setProfile(studentLoad.profile);
      setCert(c.data);
      setPayment(pay.data);
      setSystemSettings(ss.data || []);
      setNotifications(Array.isArray(n) ? n : n?.data || []);
      setUnreadNotifCount(typeof unreadN === "number" ? unreadN : Number(unreadN ?? 0));

      const { data: attData } = await supabase
        .from("attendance")
        .select("*")
        .eq("student_id", uid)
        .order("marked_at", { ascending: false });
      const records = attData || [];
      setAttendanceList(records);
      setAttendanceMarkedToday(hasAttendanceOnLocalDate(records));

      const rows = Array.isArray(assignmentRows) ? assignmentRows : [];
      setAssignmentsList(
        rows.map((assgn) => ({
          id: assgn.id,
          title: assgn.title,
          description: assgn.description,
          duration_minutes: assgn.duration_minutes,
          total_marks: assgn.total_marks,
          passing_marks: assgn.passing_marks,
          due_at: assgn.due_at,
          assignment_type: assgn.assignment_type || "mcq",
          submission: assgn.has_submission
            ? {
                score: assgn.submission_score,
                is_passed: assgn.submission_passed,
                grading_status: assgn.grading_status,
              }
            : null,
        }))
      );

      const domainName =
        studentLoad.profile?.internship_domain || studentLoad.profile?.course;

      const [uData, collegesRows, dData] = await Promise.all([
        supabase.from("universities").select("*").order("name"),
        fetchAllCollegesCatalog(supabase),
        supabase.from("internship_domains").select("*").order("name"),
      ]);
      setUnis(uData.data || []);
      setColleges(collegesRows);
      setDomains(dData.data || []);

      const { data: rpcClasses, error: rpcClassErr } = await supabase.rpc(
        "list_classes_for_student"
      );

      let relevantClasses: ClassLinkRow[] = [];
      if (!rpcClassErr && Array.isArray(rpcClasses)) {
        relevantClasses = rpcClasses as ClassLinkRow[];
      } else {
        const { data: clsData } = await supabase
          .from("classes")
          .select("*")
          .order("scheduled_at", { ascending: true });
        relevantClasses = (clsData || []).filter(
          (cls) =>
            cls.is_active !== false &&
            studentMatchesClassTargets(
              {
                university_name: studentLoad.profile?.university_name,
                college_name: studentLoad.profile?.college_name,
                internship_domain: domainName,
                course: studentLoad.profile?.course,
              },
              cls,
              { colleges: collegesRows, unis: uData.data || [] }
            )
        );
      }

      const domainRows = dData.data || [];
      const domainNameById = Object.fromEntries(domainRows.map((d) => [d.id, d.name]));
      setLiveClasses(
        relevantClasses.map((cls) => ({
          ...cls,
          internship_domains: cls.domain_id
            ? { name: domainNameById[cls.domain_id] || cls.internship_domains?.name }
            : cls.internship_domains,
        }))
      );

      if (studentLoad.profile) {
        fetchStudentLearningMaterials(supabase, studentLoad.profile)
          .then(setLearningMaterials)
          .catch(() => setLearningMaterials([]));
      } else {
        setLearningMaterials([]);
      }

      if (refreshAfterRegistration) {
        navigate(location.pathname, { replace: true, state: {} });
      }
    } catch (err) {
      console.error("Dashboard critical error:", err);
      toast.error("Failed to load dashboard data. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, [navigate, location.pathname, refreshAfterRegistration]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const documentActions = useStudentDocumentActions({
    userId: String(profile?.id || currentUserId),
    profile,
    attendanceRecords: attendanceList,
    projectReports,
    hasCertificate: !!cert,
    onOpenAcceptanceLetter: () => setIsOfferLetterOpen(true),
    onOpenCertificate: () => {
      if (!hasRequiredCertificateIdentityFields(profile)) {
        toast.error(
          isBnmuStudent(profile?.university_name)
            ? "Certificate cannot be opened — your Registration number and Roll number are required. Please update them in your profile."
            : "Certificate cannot be opened — your University Roll Number is missing. Please update it in your profile."
        );
        return;
      }
      setIsCertOpen(true);
    },
    onProfileUpdated: loadDashboard,
  });

  const internshipUnlocked = useMemo(
    () => hasInternshipAccess(parseStudentAccessScope(profile?.metadata)),
    [profile?.metadata]
  );

  const goUnlockInternship = useCallback(() => {
    navigate(internshipUpgradePaymentPath());
  }, [navigate]);

  const downloadCert = async () => {
    if (!hasRequiredCertificateIdentityFields(profile)) {
      toast.error(
        isBnmuStudent(profile?.university_name)
          ? "Certificate cannot be downloaded — your Registration number and Roll number are required. Please update them in your profile."
          : "Certificate cannot be downloaded — your University Roll Number is missing. Please update it in your profile."
      );
      return;
    }
    if (!certRef.current) return;
    setGenerating(true);
    try {
      await downloadCertificatePdf(
        certRef.current,
        `Certificate_${profile?.full_name?.replace(/\s+/g, "_") || "Student"}.pdf`
      );
      toast.success("Certificate downloaded!");
    } catch {
      toast.error("Download failed");
    } finally {
      setGenerating(false);
    }
  };

  const downloadReceipt = async () => {
    if (!receiptRef.current) return;
    setGenerating(true);
    
    const wrapper = document.createElement("div");
    wrapper.style.position = "absolute";
    wrapper.style.top = "-9999px";
    wrapper.style.left = "-9999px";
    wrapper.style.width = "210mm";
    
    const clone = receiptRef.current.cloneNode(true) as HTMLElement;
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    try {
      const canvas = await html2canvas(clone, { scale: 2, useCORS: true, logging: false });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Payment_Receipt_${profile?.full_name?.replace(/\s+/g, "_") || "Apna Intern"}.pdf`);
      toast.success("Receipt downloaded successfully!");
    } catch (error) {
      toast.error("Failed to generate PDF");
    } finally {
      document.body.removeChild(wrapper);
      setGenerating(false);
    }
  };

  const downloadPDF = async () => {
    if (!offerLetterRef.current) return;
    setGenerating(true);
    try {
      await downloadOfferLetterPdf(offerLetterRef.current, {
        fileName: `ApnaIntern_Offer_Letter_${profile?.full_name?.replace(/\s+/g, "_") || "Student"}.pdf`,
        captureInPlace: false,
      });
      toast.success("Offer letter downloaded successfully!");
    } catch (error) {
      console.error("PDF Error:", error);
      toast.error("Failed to generate PDF. Please try again.");
    } finally {
      setGenerating(false);
    }
  };
  
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isStudentSelfProfileEditBlocked(profile?.university_name)) return;
    setIsUpdatingProfile(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = localStorage.getItem("impersonate_id") || session.user.id;

      const previousEmail = String(profile?.email || session.user.email || "")
        .trim()
        .toLowerCase();
      const emailNorm = String(
        editProfileData.email || profile?.email || session.user.email || ""
      )
        .trim()
        .toLowerCase();
      if (!emailNorm || !emailNorm.includes("@")) {
        toast.error("Enter a valid email address.");
        return;
      }

      const { data: freshSnap } = await supabase.from("students").select("metadata").eq("id", uid).maybeSingle();
      const snapMeta =
        typeof freshSnap?.metadata === "object" && freshSnap.metadata !== null
          ? { ...(freshSnap.metadata as Record<string, unknown>) }
          : {};

      const fullName =
        String(editProfileData.full_name || "").trim() ||
        profile?.full_name ||
        session.user.user_metadata?.full_name ||
        "Student";

      const lockedUniversity = String(profile?.university_name || "").trim();
      const lockedCollege = String(profile?.college_name || "").trim();

      const uniForMode = lockedUniversity;
      const resolvedInternshipMode = resolveInternshipModeForUniversity(
        uniForMode,
        editProfileData.internship_mode?.trim() ||
          profile?.internship_mode ||
          (profile?.metadata as Record<string, unknown>)?.internship_mode
      );

      const mergedMeta = syncStudentProfileMetadata(
        {
          university_name: lockedUniversity || profile?.university_name,
          college_name: lockedCollege || profile?.college_name,
          degree: editProfileData.degree ?? profile?.degree,
          department: editProfileData.department ?? profile?.department,
          academic_session: editProfileData.academic_session ?? profile?.academic_session,
          class_semester: editProfileData.class_semester ?? profile?.class_semester,
          roll_number: editProfileData.roll_number ?? profile?.roll_number,
          university_roll_number:
            editProfileData.university_roll_number ?? profile?.university_roll_number,
          course:
            editProfileData.internship_domain ??
            profile?.internship_domain ??
            profile?.course,
          internship_domain:
            editProfileData.internship_domain ?? profile?.internship_domain ?? profile?.course,
          internship_duration:
            editProfileData.internship_duration ?? profile?.internship_duration,
          joining_date: editProfileData.joining_date ?? profile?.joining_date,
          completion_date: editProfileData.completion_date ?? profile?.completion_date,
          subject: editProfileData.subject ?? profile?.subject,
          internship_mode:
            editProfileData.internship_mode?.trim() ||
            profile?.internship_mode ||
            (profile?.metadata as Record<string, unknown>)?.internship_mode,
        },
        {
          ...snapMeta,
          subject: editProfileData.subject,
          university_roll_number:
            editProfileData.university_roll_number ?? profile?.university_roll_number,
          internship_mode:
            editProfileData.internship_mode?.trim() ||
            snapMeta.internship_mode ||
            (profile?.metadata as Record<string, unknown>)?.internship_mode,
        }
      );
      const snapPw =
        typeof snapMeta.password === "string" && String(snapMeta.password).trim()
          ? String(snapMeta.password).trim()
          : "";

      // NOT NULL email/full_name must be sent or INSERT branch of upsert fails
      const row = {
        id: uid,
        email: emailNorm,
        full_name: fullName,
        contact_number: editProfileData.contact_number ?? profile?.contact_number ?? "",
        parent_name: editProfileData.parent_name ?? profile?.parent_name ?? "",
        gender: editProfileData.gender ?? profile?.gender ?? "",
        university_name: lockedUniversity || profile?.university_name || "",
        college_name: lockedCollege || profile?.college_name || "",
        degree: editProfileData.degree ?? profile?.degree ?? "",
        department: editProfileData.department ?? profile?.department ?? "",
        academic_session: editProfileData.academic_session ?? profile?.academic_session ?? "",
        class_semester: editProfileData.class_semester ?? profile?.class_semester ?? "",
        roll_number: editProfileData.roll_number ?? profile?.roll_number ?? "",
        subject: editProfileData.subject ?? profile?.subject ?? "",
        internship_domain: editProfileData.internship_domain ?? profile?.internship_domain ?? profile?.course ?? "",
        course: editProfileData.internship_domain ?? profile?.internship_domain ?? profile?.course ?? "",
        internship_duration:
          editProfileData.internship_duration ?? profile?.internship_duration ?? "",
        joining_date: editProfileData.joining_date ?? profile?.joining_date ?? "",
        completion_date: editProfileData.completion_date ?? profile?.completion_date ?? "",
        emergency_name: editProfileData.emergency_name ?? profile?.emergency_name ?? "",
        emergency_contact: editProfileData.emergency_contact ?? profile?.emergency_contact ?? "",
        emergency_relation: editProfileData.emergency_relation ?? profile?.emergency_relation ?? "",
        status: profile?.status || "Active",
        metadata: mergedMeta,
      };

      await updateOwnStudentProfile(supabase, uid, row);

      if (emailNorm !== previousEmail) {
        await supabase.auth.refreshSession();
      }

      const { error: profileErr } = await supabase.from("profiles").upsert({
        id: uid,
        full_name: fullName,
        email: emailNorm,
        contact_number: row.contact_number,
        gender: row.gender,
        parent_name: row.parent_name,
      });
      if (profileErr) console.warn("profiles sync:", profileErr);

      const { profile: reloaded } = await loadStudentDashboardProfile(supabase, uid, emailNorm, {
        maxAttempts: 3,
      });
      if (reloaded) {
        setProfile(reloaded);
      } else {
        setProfile(
          enrichStudentProfileForDisplay({
            id: uid,
            ...row,
            metadata: mergedMeta,
          })
        );
      }
      
      toast.success(
        emailNorm !== previousEmail
          ? "Profile updated. Sign in with your updated email address from now on."
          : "Profile updated successfully!"
      );
      setIsEditProfileOpen(false);
    } catch (error: any) {
      console.error("Update error:", error);
      toast.error(error.message || "Failed to update profile");
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const isServiceEnabled = (key: string) => {
    const s = systemSettings.find(x => x.key === key);
    return s ? s.is_enabled : true;
  };

  const canMarkAttendanceToday =
    !attendanceMarkedToday && !isLnmuBnmuAttendanceMarkingBlocked(profile?.university_name);

  const startHold = () => {
    if (!canMarkAttendanceToday || isHolding) return;
    if (holdTimer.current) clearInterval(holdTimer.current);
    setIsHolding(true);
    holdStart.current = Date.now();
    setHoldProgress(0);
    holdTimer.current = setInterval(() => {
      const elapsed = (Date.now() - holdStart.current) / ATTENDANCE_HOLD_MS;
      const pct = Math.min(elapsed * 100, 100);
      setHoldProgress(pct);
      if (pct >= 100) {
        clearInterval(holdTimer.current);
        holdTimer.current = null;
        markAttendance();
      }
    }, 50);
  };

  const cancelHold = () => {
    if (holdTimer.current) clearInterval(holdTimer.current);
    holdTimer.current = null;
    setIsHolding(false);
    setHoldProgress(0);
  };

  const markAttendance = async () => {
    setIsHolding(false);
    setHoldProgress(0);
    if (isLnmuBnmuAttendanceMarkingBlocked(profile?.university_name)) {
      toast.error("Self attendance marking is closed for your university.");
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const uid = localStorage.getItem("impersonate_id") || session.user.id;

    // Prefer RPC (sets id/marked_at server-side; works even if table defaults were missing).
    const { data: rpcData, error: rpcErr } = await supabase.rpc("student_mark_attendance");
    if (!rpcErr && rpcData && typeof rpcData === "object") {
      const payload = rpcData as { ok?: boolean; already_marked?: boolean };
      if (payload.already_marked) {
        toast.info("Attendance already marked for today.");
      } else {
        toast.success("Attendance marked successfully.");
      }
      const { data: attData } = await supabase
        .from("attendance")
        .select("*")
        .eq("student_id", uid)
        .order("marked_at", { ascending: false });
      setAttendanceList(attData || []);
      setAttendanceMarkedToday(true);
      return;
    }

    // Fallback: direct insert with explicit id + timestamps
    const dayStart = localDayStart();
    const dayEnd = localDayEndExclusive();
    const { data: existingToday, error: existingErr } = await supabase
      .from("attendance")
      .select("id")
      .eq("student_id", uid)
      .gte("marked_at", dayStart.toISOString())
      .lt("marked_at", dayEnd.toISOString())
      .limit(1);
    if (existingErr) {
      toast.error(existingErr.message || "Failed to validate attendance window.");
      return;
    }
    if (existingToday && existingToday.length > 0) {
      toast.info("Attendance already marked for today.");
      setAttendanceMarkedToday(true);
      return;
    }
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from("attendance").insert({
      id: crypto.randomUUID(),
      student_id: uid,
      is_present: true,
      marked_at: nowIso,
      created_at: nowIso,
    });
    if (error) {
      toast.error(error.message || rpcErr?.message || "Failed to mark attendance");
      return;
    }
    toast.success("Attendance marked successfully.");
    const { data: attData } = await supabase
      .from("attendance")
      .select("*")
      .eq("student_id", uid)
      .order("marked_at", { ascending: false });
    setAttendanceList(attData || []);
    setAttendanceMarkedToday(true);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="size-8 animate-spin text-primary" /></div>;
  }

  const goToDashboardHome = () => setActiveView("home");
  const goToProfileHome = () => setActiveView("profile");

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-[#5AA3E6] flex items-center justify-center shrink-0">
              <span className="text-white font-black text-[11px] tracking-tight">AI</span>
            </div>
            <span className="font-bold text-slate-900 hidden sm:block">Student Portal</span>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <DropdownMenu open={isNotifOpen} onOpenChange={setIsNotifOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="relative p-2">
                  <Bell className="size-5 text-slate-600" />
                  {unreadNotifCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-[10px] font-bold text-white flex items-center justify-center">
                      {unreadNotifCount > 9 ? "9+" : unreadNotifCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 p-0 shadow-elegant">
                <div className="p-4 border-b bg-muted/20">
                  <h3 className="font-bold">Notifications</h3>
                </div>
                <ScrollArea className="max-h-80">
                  {notifications.length === 0 ? (
                     <div className="p-4 text-sm text-center text-muted-foreground">No new notifications</div>
                  ) : (
                    notifications.map((notif: any) => (
                      <button
                        key={notif.id}
                        type="button"
                        className={`w-full text-left p-4 border-b hover:bg-muted/50 transition-colors ${
                          notif.is_read ? "opacity-80" : "bg-primary/5"
                        }`}
                        onClick={() => {
                          void (async () => {
                            try {
                              await markNotificationRead(supabase, notif.id);
                              setNotifications((prev) =>
                                prev.map((x) =>
                                  x.id === notif.id
                                    ? { ...x, is_read: true, read_at: new Date().toISOString() }
                                    : x
                                )
                              );
                              setUnreadNotifCount((c) => Math.max(0, c - (notif.is_read ? 0 : 1)));
                            } catch {
                              /* ignore */
                            }
                          })();
                        }}
                      >
                        <div className="flex justify-between items-start mb-1 gap-2">
                          <h4 className="font-bold text-sm">{notif.title}</h4>
                          {!notif.is_read ? (
                            <Badge className="text-[9px] shrink-0 h-5">New</Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-slate-600 whitespace-pre-wrap">{notif.message}</p>
                        <p className="text-[10px] text-muted-foreground mt-2">
                          {new Date(notif.created_at).toLocaleString([], {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </p>
                      </button>
                    ))
                  )}
                </ScrollArea>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="ghost"
              size="sm"
              className={`text-slate-600 hover:text-primary gap-2 ${
                activeView === "profile" ? "bg-primary/10 text-primary" : ""
              }`}
              onClick={activeView === "home" ? goToProfileHome : goToDashboardHome}
            >
              {activeView === "home" ? (
                <>
                  <User className="size-4" />
                  <span className="hidden sm:inline">Profile</span>
                </>
              ) : (
                <>
                  <LayoutDashboard className="size-4" />
                  <span className="hidden sm:inline">Dashboard</span>
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`text-slate-600 hover:text-primary gap-2 ${activeView === "courses" ? "bg-primary/10 text-primary" : ""}`}
              onClick={() => setActiveView("courses")}
            >
              <GraduationCap className="size-4" />
              <span className="hidden sm:inline">My Courses</span>
            </Button>
            <Button variant="ghost" size="sm" className={`text-slate-600 hover:text-primary gap-2 ${activeView === 'settings' ? 'bg-primary/10 text-primary' : ''}`} onClick={() => setActiveView('settings')}>
              <ShieldCheck className="size-4" />
              <span className="hidden sm:inline">Settings</span>
            </Button>
            <div className="w-px h-4 bg-slate-200 mx-1"></div>
            <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 gap-2" onClick={async () => {
              await supabase.auth.signOut();
              navigate("/login");
            }}>
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>

        </div>
      </header>

      <main className="flex-1 py-8 md:py-10">
        <div className="container mx-auto px-4 max-w-6xl">
          {activeView !== "home" && (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
            <div className="flex items-center gap-5">
              <div className="size-16 md:size-20 rounded-2xl gradient-hero flex items-center justify-center text-white text-3xl font-bold shadow-elegant">
                {profile?.full_name?.charAt(0)}
              </div>
              <div>
                <h1 className="text-3xl md:text-5xl font-bold tracking-tight">Howdy, {profile?.full_name?.split(" ")[0]}!</h1>
                <p className="text-muted-foreground mt-1 flex items-center gap-2">
                  <span className="flex items-center gap-1">Student Dashboard</span>
                  <span className="size-1 rounded-full bg-muted-foreground/30"></span>
                  <span className="text-primary font-medium">
                    Registration ID:{" "}
                    {displayRegistrationId(profile?.registration_id, profile?.created_at)}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {localStorage.getItem("impersonate_id") && (
                <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive/10 w-full sm:w-auto" onClick={() => { localStorage.removeItem("impersonate_id"); window.location.reload(); }}>
                  Exit Preview
                </Button>
              )}
              {isAdmin && !localStorage.getItem("impersonate_id") && (
                <Button variant="outline" className="shadow-sm border-primary/20 hover:bg-primary/5 gap-2 w-full sm:w-auto" onClick={() => navigate("/admin")}>
                  <ShieldCheck className="size-4 text-primary" /> Admin Panel
                </Button>
              )}
              <Button variant="hero" className="gap-2 shadow-lg w-full sm:w-auto" onClick={() => setIsOfferLetterOpen(true)}>
                <FileText className="size-4" /> Offer Letter
              </Button>
            </div>
          </div>
          )}

          {activeView === 'settings' ? (
            <div className="max-w-md mx-auto">
              <Card className="p-8 shadow-elegant border-none bg-white">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /> Security Settings</h3>
                {currentUserId && (
                  <div className="mb-6 p-4 bg-slate-50 rounded-xl border">
                    <p className="text-sm font-bold text-slate-700 mb-3">4-Digit Security Code</p>
                    <p className="text-xs text-slate-500 mb-4">This code is used as an additional layer of protection when you login.</p>
                    <ChangePinModal userId={currentUserId} />
                  </div>
                )}
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const newPass = (form.elements.namedItem('new_password') as HTMLInputElement).value;
                  const confirmPass = (form.elements.namedItem('confirm_password') as HTMLInputElement).value;

                  if (newPass !== confirmPass) return toast.error("Passwords do not match");
                  if (newPass.length < REGISTRATION_PASSWORD_MIN_LENGTH) {
                    return toast.error(
                      `Password must be at least ${REGISTRATION_PASSWORD_MIN_LENGTH} characters`
                    );
                  }

                  try {
                    await setLoginPasswordViaRpc(supabase, newPass);
                    try {
                      await syncDirectoryPasswordAfterAuthChange(supabase, newPass);
                    } catch (syncErr: unknown) {
                      const m = syncErr instanceof Error ? syncErr.message : String(syncErr);
                      toast.warning(
                        `Login password updated, but saving copy for admin emails failed: ${m}. Run migration 20260509232000_student_sync_directory_password_rpc.sql or contact support.`
                      );
                    }
                    toast.success("Password updated successfully!");
                    form.reset();
                  } catch (pwErr: unknown) {
                    toast.error(userFacingPasswordError(pwErr));
                  }
                }} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase">New Password</label>
                    <input name="new_password" type="password" className="w-full p-3 rounded-xl border bg-slate-50 focus:ring-2 focus:ring-primary/20 outline-none transition-all" required placeholder="••••••••" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Confirm New Password</label>
                    <input name="confirm_password" type="password" className="w-full p-3 rounded-xl border bg-slate-50 focus:ring-2 focus:ring-primary/20 outline-none transition-all" required placeholder="••••••••" />
                  </div>
                  <Button type="submit" className="w-full h-12 shadow-glow gap-2 mt-2">
                    <CheckCircle2 className="size-4" /> Update Password
                  </Button>
                </form>
                </Card>
              <div className="mt-6">
                <StaffSecurityPanel isActive={activeView === 'settings'} onSignOutCurrent={async () => { await supabase.auth.signOut(); navigate('/login'); }} />
              </div>
            </div>
          ) : activeView === "courses" ? (
            currentUserId ? (
              <StudentMyCoursesPanel
                studentId={localStorage.getItem("impersonate_id") || currentUserId}
              />
            ) : null
          ) : activeView === 'profile' ? (
            <>
              <div id="profile-section" className="grid lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-2 space-y-6">
              <Card className="p-8 shadow-elegant border-none bg-white relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <User className="size-20 text-primary" />
                </div>
                <div className="flex items-center justify-between border-b pb-4 mb-6">
                  <h3 className="text-lg font-bold flex items-center gap-2"><User className="size-5 text-primary" /> Personal Profile</h3>
                  {!studentProfileEditLocked ? (
                  <Button variant="ghost" size="sm" className="text-primary hover:bg-primary/5 gap-2" onClick={() => {
                    setEditProfileData({
                      email: profile?.email || "",
                      full_name: profile?.full_name || "",
                      contact_number: profile?.contact_number || "",
                      parent_name: profile?.parent_name || profile?.father_name || "",
                      gender: profile?.gender || "",
                      university_name: profile?.university_name || "",
                      college_name: profile?.college_name || "",
                      degree: profile?.degree || "",
                      department: profile?.department || "",
                      subject:
                        matchSubjectToOption(
                          profile?.subject || profile?.metadata?.subject,
                          profile?.department
                        ) ||
                        profile?.subject ||
                        profile?.metadata?.subject ||
                        "",
                      academic_session: profile?.academic_session || "",
                      class_semester: profile?.class_semester || "",
                      roll_number: profile?.roll_number || "",
                      university_roll_number:
                        profile?.university_roll_number ||
                        resolveBnmuUniversityRollNumber(profile) ||
                        "",
                      internship_domain: profile?.internship_domain || profile?.course || "",
                      internship_mode: resolveInternshipModeForUniversity(
                        profile?.university_name,
                        profile?.internship_mode || profile?.metadata?.internship_mode
                      ),
                      internship_duration: profile?.internship_duration || "",
                      joining_date: profile?.joining_date || "",
                      completion_date: profile?.completion_date || "",
                      emergency_name: profile?.emergency_name || "",
                      emergency_contact: profile?.emergency_contact || "",
                      emergency_relation: profile?.emergency_relation || "",
                    });
                    setIsEditProfileOpen(true);
                  }}>
                    <Edit2 className="size-4" /> Edit Profile
                  </Button>
                  ) : null}
                </div>
                <div className="grid md:grid-cols-2 gap-x-8 gap-y-6">
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Full Name</p>
                    <p className="text-sm font-bold text-slate-800">{profile?.full_name || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Email Address</p>
                    <p className="text-sm font-bold text-slate-800 truncate">{profile?.email || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Contact Number</p>
                    <p className="text-sm font-bold text-slate-800">{profile?.contact_number || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Gender</p>
                    <p className="text-sm font-bold text-slate-800">{profile?.gender || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Parent / Guardian Name</p>
                    <p className="text-sm font-bold text-slate-800">{profile?.parent_name || profile?.father_name || "—"}</p>
                  </div>
                </div>
              </Card>

              <Card className="p-8 shadow-elegant border-none bg-white relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <GraduationCap className="size-20 text-primary" />
                </div>
                <h3 className="text-lg font-bold mb-6 flex items-center gap-2 border-b pb-4"><GraduationCap className="size-5 text-primary" /> Academic Information</h3>
                <div className="grid md:grid-cols-2 gap-x-8 gap-y-6">
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">University Name</p>
                    <p className="text-sm font-bold text-slate-800">{profile?.university_name || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">College Name</p>
                    <p className="text-sm font-bold text-slate-800">{profile?.college_name || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Degree Program</p>
                    <p className="text-sm font-bold text-slate-800">{profile?.degree || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Department</p>
                    <p className="text-sm font-bold text-slate-800">{profile?.department || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Major / Subject</p>
                    <p className="text-sm font-bold text-slate-800">{profile?.subject || profile?.metadata?.subject || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Academic Session</p>
                    <p className="text-sm font-bold text-slate-800">{profile?.academic_session || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Class / Semester</p>
                    <p className="text-sm font-bold text-slate-800">{profile?.class_semester || profile?.class_sem || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Registration No.</p>
                    <p className="text-sm font-bold text-slate-800">{profile?.roll_number || "—"}</p>
                  </div>
                  {isBnmuStudent(profile?.university_name) ? (
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Roll No.</p>
                      <p className="text-sm font-bold text-slate-800">
                        {profile?.university_roll_number ||
                          resolveBnmuUniversityRollNumber(profile) ||
                          "—"}
                      </p>
                    </div>
                  ) : null}
                  <div className="space-y-1 md:col-span-2 p-3 bg-primary/5 rounded-lg border border-primary/10">
                    <p className="text-[10px] text-primary font-black uppercase tracking-widest">Internship Domain</p>
                    <p className="text-base font-black text-primary">{profile?.course || profile?.internship_domain || "—"}</p>
                  </div>
                </div>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="p-8 shadow-elegant border-none bg-white relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Phone className="size-20 text-primary" />
                </div>
                <h3 className="text-lg font-bold mb-6 flex items-center gap-2 border-b pb-4"><Phone className="size-5 text-primary" /> Emergency Details</h3>
                <div className="space-y-6">
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Contact Name</p>
                    <p className="text-sm font-bold text-slate-800">{profile?.emergency_name || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Contact Phone</p>
                    <p className="text-sm font-bold text-slate-800">{profile?.emergency_contact || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Relationship</p>
                    <p className="text-sm font-bold text-slate-800">{profile?.emergency_relation || "—"}</p>
                  </div>
                </div>
              </Card>

              <Card className="p-6 border-none bg-gradient-to-br from-primary to-accent text-white shadow-elegant">
                <div className="flex items-start gap-4">
                  <div className="size-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-sm">
                    <Award className="size-6 text-white" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">Status: Active</h4>
                    <p className="text-xs text-white/80 mt-1 leading-relaxed">You are currently enrolled in the internship program. Your progress is being tracked by our team.</p>
                  </div>
                </div>
              </Card>

              <Card className="p-8 shadow-elegant border-none bg-slate-900 text-white overflow-hidden relative">
                <div className="absolute top-0 right-0 p-8 opacity-20">
                  <Briefcase className="size-20" />
                </div>
                <div className="relative z-10">
                  <h3 className="text-xl font-bold mb-3">Support & Help</h3>
                  <p className="text-slate-400 text-sm mb-6 max-w-sm">Need help with your internship or have questions about the portal? Our support team is here to assist you 24/7.</p>
                  <Button variant="outline" className="border-slate-700 hover:bg-slate-800 text-white gap-2 w-full">
                    <ExternalLink className="size-4" /> Contact Support
                  </Button>
                </div>
              </Card>
            </div>
          </div>

          <div className="grid md:grid-cols-1 gap-6">
            <Card className="p-8 shadow-elegant border-none bg-white overflow-hidden relative border-t-4 border-t-primary">
              <div className="absolute -bottom-6 -right-6 opacity-10">
                <FileText className="size-32 text-primary" />
              </div>
              <div className="relative z-10">
                <h3 className="text-2xl font-bold mb-3">Internship Documents</h3>
                <p className="text-muted-foreground text-sm mb-8 max-w-2xl">Access and download your official internship documents. Your offer letter is available immediately, and your certificate will be generated upon successful completion of the program.</p>
                <div className="flex flex-wrap gap-4">
                  <Button variant="default" className="bg-primary hover:bg-primary/90 h-12 px-6 shadow-md gap-2" onClick={() => setIsOfferLetterOpen(true)}>
                    <Download className="size-5" /> Download Offer Letter
                  </Button>
                  <Button variant="outline" className="h-12 px-6 shadow-md gap-2 border-primary/20 hover:bg-primary/5 text-primary" onClick={() => setIsReceiptOpen(true)}>
                    <FileText className="size-5" /> Payment Receipt
                  </Button>
                  {isServiceEnabled('certificates') && (
                    cert ? (
                      <Button
                        variant="hero"
                        className="h-12 px-6 gap-2"
                        onClick={() => {
                          if (!hasRequiredCertificateIdentityFields(profile)) {
                            toast.error(
                              isBnmuStudent(profile?.university_name)
                                ? "Certificate cannot be opened — your Registration number and Roll number are required. Please update them in your profile."
                                : "Certificate cannot be opened — your University Roll Number is missing. Please update it in your profile."
                            );
                            return;
                          }
                          setIsCertOpen(true);
                        }}
                      >
                        <Award className="size-5" /> View & Download Certificate
                      </Button>
                    ) : (
                      <Button variant="outline" className="h-12 px-6 bg-slate-100 border-dashed border-slate-300 gap-2 cursor-not-allowed opacity-60 text-slate-500" disabled>
                        <Award className="size-5" /> Certificate Not Ready
                      </Button>
                    )
                  )}
                </div>
                {isServiceEnabled('certificates') && (
                  <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-100">
                    {!cert ? (
                      <p className="text-sm text-slate-600 flex items-center gap-2">
                        <Loader2 className="size-4 text-primary animate-spin" /> 
                        Your internship is currently in progress. The certificate will be issued automatically after the evaluation phase.
                      </p>
                    ) : (
                      <p className="text-sm text-green-600 font-bold flex items-center gap-2">
                        <CheckCircle2 className="size-4" /> 
                        Congratulations! Your internship certificate has been issued and is ready for download.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </div>
            </>
          ) : (
            <>
              <StudentHomeView
                profile={profile}
                registrationLabel={displayRegistrationId(profile?.registration_id, profile?.created_at)}
                onOfferLetter={() => setIsOfferLetterOpen(true)}
                onOpenLearning={(tab) => {
                  if (!internshipUnlocked) {
                    goUnlockInternship();
                    return;
                  }
                  setLearningDefaultTab(tab);
                  setIsLearningOpen(true);
                }}
                liveClassCount={liveClasses.length}
                notesCount={studyNotes.length}
                activeAssignments={activeAssignmentCount}
                attendanceMarked={attendanceStats.total}
                attendancePercentage={attendanceStats.percentage}
                attendanceProgrammeDays={attendanceStats.attendanceTotalDays}
                attendanceMarkedToday={attendanceMarkedToday}
                documents={documentActions.documents}
                downloadingDoc={documentActions.downloading}
                uploadingConsent={documentActions.uploadingConsent}
                onViewDocument={documentActions.viewDocument}
                onDownloadDocument={documentActions.downloadDocument}
                onUploadDocument={documentActions.uploadDocument}
                studentId={localStorage.getItem("impersonate_id") || currentUserId}
                onOpenMyCourses={() => setActiveView("courses")}
                internshipUnlocked={internshipUnlocked}
                onLockedInternshipClick={goUnlockInternship}
              />
              {documentActions.hiddenPdfNodes}
              <StudentDocumentPreviewDialog
                open={documentActions.previewId != null}
                onOpenChange={(open) => {
                  if (!open) documentActions.setPreviewId(null);
                }}
                documentId={documentActions.previewId}
                fields={documentActions.fields}
                attendanceRecords={documentActions.attendanceRecords}
                issueDate={documentActions.documentIssueDate}
              />
            </>
          )}

          {/* Attendance Section — internship students only */}
          {activeView === 'home' && internshipUnlocked && (
            <div id="attendance-section" className="mt-10 mb-10">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-3"><CheckSquare className="size-6 text-violet-600" /> Attendance</h2>
                <div className="h-px flex-1 mx-6 bg-slate-200 hidden md:block"></div>
                <Badge className="bg-violet-100 text-violet-700 border-none font-black">{attendanceList.length} Total Days</Badge>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                {/* Mark Attendance Card */}
                <Card className="p-8 border-none shadow-elegant bg-gradient-to-br from-slate-900 to-slate-800 text-white flex flex-col items-center justify-center text-center gap-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-5"><CheckSquare className="size-32" /></div>
                  <div>
                    <h3 className="text-xl font-black mb-1">Mark Attendance</h3>
                    <p className="text-slate-400 text-sm">
                      {attendanceMarkedToday
                        ? "Attendance already marked for today."
                        : "Hold the button for 10 seconds to mark (once per calendar day)."}
                    </p>
                  </div>

                  {/* Circular Hold Button */}
                  <div className="relative flex items-center justify-center select-none py-4">
                    <div className="relative flex items-center justify-center">
                      <svg className="absolute" width="160" height="160" style={{ transform: 'rotate(-90deg)' }}>
                        {/* Background Track */}
                        <circle cx="80" cy="80" r="70" fill="none" stroke="#ffffff10" strokeWidth="10" />
                        {/* Progress Line */}
                        <circle
                          cx="80" cy="80" r="70"
                          fill="none"
                          stroke={attendanceMarkedToday ? "#10b981" : !canMarkAttendanceToday ? "#475569" : "#8b5cf6"}
                          strokeWidth="10"
                          strokeDasharray={`${2 * Math.PI * 70}`}
                          strokeDashoffset={`${2 * Math.PI * 70 * (1 - holdProgress / 100)}`}
                          strokeLinecap="round"
                          className="transition-all duration-75 ease-linear"
                          style={{ filter: isHolding ? 'drop-shadow(0 0 8px rgba(139, 92, 246, 0.5))' : 'none' }}
                        />
                      </svg>
                      
                      <button
                        className={`size-32 rounded-full flex flex-col items-center justify-center gap-1 font-black transition-all select-none touch-none z-10
                          ${attendanceMarkedToday
                            ? 'bg-emerald-500/20 text-emerald-400 cursor-not-allowed border-4 border-emerald-500/20'
                            : !canMarkAttendanceToday
                            ? 'bg-slate-800/60 text-slate-500 cursor-not-allowed border-4 border-slate-700/30'
                            : isHolding
                            ? 'bg-violet-600 text-white scale-90 shadow-[0_0_30px_rgba(139,92,246,0.6)]'
                            : 'bg-slate-800 hover:bg-slate-700 text-white shadow-xl active:scale-95 border-4 border-slate-700/50'
                          }`}
                        onMouseDown={startHold}
                        onMouseUp={cancelHold}
                        onMouseLeave={cancelHold}
                        onTouchStart={startHold}
                        onTouchEnd={cancelHold}
                        disabled={!canMarkAttendanceToday}
                      >
                        {attendanceMarkedToday ? (
                          <div className="flex flex-col items-center animate-in zoom-in duration-300">
                            <CheckCircle2 className="size-10 mb-1" />
                            <span className="text-[10px] uppercase tracking-tighter">Verified</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center">
                            {isHolding ? (
                              <>
                                <span className="text-2xl font-black">{Math.round(holdProgress)}%</span>
                                <span className="text-[10px] uppercase tracking-widest opacity-80">Marking...</span>
                              </>
                            ) : (
                              <>
                                <CheckSquare className="size-10 mb-1 opacity-20" />
                                <span className="text-sm font-black uppercase tracking-widest">Hold</span>
                                <span className="text-[8px] opacity-60">10 Seconds</span>
                              </>
                            )}
                          </div>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Stats Row */}
                  <div className="flex items-center gap-6 pt-4 border-t border-white/10 w-full justify-center">
                    <div className="text-center">
                      <div className="text-2xl font-black text-violet-400">{attendanceStats.total}</div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Total Days</div>
                    </div>
                    <div className="w-px h-8 bg-white/10"></div>
                    <div className="text-center">
                      <div className={`text-sm font-black ${attendanceMarkedToday ? 'text-emerald-400' : 'text-red-400'}`}>
                        {attendanceMarkedToday ? '✅ Present' : '❌ Absent'}
                      </div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Today</div>
                    </div>
                  </div>
                </Card>

              <Card className="p-6 border-none shadow-elegant bg-white">
                <h3 className="text-sm font-black text-slate-800 mb-4 uppercase tracking-wider">Attendance Overview</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-violet-50 border border-violet-100 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-violet-700">Total Attendance</p>
                    <p className="text-2xl font-black text-violet-700 mt-1">{attendanceStats.total}</p>
                  </div>
                  <div
                    className={`rounded-xl border p-4 ${
                      attendanceStats.isEligible
                        ? "bg-emerald-50 border-emerald-100"
                        : "bg-amber-50 border-amber-100"
                    }`}
                  >
                    <p
                      className={`text-[10px] font-black uppercase tracking-widest ${
                        attendanceStats.isEligible ? "text-emerald-700" : "text-amber-700"
                      }`}
                    >
                      Attendance %
                    </p>
                    <p
                      className={`text-2xl font-black mt-1 ${
                        attendanceStats.isEligible ? "text-emerald-700" : "text-amber-700"
                      }`}
                    >
                      {attendanceStats.percentage.toFixed(1)}%
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-3">
                  {attendanceStats.total} of {attendanceStats.attendanceTotalDays} internship programme days marked (
                  {attendanceStats.percentage.toFixed(1)}%).
                </p>
              </Card>

                {/* Attendance History Card */}
                <Card className="p-6 border-none shadow-elegant bg-white flex flex-col">
                  <h3 className="font-black text-slate-800 mb-4 flex items-center gap-2">
                    <Clock className="size-5 text-violet-600" /> Attendance History
                  </h3>
                  {attendanceList.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                      <div className="size-16 rounded-full bg-violet-50 flex items-center justify-center mb-4"><CheckSquare className="size-8 text-violet-300" /></div>
                      <p className="text-slate-500 font-medium text-sm">No attendance records yet</p>
                      <p className="text-slate-400 text-xs mt-1">Mark your first attendance using the button</p>
                    </div>
                  ) : (
                    <ScrollArea className="flex-1 max-h-[300px]">
                      <div className="space-y-2 pr-2">
                        {attendanceList.map((rec, idx) => (
                          <div key={rec.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-violet-50 hover:border-violet-100 transition-colors">
                            <div className="flex items-center gap-3">
                              <div className="size-8 rounded-lg bg-violet-100 flex items-center justify-center">
                                <CheckCircle2 className="size-4 text-violet-600" />
                              </div>
                              <div>
                                <div className="text-sm font-bold text-slate-800">
                                  {new Date(rec.marked_at).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                                </div>
                                <div className="text-[11px] text-slate-500 font-medium">
                                  {new Date(rec.marked_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                </div>
                              </div>
                            </div>
                            <Badge className="bg-emerald-50 text-emerald-700 border-none text-[10px] font-black">Present</Badge>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </Card>
              </div>
            </div>
          )}

          {isServiceEnabled('live_classes') && (
            <div id="live-classes-section" className="mt-12">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold flex items-center gap-3"><BookOpen className="size-6 text-primary" /> Live Learning Sessions</h2>
                <div className="h-px flex-1 mx-6 bg-slate-200 hidden md:block"></div>
                <Badge variant="secondary" className="bg-primary/10 text-primary border-none">{liveClasses.length} Scheduled</Badge>
              </div>

              {liveClasses.length > 0 ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {liveClasses.map(c => {
                    const sessionType =
                      c.link_type === "youtube" || inferLinkTypeFromUrl(c.url || "") === "youtube"
                        ? "youtube"
                        : c.link_type;
                    const joinUrl = classJoinUrl(c.url || "", sessionType);
                    const embedUrl = sessionType === "youtube" ? youtubeEmbedUrl(c.url || "") : null;

                    return (
                      <Card key={c.id} className="overflow-hidden border-none shadow-elegant flex flex-col group hover:-translate-y-2 transition-all duration-500 bg-white">
                        <div className="p-3 text-[10px] text-center font-black text-white uppercase tracking-[0.2em] bg-slate-900">
                          {new Date(c.scheduled_at).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}
                        </div>
                        
                        {sessionType === "youtube" && embedUrl ? (
                          <div className="relative w-full aspect-video bg-black shadow-inner">
                            <iframe
                              src={embedUrl}
                              title={c.title || "Live class"}
                              className="absolute inset-0 w-full h-full border-0"
                              allowFullScreen
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            />
                          </div>
                        ) : (
                          <div className="w-full aspect-video bg-indigo-50 flex items-center justify-center flex-col gap-3 p-6 text-center border-b border-indigo-100">
                            <div className="size-16 rounded-full bg-white flex items-center justify-center text-primary shadow-elegant group-hover:scale-110 transition-transform duration-500">
                              <ExternalLink className="size-8" />
                            </div>
                            <div className="font-bold text-sm text-indigo-900">{linkTypeLabel(sessionType)} Session</div>
                          </div>
                        )}
                        
                        <div className="p-6 flex flex-col flex-1">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-black uppercase tracking-wider">{c.internship_domains?.name || "General"}</span>
                            <span className="size-1 rounded-full bg-slate-300"></span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{linkTypeLabel(sessionType)} Session</span>
                          </div>
                          <h3 className="font-bold text-lg leading-tight mb-3 flex-1 text-slate-900">{c.title}</h3>
                          {c.description ? (
                            <p className="text-sm text-muted-foreground mb-4 line-clamp-3">{c.description}</p>
                          ) : null}

                          <div className="mt-auto space-y-3">
                            {sessionType === "youtube" ? (
                              <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-100">
                                <span className="relative flex h-3 w-3 shrink-0">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                                </span>
                                <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">Live on YouTube</span>
                              </div>
                            ) : null}
                            <a href={joinUrl} target="_blank" rel="noopener noreferrer" className="w-full block">
                              <Button className="w-full h-11 bg-primary hover:bg-primary/90 gap-2 shadow-lg transition-all">
                                <ExternalLink className="size-4" />
                                {sessionType === "youtube" ? "Join Class on YouTube" : "Join Class"}
                              </Button>
                            </a>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <Card className="p-16 text-center border-none shadow-elegant bg-white/80 backdrop-blur-sm">
                  <div className="size-20 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-6 shadow-inner">
                    <BookOpen className="size-10 text-slate-300" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-800">Stay Tuned for Classes</h3>
                  <p className="text-slate-500 text-sm max-w-sm mx-auto mt-3 leading-relaxed">There are currently no live sessions scheduled for your internship domain. We'll update this section soon!</p>
                </Card>
              )}
            </div>
          )}

        </div>
      </main>



      <Dialog open={isOfferLetterOpen} onOpenChange={setIsOfferLetterOpen}>
        <DialogContent className={`max-w-4xl shadow-2xl border-none ${scrollableDialogShellClass}`}>
          <DialogHeader className="p-6 pr-14 bg-muted/30 border-b flex flex-row items-center justify-between space-y-0 shrink-0">
            <div>
              <DialogTitle className="text-2xl font-bold">Offer Letter Preview</DialogTitle>
              <DialogDescription>Review your official internship offer letter</DialogDescription>
            </div>
            <Button variant="hero" size="sm" className="gap-2" onClick={downloadPDF} disabled={generating}>
              {generating ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Download PDF
            </Button>
          </DialogHeader>
          
          <ScrollableDialogBody className="bg-slate-100" innerClassName="p-10">
            <OfferLetter ref={offerLetterRef} profile={offerLetterProfile} />
          </ScrollableDialogBody>
          </DialogContent>
        </Dialog>

      {/* Certificate Dialog */}
      <Dialog open={isCertOpen} onOpenChange={setIsCertOpen}>
        <DialogContent className={`max-w-5xl shadow-2xl border-none ${scrollableDialogShellClass}`}>
          <DialogHeader className="p-6 pr-14 bg-muted/30 border-b flex flex-row items-center justify-between space-y-0 shrink-0">
            <div>
              <DialogTitle className="text-2xl font-bold">Internship Certificate</DialogTitle>
              <DialogDescription>Official certificate for completion of internship</DialogDescription>
            </div>
            <Button variant="hero" size="sm" className="gap-2" onClick={downloadCert} disabled={generating}>
              {generating ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Download Certificate
            </Button>
          </DialogHeader>
          <ScrollableDialogBody className="bg-slate-100" innerClassName="p-10 flex justify-center">
            <IssuedCertificateDocument ref={certRef} data={certificateDisplayData} />
          </ScrollableDialogBody>
        </DialogContent>
      </Dialog>

      {/* Payment Receipt Dialog */}
      <Dialog open={isReceiptOpen} onOpenChange={setIsReceiptOpen}>
        <DialogContent className={`max-w-4xl shadow-2xl border-none ${scrollableDialogShellClass}`}>
          <DialogHeader className="p-6 pr-14 bg-muted/30 border-b flex flex-row items-center justify-between space-y-0 shrink-0">
            <div>
              <DialogTitle className="text-2xl font-bold">Payment Receipt</DialogTitle>
              <DialogDescription>Official receipt for your enrollment payment</DialogDescription>
            </div>
            <Button variant="hero" size="sm" className="gap-2" onClick={downloadReceipt} disabled={generating}>
              {generating ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Download PDF
            </Button>
          </DialogHeader>
          
          <ScrollableDialogBody className="bg-slate-100" innerClassName="p-10 flex justify-center">
            <div 
              ref={receiptRef}
                className="w-full max-w-[210mm] bg-white shadow-2xl p-[12mm] md:p-[15mm] text-slate-900 font-sans leading-snug min-h-[297mm] flex flex-col relative overflow-hidden"
                style={{ height: 'auto' }}
              >
                {/* Background Watermark */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 mt-32 select-none">
                  <img src="/logo-icon.png" alt="Watermark" className="w-[85%] max-w-[500px] h-auto object-contain opacity-[0.15] grayscale" crossOrigin="anonymous" />
                </div>

                {/* Custom Header from Certificate */}
                <div className="-mx-[12mm] md:-mx-[15mm] -mt-[12mm] md:-mt-[15mm] mb-8 relative z-10 flex flex-col">
                  {/* Top Banner Shapes */}
                  <div className="w-full h-[14px] relative flex items-start">
                    <div className="w-full h-[7px] bg-[#0084FF] absolute top-0 left-0 z-0"></div>
                    <div className="h-[14px] w-[25%] bg-[#0084FF] absolute top-0 left-0 z-10" style={{ clipPath: 'polygon(0 0, 100% 0, 85% 100%, 0% 100%)' }}></div>
                    <div className="h-[14px] w-[8%] bg-[#CDE6FE] absolute top-0 left-[22%] z-20" style={{ clipPath: 'polygon(25% 0, 100% 0, 75% 100%, 0% 100%)' }}></div>
                  </div>

                  {/* Header Content */}
                  <div className="flex justify-between items-center px-[12mm] md:px-[15mm] py-4 md:py-6">
                    {/* Left Logo */}
                    <div className="flex items-center gap-2 md:gap-3">
                      <div className="size-12 md:size-14 rounded-[10px] md:rounded-[12px] bg-[#5AA3E6] flex items-center justify-center shadow-sm">
                        <span className="text-white font-black text-2xl md:text-3xl tracking-tighter leading-none mt-0.5 md:mt-1">AI</span>
                      </div>
                      <div className="flex items-center text-[1.8rem] md:text-[2.2rem] tracking-tight leading-none mt-0.5 md:mt-1">
                        <span className="font-bold text-[#5AA3E6]">Apna</span>
                        <span className="font-bold text-slate-900"> Intern</span>
                      </div>
                    </div>
                    
                    {/* Right Contact Info */}
                    <div className="flex flex-col items-end gap-1 md:gap-1.5 text-[9px] md:text-[11px] font-medium text-slate-800">
                      <div className="flex items-center gap-1.5 md:gap-2">
                        <span>Arfabad Colony, East Nahar Road, Bajranngpuri, Patna - 800007</span>
                        <div className="bg-[#0084FF] text-white rounded-full p-[2px] md:p-[2.5px]"><MapPin className="size-[8px] md:size-[10px]" strokeWidth={3} /></div>
                      </div>
                      <div className="flex items-center gap-1.5 md:gap-2">
                        <span>7858967071, 9341143791</span>
                        <div className="bg-[#0084FF] text-white rounded-full p-[2px] md:p-[2.5px]"><Phone className="size-[8px] md:size-[10px]" strokeWidth={3} /></div>
                      </div>
                      <div className="flex items-center gap-1.5 md:gap-2">
                        <span>info@apnaintern.in</span>
                        <div className="bg-[#0084FF] text-white rounded-full p-[2px] md:p-[2.5px]"><Mail className="size-[8px] md:size-[10px]" strokeWidth={3} /></div>
                      </div>
                      <div className="flex items-center gap-1.5 md:gap-2">
                        <span>www.apnaintern.in</span>
                        <div className="bg-[#0084FF] text-white rounded-full p-[2px] md:p-[2.5px]"><Globe className="size-[8px] md:size-[10px]" strokeWidth={3} /></div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Bottom Dark Blue Line */}
                  <div className="mx-[12mm] md:mx-[15mm] border-b-[1.5px] border-[#1E3A8A]"></div>
                </div>

                {/* Receipt Content */}
                <div className="relative z-10 flex-1 text-slate-800">
                  <div className="text-center mb-10">
                    <h1 className="text-3xl font-black tracking-tight text-[#1E3A8A] uppercase mb-2">Payment Receipt</h1>
                    <p className="text-slate-500 font-medium">Thank you for your payment</p>
                  </div>

                  <div className="flex justify-between items-start mb-10 pb-8 border-b border-slate-200">
                    <div>
                      <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Billed To</h3>
                      <p className="font-bold text-xl text-slate-900 mb-1">{profile?.full_name}</p>
                      <p className="text-slate-600">{profile?.email}</p>
                      <p className="text-slate-600">{profile?.phone_number}</p>
                    </div>
                    <div className="text-right">
                      <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Receipt Details</h3>
                      <p className="text-slate-700 mb-1"><span className="font-semibold w-24 inline-block text-left">Receipt No:</span> <span className="font-mono font-bold text-slate-900">{payment?.payment_id}</span></p>
                      <p className="text-slate-700 mb-1"><span className="font-semibold w-24 inline-block text-left">Date:</span> <span className="font-medium text-slate-900">{new Date(payment?.created_at || new Date()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span></p>
                      <p className="text-slate-700"><span className="font-semibold w-24 inline-block text-left">Status:</span> <span className="text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded text-sm">PAID</span></p>
                    </div>
                  </div>

                  <div className="mb-10">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b-2 border-slate-800">
                          <th className="py-3 font-bold text-slate-900 uppercase tracking-wider text-sm">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-slate-200">
                          <td className="py-5">
                            <p className="font-bold text-slate-800 text-lg">Internship Program Enrollment</p>
                            <p className="text-slate-500 text-sm mt-1">{profile?.internship_domain || "General"} Domain</p>
                            {profile?.registration_id && (
                              <p className="text-slate-500 text-sm mt-0.5">Reg ID: {profile?.registration_id}</p>
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <p className="text-center text-sm text-slate-600 mt-6">
                      Payment status:{" "}
                      <span className="text-green-600 font-bold">Completed</span>
                    </p>
                  </div>

                  <div className="mt-20 pt-8 border-t border-slate-200 text-center">
                    <p className="text-sm font-bold text-slate-900 mb-1">Apna Intern</p>
                    <p className="text-xs text-slate-500">This is a computer-generated receipt and does not require a physical signature.</p>
                  </div>
                </div>
              </div>
          </ScrollableDialogBody>
        </DialogContent>
      </Dialog>

      <StudentLearningPanel
        open={isLearningOpen}
        onOpenChange={setIsLearningOpen}
        liveClasses={liveClasses}
        assignments={assignmentsList}
        notes={studyNotes}
        attendanceRecords={attendanceList}
        universityName={String(profile?.university_name || "")}
        liveClassesEnabled={isServiceEnabled("live_classes")}
        defaultTab={learningDefaultTab}
        singleModule
      />

      <Dialog open={isEditProfileOpen} onOpenChange={setIsEditProfileOpen}>
        <DialogContent className={`max-w-xl border-none shadow-2xl ${scrollableDialogShellClass}`}>
          <DialogHeader className="p-6 pr-14 bg-muted/30 border-b shrink-0">
            <DialogTitle className="text-2xl font-bold">Edit Profile Details</DialogTitle>
            <DialogDescription>Update your personal and emergency contact information.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateProfile} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <ScrollableDialogBody innerClassName="space-y-8">
              {/* Personal Section */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                  <User className="size-3" /> Personal Information
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Email Address</label>
                    <input
                      type="email"
                      className="w-full p-3 rounded-xl border bg-slate-50 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      value={editProfileData.email || ""}
                      onChange={(e) =>
                        setEditProfileData({ ...editProfileData, email: e.target.value })
                      }
                      placeholder="your.email@example.com"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Full Name</label>
                    <input 
                      className="w-full p-3 rounded-xl border bg-slate-50 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      value={editProfileData.full_name || ""}
                      onChange={e => setEditProfileData({...editProfileData, full_name: e.target.value})}
                      placeholder="Your Full Name"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Contact Number</label>
                    <input 
                      className="w-full p-3 rounded-xl border bg-slate-50 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      value={editProfileData.contact_number || ""}
                      onChange={e => setEditProfileData({...editProfileData, contact_number: e.target.value})}
                      placeholder="Your Phone Number"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Gender</label>
                    <select 
                      className="w-full p-3 rounded-xl border bg-slate-50 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      value={editProfileData.gender || ""}
                      onChange={e => setEditProfileData({...editProfileData, gender: e.target.value})}
                    >
                      <option value="">Select Gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Parent / Guardian Name</label>
                    <input 
                      className="w-full p-3 rounded-xl border bg-slate-50 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      value={editProfileData.parent_name || ""}
                      onChange={e => setEditProfileData({...editProfileData, parent_name: e.target.value})}
                      placeholder="Father's or Mother's Name"
                    />
                  </div>
                </div>
              </div>

              {/* Academic Section */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                  <GraduationCap className="size-3" /> Academic Information
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">University</label>
                    <div className="w-full p-3 rounded-xl border bg-slate-100 text-sm font-semibold text-slate-800">
                      {profile?.university_name || editProfileData.university_name || "—"}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Locked to your registration record. Contact support if this is incorrect.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">College</label>
                    <div className="w-full p-3 rounded-xl border bg-slate-100 text-sm font-semibold text-slate-800">
                      {profile?.college_name || editProfileData.college_name || "—"}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Locked to your registration record. Contact support if this is incorrect.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Degree</label>
                    <select 
                      className="w-full p-3 rounded-xl border bg-slate-50 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      value={editProfileData.degree || ""}
                      onChange={e =>
                        setEditProfileData({
                          ...editProfileData,
                          degree: e.target.value,
                          department: "",
                          subject: "",
                        })
                      }
                    >
                      <option value="">Select Degree</option>
                      <option value="UG">UG</option>
                      <option value="PG">PG</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Department</label>
                    <select 
                      className="w-full p-3 rounded-xl border bg-slate-50 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      value={editProfileData.department || ""}
                      onChange={e =>
                        setEditProfileData({
                          ...editProfileData,
                          department: e.target.value,
                          subject: "",
                        })
                      }
                      disabled={!editProfileData.degree}
                    >
                      <option value="">Select Department</option>
                      {editDepartmentOptions.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Major / Subject</label>
                    {editSubjectOptions.length > 0 ? (
                      <select
                        className="w-full p-3 rounded-xl border bg-slate-50 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                        value={editProfileData.subject || ""}
                        onChange={e =>
                          setEditProfileData({
                            ...editProfileData,
                            subject: e.target.value,
                          })
                        }
                        disabled={!editProfileData.department}
                      >
                        <option value="">Select Subject</option>
                        {editProfileData.subject &&
                          !editSubjectOptions.includes(editProfileData.subject) && (
                            <option value={editProfileData.subject}>{editProfileData.subject}</option>
                          )}
                        {editSubjectOptions.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="w-full p-3 rounded-xl border bg-slate-50 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                        value={editProfileData.subject || ""}
                        onChange={e =>
                          setEditProfileData({ ...editProfileData, subject: e.target.value })
                        }
                        placeholder="e.g. Physics, History"
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Academic Session</label>
                    <select 
                      className="w-full p-3 rounded-xl border bg-slate-50 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      value={editProfileData.academic_session || ""}
                      onChange={e => setEditProfileData({...editProfileData, academic_session: e.target.value})}
                    >
                      <option value="">Select Session</option>
                      <option value="2023-2027">2023-2027</option>
                      <option value="2024-2028">2024-2028</option>
                      <option value="2025-2029">2025-2029</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Semester</label>
                    <select 
                      className="w-full p-3 rounded-xl border bg-slate-50 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      value={editProfileData.class_semester || ""}
                      onChange={e => setEditProfileData({...editProfileData, class_semester: e.target.value})}
                    >
                      <option value="">Select Semester</option>
                      {[1,2,3,4,5,6,7,8].map(s => <option key={s} value={`Semester ${s}`}>Semester {s}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                      Registration number
                    </label>
                    <input
                      className="w-full p-3 rounded-xl border bg-slate-50 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      value={editProfileData.roll_number || ""}
                      onChange={(e) =>
                        setEditProfileData({ ...editProfileData, roll_number: e.target.value })
                      }
                      placeholder="Registration number"
                    />
                  </div>
                  {isBnmuStudent(
                    editProfileData.university_name || profile?.university_name
                  ) ? (
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        Roll number
                      </label>
                      <input
                        className="w-full p-3 rounded-xl border bg-slate-50 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                        value={editProfileData.university_roll_number || ""}
                        onChange={(e) =>
                          setEditProfileData({
                            ...editProfileData,
                            university_roll_number: e.target.value,
                          })
                        }
                        placeholder="Your university roll number"
                      />
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Internship domain</label>
                    <select 
                      className="w-full p-3 rounded-xl border bg-slate-50 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      value={editProfileData.internship_domain || ""}
                      onChange={e => setEditProfileData({...editProfileData, internship_domain: e.target.value, course: e.target.value })}
                    >
                      <option value="">Select Domain</option>
                      {domains.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Internship mode</label>
                    <select 
                      className="w-full p-3 rounded-xl border bg-slate-50 focus:ring-2 focus:ring-primary/20 outline-none transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                      value={editProfileData.internship_mode || "Online"}
                      disabled={isBnmuStudent(editProfileData.university_name || profile?.university_name)}
                      onChange={e => setEditProfileData({...editProfileData, internship_mode: e.target.value})}
                    >
                      <option value="Online">Online</option>
                      <option value="Offline">Offline</option>
                      <option value="Hybrid">Hybrid</option>
                    </select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Internship duration</label>
                    <input 
                      className="w-full p-3 rounded-xl border bg-slate-50 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      value={editProfileData.internship_duration || ""}
                      onChange={e => setEditProfileData({...editProfileData, internship_duration: e.target.value})}
                      placeholder="e.g. 120 Hours"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Internship start date</label>
                    <input 
                      type="date"
                      className="w-full p-3 rounded-xl border bg-slate-50 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      value={editProfileData.joining_date || ""}
                      onChange={e => setEditProfileData({...editProfileData, joining_date: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Expected completion date</label>
                    <input 
                      type="date"
                      className="w-full p-3 rounded-xl border bg-slate-50 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      value={editProfileData.completion_date || ""}
                      onChange={e => setEditProfileData({...editProfileData, completion_date: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-2">
                <div className="flex items-center gap-2 border-b pb-2">
                  <Phone className="size-4 text-primary" />
                  <h4 className="font-bold text-sm">Emergency contact (optional)</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Contact Name</label>
                    <input
                      className="w-full p-3 rounded-xl border bg-slate-50 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      value={editProfileData.emergency_name || ""}
                      onChange={e => setEditProfileData({...editProfileData, emergency_name: e.target.value})}
                      placeholder="Emergency Contact Name"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Contact Phone</label>
                    <input
                      className="w-full p-3 rounded-xl border bg-slate-50 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      value={editProfileData.emergency_contact || ""}
                      onChange={e => setEditProfileData({...editProfileData, emergency_contact: e.target.value})}
                      placeholder="Emergency Phone Number"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Relationship</label>
                    <input
                      className="w-full p-3 rounded-xl border bg-slate-50 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      value={editProfileData.emergency_relation || ""}
                      onChange={e => setEditProfileData({...editProfileData, emergency_relation: e.target.value})}
                      placeholder="e.g. Father, Brother"
                    />
                  </div>
                </div>
              </div>
            </ScrollableDialogBody>
          <DialogFooter className="p-6 border-t gap-2 shrink-0">
            <Button type="button" variant="ghost" onClick={() => setIsEditProfileOpen(false)}>Cancel</Button>
            <Button type="submit" className="gap-2 shadow-glow" disabled={isUpdatingProfile}>
              {isUpdatingProfile ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </div>
  );
};

export default Dashboard;
