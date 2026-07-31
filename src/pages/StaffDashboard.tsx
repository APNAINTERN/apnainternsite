import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ADMIN_LOGIN_PATH, buildStudentCredentialLoginLink } from "@/lib/authRoutes";
import { persistAdminAuthSession, adminIntentionalSignOut, ensureAdminAuthSession, isAdminPortalSessionActive } from "@/lib/adminAuthSession";
import { mergeRegistrationMetadataFromStudentRow } from "@/lib/studentSync";
import {
  hydrateStudentEditWithEngineeringDetails,
  upsertBeuDetailsFromStudentEdit,
} from "@/lib/beuDetails";
import { resolveInternshipModeForUniversity } from "@/lib/internshipProgramme";
import { enrichStudentProfileForDisplay, studentMetadataOf } from "@/lib/studentProfileDisplay";
import { resolveBnmuUniversityRollNumber } from "@/lib/certificateFormat";
import { parseJsonField } from "@/lib/parseJsonField";
import { buildLeadHuntRows } from "@/lib/leadHunt";
import {
  LEAD_CRM_STATUS_LABELS,
  LEAD_CRM_STATUSES,
  STAFF_ACTION_STATUSES,
  countStaffCallsInRange,
  fetchStaffLeadTargets,
  mergeHuntWithCrm,
  staffUpdateLeadCrm,
  startOfDay,
  startOfMonth,
  startOfWeek,
  type LeadAssignmentView,
  type LeadCrmRow,
  type LeadCrmStatus,
  type StaffLeadTargets,
} from "@/lib/leadAssignment";
import { fetchAllSupabaseRows } from "@/lib/fetchAllSupabaseRows";
import { fetchAllCollegesCatalog } from "@/lib/institutionCatalog";
import { siteApiUrl, usePollingInsteadOfRealtime } from "@/lib/siteApi";
import { shouldRunBackgroundPoll } from "@/lib/apiPollingGuard";
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  Target, 
  Bell, 
  Mail, 
  Video, 
  Award, 
  Shield,
  LogOut,
  Loader2,
  Menu,
  Search,
  Filter,
  Eye,
  MoreHorizontal,
  UserPlus,
  Phone,
  User,
  CheckCircle2,
  Lock,
  GraduationCap,
  MapPin,
  MessageSquare,
  BookOpen,
  Calendar,
  ToggleLeft,
  ToggleRight,
  Send,
  Plus,
  Trash2,
  CheckSquare,
  Edit,
  Download,
  KeyRound,
  FileText,
  Briefcase,
  Store,
  LogIn,
  Megaphone,
  Wrench,
  Cog,
  ClipboardList,
  X,
  CalendarDays,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import Papa from "papaparse";
import { OfferLetter } from "@/components/OfferLetter";
import { downloadOfferLetterPdf } from "@/lib/offerLetterPdf";
import { normalizeOfferLetterProfile } from "@/lib/offerLetterProfile";
import { EDIT_GENDER_SENTINEL, generateTempPassword } from "@/lib/studentCredentials";
import { adminUpsertStudentProfile } from "@/lib/adminProfileUpsert";
import { StudentEditFormFields } from "@/components/StudentEditFormFields";
import type { StudentEditFormVariant } from "@/components/StudentEditFormFields";
import {
  aggregateEngineeringCatalogOptions,
  fetchAllEngineeringConfigs,
} from "@/lib/engineeringConfig";
import {
  isEngineeringUniversityName,
  resolveEngineeringUniversityNames,
} from "@/lib/studentTrack";
import { StudentProfileViewDialog } from "@/components/admin/StudentProfileViewDialog";
import { RegistrationForm } from "@/components/RegistrationForm";
import { validateRegistrationPassword } from "@/lib/registrationPassword";
import { transferLeadToStudentDirectory } from "@/lib/transferLeadToStudent";
import { resolveLeadStoredPassword } from "@/lib/leadTransferPayload";
import { AdminAddRegistrationPanel } from "@/components/AdminAddRegistrationPanel";
import {
  hasStaffPerm,
  mergeStaffPermissions,
  type StaffPermissions,
} from "@/lib/staffPermissions";
import {
  logStaffActivity,
  revokeStaffSession,
  getOrCreateStaffSessionKey,
  touchStaffSession,
} from "@/lib/staffSessions";
import {
  StaffProfilePanel,
  StaffSecurityPanel,
  StaffOwnAttendancePanel,
} from "@/components/staff/StaffAccountPanels";
import { StaffRequestsPanel } from "@/components/staff/StaffRequestPanels";
import {
  StaffAssignmentsPanel,
  StaffCertificatesPanel,
  StaffClassesPanel,
  StaffCommsPanel,
  StaffEngineeringPanel,
  StaffEngineeringManagementPanel,
  StaffNonEngineeringManagementPanel,
  StaffAttendanceTrackingPanel,
  StaffCybercafePanel,
  StaffInstitutionsPanel,
  StaffIdCardsPanel,
  StaffUploadsPanel,
  StaffFeesPanel,
  StaffCoursesPanel,
  StaffReferralsPanel,
  StaffCollegeRostersPanel,
  StaffEmployeeAttendanceStandalonePanel,
  StaffSettingsPanel,
  StaffNotificationsServicePanel,
} from "@/components/staff/StaffServicePanels";
import { StaffStudentDirectoryPanel } from "@/components/staff/StaffStudentDirectoryPanel";
import type { StudentDirectoryStudent } from "@/components/admin/StudentDirectoryActionsMenu";
import { fetchAdminStudentsLight } from "@/lib/adminStudentDirectory";
import type { AdminStaffProfile } from "@/lib/staffProfile";
import { resolveStorageUrl } from "@/lib/storageUrl";

const STAFF_PAGE_SIZE = 20;

function StaffTablePagination({
  page,
  setPage,
  total,
  label,
}: {
  page: number;
  setPage: (fn: (p: number) => number) => void;
  total: number;
  label: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / STAFF_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const from = total === 0 ? 0 : safePage * STAFF_PAGE_SIZE + 1;
  const to = Math.min(total, (safePage + 1) * STAFF_PAGE_SIZE);

  return (
    <div className="p-4 bg-muted/10 border-t flex flex-col md:flex-row items-center justify-between gap-4 mt-0 rounded-b-xl">
      <div className="text-xs text-muted-foreground font-medium">
        Showing {from} to {to} of {total} {label}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage((p) => p - 1)}>
          Previous
        </Button>
        <div className="flex items-center gap-1">
          {Array.from({ length: pageCount }, (_, i) => i)
            .filter((pageNum) => {
              if (pageCount <= 7) return true;
              return (
                Math.abs(pageNum - safePage) <= 2 || pageNum === 0 || pageNum === pageCount - 1
              );
            })
            .map((pageNum, i, arr) => (
              <div key={pageNum} className="flex items-center gap-1">
                {i > 0 && pageNum - arr[i - 1] > 1 && (
                  <span className="text-muted-foreground px-1 text-xs">...</span>
                )}
                <Button
                  variant={safePage === pageNum ? "default" : "outline"}
                  size="sm"
                  className="size-8 p-0"
                  onClick={() => setPage(pageNum)}
                >
                  {pageNum + 1}
                </Button>
              </div>
            ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={safePage >= pageCount - 1}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

const StaffDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [staffName, setStaffName] = useState("");
  const [staffEmail, setStaffEmail] = useState<string | null>(null);
  const [staffProfile, setStaffProfile] = useState<AdminStaffProfile | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<StaffPermissions | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  
  // Data States
  const [students, setStudents] = useState<any[]>([]);
  const [enrolledEmailSet, setEnrolledEmailSet] = useState<Set<string>>(() => new Set());
  const [directoryActions, setDirectoryActions] = useState<{
    onViewDetails: (student: StudentDirectoryStudent) => void;
    onEditDetails: (student: StudentDirectoryStudent) => void;
    onResetPassword: (student: StudentDirectoryStudent) => void;
    onResendCredentials: (student: StudentDirectoryStudent) => void;
    onViewConsentLetter: (student: StudentDirectoryStudent) => void;
    onUploadConsentLetter: (student: StudentDirectoryStudent) => void;
    onViewLogbook: (student: StudentDirectoryStudent) => void;
    onDownloadAttendanceReport: (student: StudentDirectoryStudent) => void;
    onDownloadOfferLetter: (student: StudentDirectoryStudent) => void;
    onToggleBlock: (student: StudentDirectoryStudent) => void;
    onDelete: (student: StudentDirectoryStudent) => void;
  } | null>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [failedPayments, setFailedPayments] = useState<any[]>([]);
  const [cancelledPayments, setCancelledPayments] = useState<any[]>([]);
  const [registrationDraftLeads, setRegistrationDraftLeads] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [classesList, setClassesList] = useState<any[]>([]);
  const [domains, setDomains] = useState<any[]>([]);
  const [unis, setUnis] = useState<any[]>([]);
  const [colleges, setColleges] = useState<any[]>([]);
  const [addStudentFormKey, setAddStudentFormKey] = useState(0);
  const [directoryRefreshKey, setDirectoryRefreshKey] = useState(0);
  
  // UI States
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [paySearchTerm, setPaySearchTerm] = useState("");
  const [leadsSearchTerm, setLeadsSearchTerm] = useState("");
  const [leadsStatusFilter, setLeadsStatusFilter] = useState<LeadCrmStatus | "all">("all");
  const [leadsDateFrom, setLeadsDateFrom] = useState("");
  const [leadsDateTo, setLeadsDateTo] = useState("");
  const [leadsFiltersOpen, setLeadsFiltersOpen] = useState(false);
  const [myLeadCrm, setMyLeadCrm] = useState<LeadCrmRow[]>([]);
  const [myLeadTargets, setMyLeadTargets] = useState<StaffLeadTargets | null>(null);
  const [myCallCounts, setMyCallCounts] = useState({ daily: 0, weekly: 0, monthly: 0 });
  const [leadActionOpen, setLeadActionOpen] = useState(false);
  const [leadActionRow, setLeadActionRow] = useState<LeadAssignmentView | null>(null);
  const [leadActionStatus, setLeadActionStatus] = useState<LeadCrmStatus>("contacted");
  const [leadActionRemarks, setLeadActionRemarks] = useState("");
  const [leadActionFollowUp, setLeadActionFollowUp] = useState("");
  const [leadActionSaving, setLeadActionSaving] = useState(false);
  const [payPage, setPayPage] = useState(0);
  const [leadsPage, setLeadsPage] = useState(0);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isResetPassOpen, setIsResetPassOpen] = useState(false);
  const [isTransferPassOpen, setIsTransferPassOpen] = useState(false);
  const [transferLeadTarget, setTransferLeadTarget] = useState<any>(null);
  const [transferPassword, setTransferPassword] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [editData, setEditData] = useState<any>(null);
  const [editFormVariant, setEditFormVariant] = useState<StudentEditFormVariant>("directory");
  const [engineeringUniNames, setEngineeringUniNames] = useState<string[]>([]);
  const [engCatalog, setEngCatalog] = useState(() => aggregateEngineeringCatalogOptions([]));
  const [newPassword, setNewPassword] = useState("");

  const [bulkEmailSubject, setBulkEmailSubject] = useState("");
  const [bulkEmailBody, setBulkEmailBody] = useState("");
  const [isSendingBulk, setIsSendingBulk] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);

  const [newNoticeTitle, setNewNoticeTitle] = useState("");
  const [newNoticeMessage, setNewNoticeMessage] = useState("");
  const [newNoticeTarget, setNewNoticeTarget] = useState("all");
  const [newNoticeTargetUserId, setNewNoticeTargetUserId] = useState("");

  const [newClassTitle, setNewClassTitle] = useState("");
  const [newClassType, setNewClassType] = useState("youtube");
  const [newClassUrl, setNewClassUrl] = useState("");
  const [newClassSchedule, setNewClassSchedule] = useState("");

  const [downloadEmail, setDownloadEmail] = useState("");
  const offerLetterRef = useRef<HTMLDivElement>(null);

  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);

  // Recovery States
  const [recoveryQuery, setRecoveryQuery] = useState("");
  const [recoveryPaymentData, setRecoveryPaymentData] = useState<any>(null);
  const [isRecoveryRegistered, setIsRecoveryRegistered] = useState(false);
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  const handleFetchRazorpayPayment = async () => {
    if (!recoveryQuery) return toast.error("Enter an email or Payment ID");
    setRecoveryLoading(true);
    setRecoveryPaymentData(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || '';
      const res = await fetch(siteApiUrl('/api/razorpay-recovery'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ action: 'fetch_razorpay_payment', query: recoveryQuery })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to fetch from Razorpay');
      
      setRecoveryPaymentData(data.payment);
      setIsRecoveryRegistered(data.isRegistered);
      toast.success("Payment details fetched successfully");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleRecoverPayment = async () => {
    if (!recoveryPaymentData) return;
    if (!isRecoveryRegistered && !recoveryPassword) return toast.error("Enter a password to create the student account");
    
    setProcessing(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || '';
      const res = await fetch(siteApiUrl('/api/razorpay-recovery'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          action: 'recover_payment_and_create_student',
          paymentDetails: {
            name: recoveryPaymentData.notes?.name || recoveryPaymentData.notes?.fullName || recoveryPaymentData.notes?.full_name || 'Student',
            email: recoveryPaymentData.email,
            amount: recoveryPaymentData.amount / 100,
            paymentId: recoveryPaymentData.id,
            contact: recoveryPaymentData.contact
          },
          password: recoveryPassword
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Recovery failed');
      
      toast.success(data.isNewUser ? "Account created & payment recovered!" : "Payment recovered for existing user!");
      setRecoveryPaymentData(null);
      setRecoveryQuery("");
      setRecoveryPassword("");
      
      await logAdminAction('RECOVER_PAYMENT', 'payment', `Recovered payment ${recoveryPaymentData.id} for ${recoveryPaymentData.email}`);
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const refreshPermissions = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    
    const { data: perms } = await supabase.from("admin_permissions").select("*").eq("user_id", session.user.id).maybeSingle();
    const [{ data: staffById }, { data: staffByEmail }] = await Promise.all([
      supabase.from("admin_staff").select("*").eq("id", session.user.id).maybeSingle(),
      session.user.email
        ? supabase.from("admin_staff").select("*").eq("email", session.user.email).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const staffRow = (staffById || staffByEmail) as AdminStaffProfile | null;
    
    if (staffRow?.is_blocked) {
      toast.error("Your staff account is blocked. Contact an administrator.");
      await supabase.auth.signOut();
      navigate(ADMIN_LOGIN_PATH);
      return;
    }
    
    if (staffRow) {
      setStaffProfile(staffRow);
      if (staffRow.full_name) setStaffName(staffRow.full_name);
      if (staffRow.email) setStaffEmail(staffRow.email);
    }
    
    setPermissions(
      mergeStaffPermissions(
        perms,
        typeof staffRow?.permissions === "object" && staffRow.permissions !== null
          ? staffRow.permissions
          : {}
      )
    );
  };

  /** Lightweight idle refresh — avoid re-downloading full payment/lead tables every few minutes. */
  const loadStaffLightRefresh = async () => {
    try {
      const { data: crm } = await supabase
        .from("lead_crm")
        .select("*")
        .order("updated_at", { ascending: false });
      setMyLeadCrm((crm || []) as LeadCrmRow[]);
    } catch (e) {
      console.error("Light refresh lead_crm Error:", e);
    }

    try {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (uid) {
        const targets = await fetchStaffLeadTargets(supabase, uid);
        setMyLeadTargets(targets[0] || null);
        const now = new Date();
        const dayStart = startOfDay(now).toISOString();
        const weekStart = startOfWeek(now).toISOString();
        const monthStart = startOfMonth(now).toISOString();
        const tomorrow = new Date(startOfDay(now));
        tomorrow.setDate(tomorrow.getDate() + 1);
        const [daily, weekly, monthly] = await Promise.all([
          countStaffCallsInRange(supabase, uid, dayStart, tomorrow.toISOString()),
          countStaffCallsInRange(supabase, uid, weekStart, tomorrow.toISOString()),
          countStaffCallsInRange(supabase, uid, monthStart, tomorrow.toISOString()),
        ]);
        setMyCallCounts({ daily, weekly, monthly });
      }
    } catch (e) {
      console.error("Light refresh lead targets Error:", e);
    }

    try {
      const { data: nt } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      setNotifications(nt || []);
    } catch (e) {
      console.error("Light refresh notifications Error:", e);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      resolveEngineeringUniversityNames(supabase),
      fetchAllEngineeringConfigs(supabase),
    ])
      .then(([names, configs]) => {
        if (cancelled) return;
        setEngineeringUniNames(names);
        setEngCatalog(aggregateEngineeringCatalogOptions(configs));
      })
      .catch(() => {
        if (!cancelled) {
          setEngineeringUniNames([]);
          setEngCatalog(aggregateEngineeringCatalogOptions([]));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    checkAuth();
    if (usePollingInsteadOfRealtime()) {
      // Was 5 min full-table dump; now 15 min light CRM/targets/notifications only.
      const STAFF_POLL_MS = 15 * 60 * 1000;
      const poll = window.setInterval(() => {
        if (!shouldRunBackgroundPoll()) return;
        void loadStaffLightRefresh();
        void refreshPermissions();
      }, STAFF_POLL_MS);
      return () => window.clearInterval(poll);
    }
    const leadsChannel = supabase
      .channel('staff_data_stream')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_cancelled' }, () => { loadData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_leads' }, () => { loadData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_success' }, () => { loadData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_permissions' }, () => { refreshPermissions(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_staff' }, () => { refreshPermissions(); })
      .subscribe();
    return () => { supabase.removeChannel(leadsChannel); };
  }, []);

  const checkAuth = async () => {
    try {
    let {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session && isAdminPortalSessionActive()) {
      await ensureAdminAuthSession(supabase);
      ({
        data: { session },
      } = await supabase.auth.getSession());
    }
    if (!session) {
      navigate(ADMIN_LOGIN_PATH);
      return;
    }
    setCurrentUserId(session.user.id);
    
    // Authoritative role check — user_roles only. user_metadata is client
    // editable and MUST NOT gate access to the staff dashboard.
    let roleNames: string[] = [];
    try {
      const { fetchRolesForUser } = await import("@/lib/portalAuth");
      roleNames = await fetchRolesForUser(supabase, session.user.id);
    } catch (rolesError) {
      const msg = rolesError instanceof Error ? rolesError.message : String(rolesError);
      console.error("[StaffDashboard] user_roles:", msg);
      toast.error("Could not verify your staff access. Ask an admin to run supabase/hotfix_staff_user_roles_rls.sql.");
      await supabase.auth.signOut();
      navigate(ADMIN_LOGIN_PATH);
      return;
    }
    const hasAuthorizedRole = roleNames.some(
      (r) => r === "admin" || r === "staff" || r === "super_admin"
    );
    if (!hasAuthorizedRole) {
      toast.error("You don't have staff access on this account. Sign in at the admin portal with a staff email.");
      await supabase.auth.signOut();
      navigate(ADMIN_LOGIN_PATH);
      return;
    }

    persistAdminAuthSession();
    
    setStaffName(session.user.user_metadata?.full_name || "Staff Member");
    setStaffEmail(session.user.email || null);
    setCurrentUserId(session.user.id);
    
    await refreshPermissions();

    try {
      await touchStaffSession();
      await logStaffActivity("login", "Staff dashboard session started");
    } catch (e) {
      console.warn("[StaffDashboard] session touch failed", e);
    }

    // Show shell immediately — do not block on payments/leads/31k-student light list.
    setLoading(false);
    void loadData().catch((e) => console.error("Staff background loadData:", e));
    } catch (err) {
      console.error("[StaffDashboard] checkAuth:", err);
      toast.error("Could not open Staff Panel. Try signing in again.");
      setLoading(false);
      navigate(ADMIN_LOGIN_PATH);
    }
  };

  /** Keep enrolled-email set in sync via the same Admin light list used by modules. */
  const refreshEnrolledEmails = async () => {
    setStudentsLoading(true);
    try {
      const rows = await fetchAdminStudentsLight(supabase);
      setStudents(rows);
      setEnrolledEmailSet(
        new Set(
          rows
            .map((s) => String(s.email || "").toLowerCase().trim())
            .filter(Boolean)
        )
      );
      return rows.length;
    } catch (err: unknown) {
      console.error("Staff refreshEnrolledEmails:", err);
      setStudents([]);
      setEnrolledEmailSet(new Set());
      return 0;
    } finally {
      setStudentsLoading(false);
    }
  };

  const fetchStudents = async (_searchOverride?: string) => {
    return refreshEnrolledEmails();
  };

  const loadData = async () => {
    // 1. Load payment_success
    try {
      const rows = await fetchAllSupabaseRows(supabase, "payment_success", {
        orderBy: "created_at",
        ascending: false,
      });
      // Include rows with status='success', status=null, or any non-failed status
      setPayments(rows.filter((p: any) => p.status !== 'failed'));
      setFailedPayments(rows.filter((p: any) => p.status === 'failed'));
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      console.error("Load payment_success Error:", e);
      if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('rls') || msg.toLowerCase().includes('row-level') || msg.toLowerCase().includes('policy')) {
        toast.error('Payments blocked by database policy. Ask an admin to run supabase/hotfix_staff_full_access.sql in the Supabase SQL Editor.');
      } else {
        toast.error('Failed to load payments. Check console for details.');
      }
    }

    // 2. Load payment_cancelled
    try {
      const rows = await fetchAllSupabaseRows(supabase, "payment_cancelled", {
        orderBy: "created_at",
        ascending: false,
      });
      setCancelledPayments(rows);
    } catch (e: any) {
      console.error("Load payment_cancelled Error:", e);
    }

    // 3. Load registration_leads
    try {
      const rows = await fetchAllSupabaseRows(supabase, "registration_leads", {
        orderBy: "updated_at",
        ascending: false,
      });
      setRegistrationDraftLeads(rows);
    } catch (e: any) {
      console.error("Load registration_leads Error:", e);
    }

    // 3b. Assigned lead CRM + targets (staff-scoped by RLS)
    try {
      const { data: crm } = await supabase
        .from("lead_crm")
        .select("*")
        .order("updated_at", { ascending: false });
      setMyLeadCrm((crm || []) as LeadCrmRow[]);
    } catch (e) {
      console.error("Load lead_crm Error:", e);
      setMyLeadCrm([]);
    }

    try {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (uid) {
        const targets = await fetchStaffLeadTargets(supabase, uid);
        setMyLeadTargets(targets[0] || null);
        const now = new Date();
        const dayStart = startOfDay(now).toISOString();
        const weekStart = startOfWeek(now).toISOString();
        const monthStart = startOfMonth(now).toISOString();
        const tomorrow = new Date(startOfDay(now));
        tomorrow.setDate(tomorrow.getDate() + 1);
        const [daily, weekly, monthly] = await Promise.all([
          countStaffCallsInRange(supabase, uid, dayStart, tomorrow.toISOString()),
          countStaffCallsInRange(supabase, uid, weekStart, tomorrow.toISOString()),
          countStaffCallsInRange(supabase, uid, monthStart, tomorrow.toISOString()),
        ]);
        setMyCallCounts({ daily, weekly, monthly });
      }
    } catch (e) {
      console.error("Load lead targets Error:", e);
    }

    // 4. Load meta (domains, classes, notifications, unis, colleges) independently
    try {
      const [dom, cl, nt, uniRes, collegesRows] = await Promise.all([
        supabase.from("internship_domains").select("*"),
        supabase.from("classes").select("*").order("scheduled_at", { ascending: false }),
        supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("universities").select("*").order("name"),
        fetchAllCollegesCatalog(supabase),
      ]);
      setUnis(uniRes.data || []);
      setColleges(collegesRows);
      setDomains(dom.data || []);
      setClassesList(cl.data || []);
      setNotifications(nt.data || []);
    } catch (e) { console.error("Load meta Error:", e); }

    // Full student light list is heavy (~30k rows). Only needed for lead enrolled-email checks.
    // Defer until leads tab / explicit refresh — never block Staff shell on this.
  };

  const handleDownloadOffer = async (student: any) => {
    setSelectedUser(normalizeOfferLetterProfile(student));
    setProcessing(true);
    
    // Give time for the hidden component to render with the new data
    setTimeout(async () => {
      if (!offerLetterRef.current) {
        toast.error("Generation failed - element not found");
        setProcessing(false);
        return;
      }

      try {
        await downloadOfferLetterPdf(offerLetterRef.current, {
          fileName: `EzyIntern_Offer_Letter_${student.full_name?.replace(/\s+/g, "_") || "Student"}.pdf`,
          captureInPlace: false,
        });
        toast.success("Offer letter downloaded successfully!");
      } catch (error) {
        console.error("PDF Error:", error);
        toast.error("Failed to generate PDF");
      } finally {
        setProcessing(false);
      }
    }, 800);
  };

  const handleManualDownload = async () => {
    if (!downloadEmail) return toast.error("Please enter an email address");
    setProcessing(true);
    try {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .eq("email", downloadEmail.trim())
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        toast.error("No student found with this email");
        setProcessing(false);
        return;
      }

      await handleDownloadOffer(data);
    } catch (e: any) {
      toast.error(e.message);
      setProcessing(false);
    }
  };

  const handleSendNotification = async () => {
    if (!newNoticeTitle || !newNoticeMessage) return toast.error("Fill all fields");
    setProcessing(true);
    try {
      let targetUid = null;
      if (newNoticeTarget === "specific") {
        const { data: student } = await supabase.from("students").select("id").or(`registration_id.eq.${newNoticeTargetUserId},id.eq.${newNoticeTargetUserId}`).maybeSingle();
        if (!student) throw new Error("Student not found");
        targetUid = student.id;
      }
      const { error } = await supabase.from("notifications").insert({ title: newNoticeTitle, message: newNoticeMessage, target_type: newNoticeTarget, target_user_id: targetUid, created_by: currentUserId });
      if (error) throw error;
      toast.success("Notification sent!");
      setNewNoticeTitle(""); setNewNoticeMessage(""); setNewNoticeTargetUserId("");
      
      await logAdminAction('CREATE', 'notification', `Sent notification: ${newNoticeTitle}`);
      
      loadData();
    } catch (e: any) { toast.error(e.message); } finally { setProcessing(false); }
  };

  const handleEditStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editData?.id) return;
    setProcessing(true);
    try {
      const mergedMeta = {
        ...mergeRegistrationMetadataFromStudentRow(editData),
        student_track: editFormVariant === "engineering" ? "engineering" : "non_tech",
      };
      const emailNorm = String(editData.email || "").trim().toLowerCase();
      if (!emailNorm) {
        toast.error("Student email is required.");
        return;
      }

      const courseVal = (editData.internship_domain || editData.course || "") as string;
      const dirPw =
        typeof mergedMeta.password === "string" && mergedMeta.password.trim()
          ? mergedMeta.password.trim()
          : "";
      const { data: updatedStudent, error } = await supabase
        .from("students")
        .update({
          full_name: editData.full_name,
          email: emailNorm,
          contact_number: editData.contact_number,
          gender: editData.gender,
          parent_name: editData.parent_name,
          university_name: editData.university_name,
          college_name: editData.college_name,
          degree: editData.degree,
          department: editData.department,
          academic_session: editData.academic_session,
          class_semester: editData.class_semester,
          roll_number: editData.roll_number,
          internship_domain: editData.internship_domain,
          course: courseVal,
          registration_id: editData.registration_id,
          joining_date: editData.joining_date,
          completion_date: editData.completion_date,
          internship_duration: editData.internship_duration,
          emergency_name: editData.emergency_name,
          emergency_relation: editData.emergency_relation,
          emergency_contact: editData.emergency_contact,
          metadata: mergedMeta,
        })
        .eq("id", editData.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!updatedStudent?.id) {
        throw new Error(
          "Student row was not updated (0 rows). Check RLS allows staff to UPDATE students (fix_staff_rls.sql)."
        );
      }
      await adminUpsertStudentProfile(supabase, {
        id: editData.id,
        full_name: editData.full_name || "Student",
        email: emailNorm,
        contact_number: editData.contact_number,
        gender: editData.gender,
        parent_name: editData.parent_name,
      });
      try {
        await upsertBeuDetailsFromStudentEdit(supabase, {
          ...editData,
          metadata: mergedMeta,
          internship_duration: editData.internship_duration || editData.section_duration,
          section_duration: editData.section_duration || editData.internship_duration,
        });
      } catch (beuErr) {
        console.warn("[staff-edit-student] beu_details upsert:", beuErr);
      }
      toast.success("Student updated");
      setIsEditDialogOpen(false);
      loadData();
      await logAdminAction("UPDATE", "student", `Staff updated student ${editData.full_name}`, {
        student_id: editData.id,
      });
    } catch (err: any) {
      toast.error(err.message || "Update failed");
    } finally {
      setProcessing(false);
    }
  };

  const logAdminAction = async (action_type: string, entity_type: string, description: string, metadata: any = {}) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('admin_logs').insert({
        admin_id: user.id,
        admin_email: user.email,
        action_type,
        entity_type,
        description,
        metadata
      });
    } catch (err) {
      console.error('Failed to log admin action:', err);
    }
  };

  /** Fetch full student row + enrich metadata (same as Admin View Details). */
  const openStudentViewDialog = async (student: Record<string, unknown>) => {
    let row: Record<string, unknown> = { ...student };
    const id = String(row.id || "");
    const isDraftLead = id.startsWith("reg-draft-");
    if (id && !isDraftLead) {
      try {
        const { data } = await supabase.from("students").select("*").eq("id", id).maybeSingle();
        if (data) row = data as Record<string, unknown>;
      } catch {
        /* use partial row */
      }
    }
    const enriched = enrichStudentProfileForDisplay(row) || row;
    const meta =
      studentMetadataOf(enriched) ||
      parseJsonField(row.metadata) ||
      parseJsonField((row as { payload?: unknown }).payload);
    setSelectedUser({
      ...enriched,
      ...(!row.registration_id && student.failure_reason
        ? {
            failure_reason: student.failure_reason,
            reason: student.reason || student.failure_reason,
            payment_id: student.payment_id,
            cybercafe_shop_name: student.cybercafe_shop_name,
            cybercafe_email: student.cybercafe_email,
          }
        : {}),
      metadata: meta,
    });
    setIsViewDialogOpen(true);
  };

  const executeTransferLead = async (lead: any, password: string) => {
    const leadEmail = lead.email || lead.user_email;
    setProcessing(true);
    try {
      const { userId, registrationId: regId } = await transferLeadToStudentDirectory({
        directoryClient: supabase,
        lead,
        password,
        paymentIdPrefix: "STAFF_TRANS_",
      });

      if (lead.registration_draft && lead.draft_id) {
        await supabase.from("registration_leads").delete().eq("id", lead.draft_id);
        setRegistrationDraftLeads((prev) => prev.filter((r) => r.id !== lead.draft_id));
      } else if (lead.user_email) {
        await supabase.from("payment_cancelled").delete().eq("id", lead.id);
      } else {
        await supabase.from("payment_success").delete().eq("id", lead.id);
      }

      toast.success(`Lead successfully transferred! (ID: ${regId})`);

      await logAdminAction(
        "TRANSFER",
        "lead",
        `Transferred lead ${leadEmail} to registered students`,
        { lead_id: lead.id, student_id: userId }
      );

      loadData();
    } catch (err: any) {
      console.error("Transfer error:", err);
      toast.error(err.message || "Failed to transfer lead.");
    } finally {
      setProcessing(false);
    }
  };

  const handleTransferLead = async (lead: any) => {
    const leadEmail = lead.email || lead.user_email;
    const leadName = lead.full_name || lead.metadata?.fullName || leadEmail;

    if (
      !confirm(
        `Are you sure you want to transfer ${leadName} to registered students? This will create a student account.`
      )
    ) {
      return;
    }

    const storedPassword = resolveLeadStoredPassword(lead);
    if (storedPassword) {
      const pwErr = validateRegistrationPassword(storedPassword, storedPassword);
      if (pwErr) {
        toast.error(pwErr);
        setTransferLeadTarget(lead);
        setTransferPassword(generateTempPassword());
        setIsTransferPassOpen(true);
        return;
      }
      await executeTransferLead(lead, storedPassword);
      return;
    }

    setTransferLeadTarget(lead);
    setTransferPassword(generateTempPassword());
    setIsTransferPassOpen(true);
  };

  const confirmTransferWithPassword = async () => {
    if (!transferLeadTarget) return;
    const password = transferPassword.trim();
    const pwErr = validateRegistrationPassword(password, password);
    if (pwErr) {
      toast.error(pwErr);
      return;
    }
    setIsTransferPassOpen(false);
    const lead = transferLeadTarget;
    setTransferLeadTarget(null);
    await executeTransferLead(lead, password);
  };

  const services = [
    { id: "can_manage_students" as const, label: "Students", icon: Users, color: "text-blue-500", bg: "bg-blue-50", tab: "students" },
    { id: "can_view_payments" as const, label: "Payments", icon: CreditCard, color: "text-emerald-500", bg: "bg-emerald-50", tab: "payments" },
    { id: "can_manage_leads" as const, label: "Assigned Leads", icon: Target, color: "text-orange-500", bg: "bg-orange-50", tab: "leads" },
    { id: "can_manage_notifications" as const, label: "Notifications", icon: Bell, color: "text-purple-500", bg: "bg-purple-50", tab: "notifications" },
    { id: "can_manage_assignments" as const, label: "Assignments", icon: CheckSquare, color: "text-cyan-600", bg: "bg-cyan-50", tab: "assignments" },
    { id: "can_manage_communications" as const, label: "Communications", icon: Mail, color: "text-indigo-500", bg: "bg-indigo-50", tab: "comms" },
    { id: "can_manage_classes" as const, label: "Live Classes", icon: Video, color: "text-red-500", bg: "bg-red-50", tab: "classes" },
    { id: "can_manage_certificates" as const, label: "Certificates", icon: Award, color: "text-amber-600", bg: "bg-amber-50", tab: "certificates" },
    { id: "can_manage_institutions" as const, label: "Academic Partners", icon: GraduationCap, color: "text-slate-600", bg: "bg-slate-100", tab: "institutions" },
    { id: "can_manage_engineering" as const, label: "Engineering Directory", icon: Wrench, color: "text-teal-600", bg: "bg-teal-50", tab: "engineering" },
    { id: "can_manage_engineering" as const, label: "Eng. Management", icon: Cog, color: "text-teal-700", bg: "bg-teal-50", tab: "engineering-management" },
    { id: "can_manage_non_engineering" as const, label: "Non-Tech Management", icon: BookOpen, color: "text-sky-600", bg: "bg-sky-50", tab: "non-engineering-management" },
    { id: "can_manage_attendance" as const, label: "Attendance Tracking", icon: CheckSquare, color: "text-violet-600", bg: "bg-violet-50", tab: "attendance" },
    { id: "can_manage_id_cards" as const, label: "ID Cards", icon: KeyRound, color: "text-yellow-600", bg: "bg-yellow-50", tab: "id-cards" },
    { id: "can_manage_uploads" as const, label: "Learning Materials", icon: BookOpen, color: "text-fuchsia-600", bg: "bg-fuchsia-50", tab: "uploads" },
    { id: "can_manage_fees" as const, label: "Fees Management", icon: Store, color: "text-green-600", bg: "bg-green-50", tab: "fees" },
    { id: "can_manage_courses" as const, label: "Course Management", icon: BookOpen, color: "text-indigo-600", bg: "bg-indigo-50", tab: "courses" },
    { id: "can_manage_cybercafe" as const, label: "Cyber Cafes", icon: Store, color: "text-orange-600", bg: "bg-orange-50", tab: "cybercafe" },
    { id: "can_manage_referrals" as const, label: "Referrals", icon: Target, color: "text-pink-600", bg: "bg-pink-50", tab: "referrals" },
    { id: "can_manage_college_rosters" as const, label: "College Rosters", icon: Briefcase, color: "text-cyan-600", bg: "bg-cyan-50", tab: "college-rosters" },
    { id: "can_manage_employee_attendance" as const, label: "Employee Attendance", icon: CheckCircle2, color: "text-rose-600", bg: "bg-rose-50", tab: "employee-attendance" },
    { id: "can_manage_settings" as const, label: "Site Settings", icon: Lock, color: "text-slate-700", bg: "bg-slate-200", tab: "settings" },
  ];

  useEffect(() => {
    if (loading || !permissions) return;
    const isBaseTab = ["dashboard", "profile", "security", "my-attendance", "requests"].includes(activeTab);
    if (!isBaseTab) {
      if (activeTab === "add-registration") {
        if (!hasStaffPerm(permissions, "can_manage_students")) setActiveTab("dashboard");
      } else {
        const service = services.find((s) => s.tab === activeTab);
        if (!service || !hasStaffPerm(permissions, service.id)) {
          setActiveTab("dashboard");
        }
      }
    }
  }, [activeTab, permissions, loading]);

  // Leads tab needs enrolled emails for hunt filtering — load light list only then.
  useEffect(() => {
    if (loading || activeTab !== "leads") return;
    if (!hasStaffPerm(permissions, "can_manage_leads")) return;
    if (enrolledEmailSet.size > 0) return;
    void refreshEnrolledEmails().catch(() => {});
  }, [activeTab, loading, permissions, enrolledEmailSet.size]);

  const handleStaffLogout = async () => {
    try {
      await logStaffActivity("logout", "Signed out from staff dashboard");
      await revokeStaffSession(getOrCreateStaffSessionKey());
    } catch {
      /* ignore */
    }
    await adminIntentionalSignOut(supabase);
    navigate(ADMIN_LOGIN_PATH);
  };

  const enrolledEmails = enrolledEmailSet;

  useEffect(() => {
    setPayPage(0);
  }, [paySearchTerm]);

  useEffect(() => {
    setLeadsPage(0);
  }, [leadsSearchTerm, leadsStatusFilter, leadsDateFrom, leadsDateTo]);

  // Show only successful payments in the Payments tab
  const filteredPayments = useMemo(() => {
    const q = paySearchTerm.trim().toLowerCase();
    // payments already contain only successful entries (set in loadData)
    if (!q) return payments;
    return payments.filter(
      (p) =>
        p.email?.toLowerCase().includes(q) ||
        p.full_name?.toLowerCase().includes(q) ||
        String(p.payment_id || "").toLowerCase().includes(q)
    );
  }, [payments, paySearchTerm]);

  const payPageCount = Math.max(1, Math.ceil(filteredPayments.length / STAFF_PAGE_SIZE));
  const paySafePage = Math.min(payPage, payPageCount - 1);
  const paginatedPayments = useMemo(
    () =>
      filteredPayments.slice(
        paySafePage * STAFF_PAGE_SIZE,
        (paySafePage + 1) * STAFF_PAGE_SIZE
      ),
    [filteredPayments, paySafePage]
  );

  const directoryUnis = useMemo(
    () => unis.filter((u) => !isEngineeringUniversityName(u.name, engineeringUniNames)),
    [unis, engineeringUniNames]
  );
  const editDialogUnis = useMemo(() => {
    if (editFormVariant === "engineering") {
      return unis.filter((u) => isEngineeringUniversityName(u.name, engineeringUniNames));
    }
    return directoryUnis;
  }, [editFormVariant, unis, engineeringUniNames, directoryUnis]);
  const editDialogDomains = useMemo(() => {
    if (editFormVariant === "engineering") {
      if (engCatalog.domains.length === 0) return domains;
      return engCatalog.domains.map((name) => ({ id: `eng-${name}`, name }));
    }
    const engDomainSet = new Set(engCatalog.domains.map((d) => d.toLowerCase()));
    if (engDomainSet.size === 0) return domains;
    return domains.filter((d) => !engDomainSet.has(String(d.name || "").toLowerCase()));
  }, [editFormVariant, engCatalog.domains, domains]);
  const editEngCourses = engCatalog.courses;
  const editEngBranches = useMemo(() => {
    const course = String(editData?.department || "").trim();
    if (course && engCatalog.branchesByCourse[course]?.length) {
      return engCatalog.branchesByCourse[course];
    }
    return engCatalog.branches;
  }, [editData?.department, engCatalog]);

  const openStudentEditDialog = async (
    student: StudentDirectoryStudent,
    variant: StudentEditFormVariant = "directory"
  ) => {
    setEditFormVariant(variant);
    const hydrated = await hydrateStudentEditWithEngineeringDetails(
      supabase,
      student as Record<string, unknown>
    );
    setEditData({
      ...hydrated,
      university_roll_number:
        (hydrated as { university_roll_number?: string }).university_roll_number ||
        resolveBnmuUniversityRollNumber(hydrated) ||
        "",
      internship_mode: resolveInternshipModeForUniversity(
        String((hydrated as { university_name?: string }).university_name || ""),
        (hydrated as { internship_mode?: string }).internship_mode ||
          (hydrated as { metadata?: { internship_mode?: string } }).metadata?.internship_mode
      ),
      department: String(
        (hydrated as { department?: string }).department ||
          (hydrated as { beu_course?: string }).beu_course ||
          ""
      ).trim(),
      subject: String(
        (hydrated as { subject?: string }).subject ||
          (hydrated as { beu_branch?: string }).beu_branch ||
          ""
      ).trim(),
      section_type:
        (hydrated as { section_type?: string }).section_type ||
        (hydrated as { beu_section_type?: string }).beu_section_type ||
        "",
      section_duration:
        (hydrated as { section_duration?: string }).section_duration ||
        (hydrated as { beu_section_duration?: string }).beu_section_duration ||
        (hydrated as { internship_duration?: string }).internship_duration ||
        "",
      internship_duration:
        (hydrated as { internship_duration?: string }).internship_duration ||
        (hydrated as { section_duration?: string }).section_duration ||
        (hydrated as { beu_section_duration?: string }).beu_section_duration ||
        "",
      internship_domain:
        (hydrated as { internship_domain?: string }).internship_domain ||
        (hydrated as { beu_domain?: string }).beu_domain ||
        (hydrated as { course?: string }).course ||
        "",
    });
    setIsEditDialogOpen(true);
  };

  const engineeringDirectoryActions = useMemo(() => {
    if (!directoryActions) return undefined;
    return {
      ...directoryActions,
      onEditDetails: (student: StudentDirectoryStudent) => {
        void openStudentEditDialog(student, "engineering");
      },
    };
  }, [directoryActions]);

  const leadsUnified = useMemo(() => {
    if (!currentUserId) return [] as LeadAssignmentView[];
    const hunt = buildLeadHuntRows({
      registrationDraftLeads,
      failedPayments,
      cancelledPayments,
      enrolledEmails,
      searchTerm: leadsSearchTerm,
    });
    const staffNameById = new Map([
      [currentUserId, staffName || staffEmail || "Me"],
    ]);
    const merged = mergeHuntWithCrm(hunt, myLeadCrm, staffNameById);
    let filtered = merged.filter((r) => r.assigned_staff_id === currentUserId && !!r.crm_id);

    // Status filter
    if (leadsStatusFilter !== "all") {
      filtered = filtered.filter((r) => r.crm_status === leadsStatusFilter);
    }

    // Date range filter (based on created_at)
    if (leadsDateFrom) {
      const from = new Date(leadsDateFrom);
      from.setHours(0, 0, 0, 0);
      filtered = filtered.filter((r) => new Date(r.created_at) >= from);
    }
    if (leadsDateTo) {
      const to = new Date(leadsDateTo);
      to.setHours(23, 59, 59, 999);
      filtered = filtered.filter((r) => new Date(r.created_at) <= to);
    }

    return filtered;
  }, [
    currentUserId,
    registrationDraftLeads,
    failedPayments,
    cancelledPayments,
    enrolledEmails,
    leadsSearchTerm,
    leadsStatusFilter,
    leadsDateFrom,
    leadsDateTo,
    myLeadCrm,
    staffName,
    staffEmail,
  ]);

  const openLeadAction = (row: LeadAssignmentView) => {
    setLeadActionRow(row);
    setLeadActionStatus(
      row.crm_status === "unassigned" || row.crm_status === "pending"
        ? "contacted"
        : row.crm_status
    );
    setLeadActionRemarks(row.remarks || "");
    setLeadActionFollowUp(row.follow_up_at ? row.follow_up_at.slice(0, 10) : "");
    setLeadActionOpen(true);
  };

  const saveLeadAction = async () => {
    if (!leadActionRow?.crm_id) return;
    setLeadActionSaving(true);
    try {
      await staffUpdateLeadCrm(supabase, {
        leadCrmId: leadActionRow.crm_id,
        status: leadActionStatus,
        remarks: leadActionRemarks,
        followUpAt: leadActionFollowUp
          ? new Date(`${leadActionFollowUp}T10:00:00`).toISOString()
          : null,
        clearFollowUp: !leadActionFollowUp,
      });
      toast.success("Lead updated");
      setLeadActionOpen(false);
      await loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update lead");
    } finally {
      setLeadActionSaving(false);
    }
  };

  const leadsPageCount = Math.max(1, Math.ceil(leadsUnified.length / STAFF_PAGE_SIZE));
  const leadsSafePage = Math.min(leadsPage, leadsPageCount - 1);
  const paginatedLeads = useMemo(
    () =>
      leadsUnified.slice(
        leadsSafePage * STAFF_PAGE_SIZE,
        (leadsSafePage + 1) * STAFF_PAGE_SIZE
      ),
    [leadsUnified, leadsSafePage]
  );

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="size-8 animate-spin text-primary" /></div>;

  return (
    <div className="min-h-screen bg-[#f8fafc] flex">
      <aside className="hidden md:flex w-64 h-screen bg-white border-r border-slate-200 sticky top-0 flex-col p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-8"><div className="size-10 rounded-xl bg-primary flex items-center justify-center shadow-lg"><LayoutDashboard className="size-5 text-white" /></div><span className="text-xl font-black tracking-tighter">StaffPanel</span></div>
        <nav className="space-y-1 flex-1 overflow-y-auto">
          <button onClick={() => setActiveTab("dashboard")} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${activeTab === 'dashboard' ? 'bg-slate-50 text-primary' : 'text-slate-600 hover:bg-slate-50'}`}><LayoutDashboard className="size-4" /> Dashboard</button>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-6 mb-4 px-3">Authorized Access</div>
          {services.map(s => hasStaffPerm(permissions, s.id) && (
            <button
              key={s.tab}
              onClick={() => setActiveTab(s.tab)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${activeTab === s.tab ? 'bg-slate-50 text-primary' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <s.icon className={`size-4 ${s.color}`} /> {s.label}
            </button>
          ))}
          {hasStaffPerm(permissions, "can_manage_students") && (
            <button
              onClick={() => setActiveTab("add-registration")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${activeTab === "add-registration" ? "bg-emerald-50 text-emerald-700" : "text-slate-600 hover:bg-slate-50"}`}
            >
              <UserPlus className="size-4 text-emerald-600" /> Add Registration
            </button>
          )}
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-6 mb-4 px-3">Account</div>
          <button onClick={() => setActiveTab("profile")} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${activeTab === 'profile' ? 'bg-slate-50 text-primary' : 'text-slate-600 hover:bg-slate-50'}`}><User className="size-4" /> Profile</button>
          <button onClick={() => setActiveTab("security")} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${activeTab === 'security' ? 'bg-slate-50 text-primary' : 'text-slate-600 hover:bg-slate-50'}`}><Shield className="size-4" /> Security</button>
          <button onClick={() => setActiveTab("my-attendance")} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${activeTab === 'my-attendance' ? 'bg-slate-50 text-primary' : 'text-slate-600 hover:bg-slate-50'}`}><Calendar className="size-4" /> My Attendance</button>
          <button onClick={() => setActiveTab("requests")} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${activeTab === 'requests' ? 'bg-slate-50 text-primary' : 'text-slate-600 hover:bg-slate-50'}`}><ClipboardList className="size-4" /> Requests</button>
        </nav>
        <Button variant="ghost" className="mt-auto justify-start text-red-500 hover:bg-red-50 font-bold" onClick={() => { void handleStaffLogout(); }}><LogOut className="size-4 mr-2" /> Logout</Button>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-10 sticky top-0 z-30 shadow-sm backdrop-blur-md bg-white/80">
          <div><h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">{
            activeTab === 'dashboard' ? `Hello, ${staffName.split(' ')[0]}`
            : activeTab === 'add-registration' ? 'Add Registration'
            : activeTab === 'profile' ? 'Profile'
            : activeTab === 'security' ? 'Security'
            : activeTab === 'my-attendance' ? 'My Attendance'
            : activeTab === 'requests' ? 'Requests'
            : services.find(s => s.tab === activeTab)?.label
          }</h1><p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">EzyIntern Staff Access</p></div>
          {(() => {
            const avatar =
              resolveStorageUrl(staffProfile?.profile_image_url || "") || staffProfile?.profile_image_url;
            return avatar ? (
              <img src={avatar} alt="" className="size-10 rounded-full object-cover border border-slate-200" />
            ) : (
              <div className="size-10 rounded-full bg-slate-100 flex items-center justify-center font-black text-primary text-xs border border-slate-200">
                {staffName[0]}
              </div>
            );
          })()}
        </header>

        <div className="p-10 max-w-7xl mx-auto">
          {activeTab === 'dashboard' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {services.map((service) => hasStaffPerm(permissions, service.id) && (
                <Card key={service.tab} className="p-6 border-none shadow-elegant hover:scale-105 transition-all cursor-pointer group bg-white" onClick={() => setActiveTab(service.tab)}>
                  <div className={`size-12 rounded-2xl ${service.bg} flex items-center justify-center mb-4 group-hover:shadow-md transition-all`}><service.icon className={`size-6 ${service.color}`} /></div>
                  <h3 className="font-bold text-slate-800 mb-1">{service.label}</h3>
                  <p className="text-[10px] text-slate-500 font-medium">Manage {service.label.toLowerCase()}</p>
                </Card>
              ))}

              {/* Quick Offer Letter Download Card */}
              <Card className="p-6 border-none shadow-elegant bg-white border-t-4 border-t-indigo-600">
                <div className="size-12 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4"><FileText className="size-6 text-indigo-600" /></div>
                <h3 className="font-bold text-slate-800 mb-4">Quick Offer Letter</h3>
                <div className="space-y-3">
                  <Input 
                    placeholder="Student Email Address" 
                    value={downloadEmail} 
                    onChange={e => setDownloadEmail(e.target.value)}
                    className="h-10 text-xs"
                  />
                  <Button 
                    className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 font-bold gap-2 text-xs" 
                    onClick={handleManualDownload}
                    disabled={processing}
                  >
                    {processing ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
                    Download Letter
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {activeTab === 'notifications' && hasStaffPerm(permissions, "can_manage_notifications") && (
            <StaffNotificationsServicePanel
              currentUserId={currentUserId}
              isActive={activeTab === "notifications"}
            />
          )}

          {hasStaffPerm(permissions, "can_manage_students") && (
            <div className={activeTab === "students" ? undefined : "hidden"} aria-hidden={activeTab !== "students"}>
              <StaffStudentDirectoryPanel
                isActive={activeTab === "students"}
                refreshKey={directoryRefreshKey}
                domains={domains}
                unis={unis}
                colleges={colleges}
                onViewDetails={(s) => {
                  void openStudentViewDialog(s as Record<string, unknown>);
                }}
                onEditDetails={(s) => {
                  void openStudentEditDialog(s, "directory");
                }}
                onResetPassword={(s) => {
                  setSelectedUser(s);
                  setIsResetPassOpen(true);
                }}
                onDownloadOfferLetter={(s) => {
                  void handleDownloadOffer(s);
                }}
                onAddStudent={() => {
                  setAddStudentFormKey((k) => k + 1);
                  setIsAddStudentOpen(true);
                }}
                onLogAction={logAdminAction}
                onActionsReady={setDirectoryActions}
              />
            </div>
          )}

          {activeTab === 'payments' && hasStaffPerm(permissions, "can_view_payments") && (
            <div className="space-y-6">
              <Card className="p-6 border border-emerald-200 shadow-elegant bg-emerald-50/30">
                <h3 className="text-lg font-bold text-emerald-800 mb-2 flex items-center gap-2"><CreditCard className="size-5" /> Razorpay Payment Recovery</h3>
                <p className="text-xs text-emerald-600 mb-4">Fetch missing payments directly from Razorpay using an Email Address or Payment ID (pay_XXX).</p>
                <div className="flex flex-col md:flex-row gap-4 mb-4">
                  <Input
                    className="flex-1"
                    placeholder="Enter Email or Razorpay Payment ID..."
                    value={recoveryQuery}
                    onChange={(e) => setRecoveryQuery(e.target.value)}
                  />
                  <Button 
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold whitespace-nowrap"
                    onClick={handleFetchRazorpayPayment}
                    disabled={recoveryLoading}
                  >
                    {recoveryLoading ? <Loader2 className="size-4 animate-spin mr-2" /> : <Search className="size-4 mr-2" />}
                    Fetch from Razorpay
                  </Button>
                </div>

                {recoveryPaymentData && (
                  <div className="bg-white p-4 rounded-xl border border-emerald-100 mt-4 space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-xs text-slate-500 font-medium block">Name</span>
                        <span className="font-bold">{recoveryPaymentData.notes?.name || recoveryPaymentData.notes?.fullName || "Student"}</span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 font-medium block">Email</span>
                        <span className="font-bold">{recoveryPaymentData.email}</span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 font-medium block">Amount</span>
                        <span className="font-bold font-mono">₹{recoveryPaymentData.amount / 100}</span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 font-medium block">Transaction ID</span>
                        <span className="font-mono text-xs text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">{recoveryPaymentData.id}</span>
                      </div>
                    </div>

                    <Separator className="my-2" />

                    {!isRecoveryRegistered ? (
                      <div className="bg-orange-50 p-3 rounded-lg border border-orange-200">
                        <div className="flex items-center gap-2 text-orange-800 font-semibold text-sm mb-2">
                          <UserPlus className="size-4" /> User account not found!
                        </div>
                        <p className="text-xs text-orange-700 mb-3">Please enter a password below to auto-create the student account. They will receive an email.</p>
                        <Input
                          type="password"
                          placeholder="Set Student Password"
                          value={recoveryPassword}
                          onChange={(e) => setRecoveryPassword(e.target.value)}
                          className="max-w-xs"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                        <CheckCircle2 className="size-5" /> User account already exists! Payment will be linked.
                      </div>
                    )}

                    <div className="flex justify-end pt-2">
                      <Button
                        className="bg-indigo-600 hover:bg-indigo-700 font-bold"
                        onClick={handleRecoverPayment}
                        disabled={processing || (!isRecoveryRegistered && !recoveryPassword)}
                      >
                        {processing ? <Loader2 className="size-4 animate-spin mr-2" /> : <CheckCircle2 className="size-4 mr-2" />}
                        Proceed to Payment
                      </Button>
                    </div>
                  </div>
                )}
              </Card>

            <Card className="p-6 border-none shadow-elegant bg-white overflow-hidden">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6 p-6 pb-0">
                <div>
                  <h3 className="text-lg font-bold">Successful Transactions</h3>
                  <p className="text-xs text-muted-foreground mt-1">{filteredPayments.length} transaction(s)</p>
                </div>
                <div className="relative w-full md:w-96">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    className="pl-9 h-10"
                    placeholder="Search by email, name or payment ID..."
                    value={paySearchTerm}
                    onChange={(e) => setPaySearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <Table>
                <TableHeader className="bg-slate-50"><TableRow><TableHead>Date</TableHead><TableHead>Student</TableHead><TableHead>Email</TableHead><TableHead>ID</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {paginatedPayments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground italic">
                        No transactions match your search.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedPayments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-[10px] font-medium">{new Date(p.created_at).toLocaleString()}</TableCell>
                        <TableCell className="font-bold text-sm">{p.full_name || "—"}</TableCell>
                        <TableCell className="text-[10px] font-black text-indigo-600">{p.email}</TableCell>
                        <TableCell className="text-[10px] font-mono">{p.payment_id}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.status === 'no_payment' ? 'No Payment' : 'Paid'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <StaffTablePagination
                page={payPage}
                setPage={setPayPage}
                total={filteredPayments.length}
                label="transactions"
              />
            </Card>
            </div>
          )}

          {activeTab === 'leads' && hasStaffPerm(permissions, "can_manage_leads") && (
            <div className="space-y-6">
              {(myLeadTargets?.daily_calls ||
                myLeadTargets?.weekly_calls ||
                myLeadTargets?.monthly_calls) && (
                <div className="grid md:grid-cols-3 gap-4">
                  {(
                    [
                      {
                        label: "Daily",
                        target: myLeadTargets?.daily_calls || 0,
                        done: myCallCounts.daily,
                      },
                      {
                        label: "Weekly",
                        target: myLeadTargets?.weekly_calls || 0,
                        done: myCallCounts.weekly,
                      },
                      {
                        label: "Monthly",
                        target: myLeadTargets?.monthly_calls || 0,
                        done: myCallCounts.monthly,
                      },
                    ] as const
                  ).map((t) => {
                    const pct =
                      t.target > 0 ? Math.min(100, Math.round((t.done / t.target) * 100)) : 0;
                    const remaining = Math.max(0, t.target - t.done);
                    return (
                      <Card key={t.label} className="p-4 border-none shadow-elegant bg-white">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-bold text-sm flex items-center gap-2">
                            <Target className="size-4 text-primary" /> {t.label} Target
                          </h4>
                          <Badge variant="outline">{pct}%</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mb-2">
                          Target {t.target} · Completed {t.done} · Remaining {remaining}
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}

            <Card className="p-6 border-none shadow-elegant bg-white overflow-hidden">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-xl font-bold flex items-center gap-2 text-indigo-600">
                    <UserPlus className="size-5" /> Assigned Leads
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Leads assigned to you by Admin. Open View or Action to update details.
                  </p>
                  <Badge className="mt-2 bg-indigo-100 text-indigo-700 border-none font-bold">
                    Assigned to you: {leadsUnified.length}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <div className="relative flex-1 md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      className="pl-9 h-9"
                      placeholder="Search leads..."
                      value={leadsSearchTerm}
                      onChange={(e) => setLeadsSearchTerm(e.target.value)}
                    />
                  </div>
                  <Button
                    variant={leadsFiltersOpen ? "default" : "outline"}
                    size="sm"
                    className={`h-9 gap-1.5 font-bold text-xs shrink-0 ${leadsFiltersOpen ? "bg-indigo-600 hover:bg-indigo-700 text-white" : ""}`}
                    onClick={() => setLeadsFiltersOpen((prev) => !prev)}
                  >
                    <SlidersHorizontal className="size-3.5" />
                    Filters
                    {(leadsStatusFilter !== "all" || leadsDateFrom || leadsDateTo) && (
                      <span className="ml-1 size-5 rounded-full bg-white/20 text-[10px] font-black flex items-center justify-center">
                        {(leadsStatusFilter !== "all" ? 1 : 0) + (leadsDateFrom || leadsDateTo ? 1 : 0)}
                      </span>
                    )}
                  </Button>
                </div>
              </div>

              {/* Active filter badges */}
              {(leadsStatusFilter !== "all" || leadsDateFrom || leadsDateTo) && (
                <div className="flex flex-wrap items-center gap-2 mb-4 px-1">
                  <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Active Filters:</span>
                  {leadsStatusFilter !== "all" && (
                    <Badge className="bg-indigo-50 text-indigo-700 border border-indigo-200 gap-1 pr-1 font-bold text-[11px]">
                      Status: {LEAD_CRM_STATUS_LABELS[leadsStatusFilter]}
                      <button
                        onClick={() => setLeadsStatusFilter("all")}
                        className="ml-0.5 rounded-full hover:bg-indigo-200 p-0.5 transition-colors"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  )}
                  {(leadsDateFrom || leadsDateTo) && (
                    <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 gap-1 pr-1 font-bold text-[11px]">
                      <CalendarDays className="size-3" />
                      {leadsDateFrom && leadsDateTo
                        ? `${leadsDateFrom} → ${leadsDateTo}`
                        : leadsDateFrom
                          ? `From ${leadsDateFrom}`
                          : `Until ${leadsDateTo}`}
                      <button
                        onClick={() => { setLeadsDateFrom(""); setLeadsDateTo(""); }}
                        className="ml-0.5 rounded-full hover:bg-emerald-200 p-0.5 transition-colors"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  )}
                  <button
                    onClick={() => { setLeadsStatusFilter("all"); setLeadsDateFrom(""); setLeadsDateTo(""); }}
                    className="text-[10px] text-red-500 hover:text-red-700 font-bold underline underline-offset-2 transition-colors"
                  >
                    Clear all
                  </button>
                </div>
              )}

              {/* Collapsible Advanced Filters Panel */}
              {leadsFiltersOpen && (
                <div className="mb-5 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-indigo-50/30 p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                      <Filter className="size-4 text-indigo-500" /> Advanced Filters
                    </h4>
                    <button
                      onClick={() => setLeadsFiltersOpen(false)}
                      className="text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Status filter */}
                    <div className="space-y-1.5">
                      <Label className="text-[11px] uppercase font-black text-slate-500 tracking-wide flex items-center gap-1.5">
                        <CheckCircle2 className="size-3.5 text-indigo-400" /> Status
                      </Label>
                      <Select
                        value={leadsStatusFilter}
                        onValueChange={(v) => setLeadsStatusFilter(v as LeadCrmStatus | "all")}
                      >
                        <SelectTrigger className="h-9 bg-white border-slate-200 text-sm font-medium">
                          <SelectValue placeholder="All Statuses" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Statuses</SelectItem>
                          {LEAD_CRM_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {LEAD_CRM_STATUS_LABELS[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Date From */}
                    <div className="space-y-1.5">
                      <Label className="text-[11px] uppercase font-black text-slate-500 tracking-wide flex items-center gap-1.5">
                        <CalendarDays className="size-3.5 text-emerald-400" /> From Date
                      </Label>
                      <Input
                        type="date"
                        className="h-9 bg-white border-slate-200 text-sm font-medium"
                        value={leadsDateFrom}
                        onChange={(e) => setLeadsDateFrom(e.target.value)}
                      />
                    </div>
                    {/* Date To */}
                    <div className="space-y-1.5">
                      <Label className="text-[11px] uppercase font-black text-slate-500 tracking-wide flex items-center gap-1.5">
                        <CalendarDays className="size-3.5 text-emerald-400" /> To Date
                      </Label>
                      <Input
                        type="date"
                        className="h-9 bg-white border-slate-200 text-sm font-medium"
                        value={leadsDateTo}
                        onChange={(e) => setLeadsDateTo(e.target.value)}
                      />
                    </div>
                  </div>
                  {/* Quick filter presets */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider self-center mr-1">Quick:</span>
                    {([
                      { label: "Today", fn: () => { const d = new Date().toISOString().slice(0, 10); setLeadsDateFrom(d); setLeadsDateTo(d); } },
                      { label: "Last 7 days", fn: () => { const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 6); setLeadsDateFrom(from.toISOString().slice(0, 10)); setLeadsDateTo(to.toISOString().slice(0, 10)); } },
                      { label: "Last 30 days", fn: () => { const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 29); setLeadsDateFrom(from.toISOString().slice(0, 10)); setLeadsDateTo(to.toISOString().slice(0, 10)); } },
                      { label: "This month", fn: () => { const now = new Date(); setLeadsDateFrom(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`); setLeadsDateTo(now.toISOString().slice(0, 10)); } },
                    ] as const).map((preset) => (
                      <Button
                        key={preset.label}
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] font-bold px-3 rounded-full hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 transition-all"
                        onClick={preset.fn}
                      >
                        {preset.label}
                      </Button>
                    ))}
                    {(leadsStatusFilter !== "all" || leadsDateFrom || leadsDateTo) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[11px] font-bold px-3 rounded-full text-red-500 hover:bg-red-50 hover:text-red-700 gap-1"
                        onClick={() => { setLeadsStatusFilter("all"); setLeadsDateFrom(""); setLeadsDateTo(""); }}
                      >
                        <X className="size-3" /> Reset All
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Student Details</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Follow-up</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leadsUnified.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-16 text-muted-foreground font-medium italic">
                        No leads assigned to you yet. Ask an admin to assign from Lead Assignment.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedLeads.map((l) => (
                    <TableRow key={l.crm_id || l.id}>
                      <TableCell className="text-[10px] font-medium">{new Date(l.created_at).toLocaleString()}</TableCell>
                        <TableCell>
                          <div className="font-bold text-slate-800">{l.full_name}</div>
                          <div className="text-[10px] text-muted-foreground">{l.email}</div>
                          {l.contact_number && (
                            <div className="text-[10px] text-slate-500 font-bold mt-0.5">📞 {l.contact_number}</div>
                          )}
                          <div className="text-[10px] text-slate-400 mt-0.5">{l.college_name} · {l.course}</div>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-slate-100 text-slate-800 border-none text-[10px] font-bold">
                            {LEAD_CRM_STATUS_LABELS[l.crm_status]}
                          </Badge>
                          {l.remarks ? (
                            <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{l.remarks}</p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs">
                          {l.follow_up_at
                            ? new Date(l.follow_up_at).toLocaleDateString()
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                void openStudentViewDialog(l.original);
                              }}
                            >
                              <Eye className="size-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="font-bold text-xs"
                              onClick={() => openLeadAction(l)}
                            >
                              Action
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="size-8 p-0 rounded-full hover:bg-emerald-600 hover:text-white transition-all"
                              onClick={() => handleTransferLead(l.original)}
                              disabled={processing}
                              title="Transfer to student"
                            >
                              <UserPlus className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                    </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <StaffTablePagination
                page={leadsPage}
                setPage={setLeadsPage}
                total={leadsUnified.length}
                label="leads"
              />
            </Card>
            </div>
          )}

          {activeTab === "add-registration" && hasStaffPerm(permissions, "can_manage_students") && (
            <AdminAddRegistrationPanel
              client={supabase}
              portalLabel="Staff"
              onLogAction={logAdminAction}
              onSuccess={async () => {
                await loadData();
                setDirectoryRefreshKey((k) => k + 1);
              }}
            />
          )}

          {activeTab === "assignments" && hasStaffPerm(permissions, "can_manage_assignments") && (
            <StaffAssignmentsPanel currentUserId={currentUserId} isActive={activeTab === "assignments"} />
          )}
          {activeTab === "certificates" && hasStaffPerm(permissions, "can_manage_certificates") && (
            <StaffCertificatesPanel isActive={activeTab === "certificates"} />
          )}
          {activeTab === "classes" && hasStaffPerm(permissions, "can_manage_classes") && (
            <StaffClassesPanel currentUserId={currentUserId} isActive={activeTab === "classes"} />
          )}
          {activeTab === "comms" && hasStaffPerm(permissions, "can_manage_communications") && (
            <StaffCommsPanel isActive={activeTab === "comms"} />
          )}
          {activeTab === "institutions" && hasStaffPerm(permissions, "can_manage_institutions") && (
            <StaffInstitutionsPanel isActive={activeTab === "institutions"} />
          )}
          {activeTab === "engineering" && hasStaffPerm(permissions, "can_manage_engineering") && (
            <StaffEngineeringPanel
              isActive={activeTab === "engineering"}
              actions={engineeringDirectoryActions || undefined}
            />
          )}
          {activeTab === "engineering-management" && hasStaffPerm(permissions, "can_manage_engineering") && (
            <StaffEngineeringManagementPanel isActive={activeTab === "engineering-management"} />
          )}
          {activeTab === "non-engineering-management" && hasStaffPerm(permissions, "can_manage_non_engineering") && (
            <StaffNonEngineeringManagementPanel isActive={activeTab === "non-engineering-management"} />
          )}
          {activeTab === "attendance" && hasStaffPerm(permissions, "can_manage_attendance") && (
            <StaffAttendanceTrackingPanel
              currentUserId={currentUserId}
              isActive={activeTab === "attendance"}
            />
          )}
          {activeTab === "id-cards" && hasStaffPerm(permissions, "can_manage_id_cards") && (
            <StaffIdCardsPanel isActive={activeTab === "id-cards"} />
          )}
          {activeTab === "uploads" && hasStaffPerm(permissions, "can_manage_uploads") && (
            <StaffUploadsPanel currentUserId={currentUserId} isActive={activeTab === "uploads"} />
          )}
          {activeTab === "fees" && hasStaffPerm(permissions, "can_manage_fees") && (
            <StaffFeesPanel isActive={activeTab === "fees"} />
          )}
          {activeTab === "courses" && hasStaffPerm(permissions, "can_manage_courses") && (
            <StaffCoursesPanel isActive={activeTab === "courses"} />
          )}
          {activeTab === "cybercafe" && hasStaffPerm(permissions, "can_manage_cybercafe") && (
            <StaffCybercafePanel isActive={activeTab === "cybercafe"} />
          )}
          {activeTab === "referrals" && hasStaffPerm(permissions, "can_manage_referrals") && (
            <StaffReferralsPanel isActive={activeTab === "referrals"} />
          )}
          {activeTab === "college-rosters" && hasStaffPerm(permissions, "can_manage_college_rosters") && (
            <StaffCollegeRostersPanel isActive={activeTab === "college-rosters"} />
          )}
          {activeTab === "employee-attendance" && hasStaffPerm(permissions, "can_manage_employee_attendance") && (
            <StaffEmployeeAttendanceStandalonePanel currentUserId={currentUserId} isActive={activeTab === "employee-attendance"} />
          )}
          {activeTab === "settings" && hasStaffPerm(permissions, "can_manage_settings") && (
            <StaffSettingsPanel isActive={activeTab === "settings"} />
          )}
          {activeTab === "profile" && (
            <StaffProfilePanel
              profile={staffProfile}
              isActive={activeTab === "profile"}
              onProfileImageUpdated={(url) => {
                setStaffProfile((prev) => (prev ? { ...prev, profile_image_url: url } : prev));
              }}
            />
          )}
          {activeTab === "security" && (
            <StaffSecurityPanel
              isActive={activeTab === "security"}
              onSignOutCurrent={handleStaffLogout}
            />
          )}
          {activeTab === "my-attendance" && (
            <StaffOwnAttendancePanel isActive={activeTab === "my-attendance"} />
          )}
          {activeTab === "requests" && (
            <StaffRequestsPanel isActive={activeTab === "requests"} currentUserId={currentUserId} />
          )}
        </div>
      </main>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden rounded-3xl border-none shadow-elegant">
          <DialogDescription className="sr-only">
            Edit student directory record (same fields as admin panel).
          </DialogDescription>
          <div className="bg-primary p-6 text-white">
            <DialogTitle className="text-2xl font-black">Edit student</DialogTitle>
          </div>
          {editData && (
            <ScrollArea className="max-h-[70vh]">
              <form onSubmit={handleEditStudent} className="p-8 space-y-8">
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                    <User className="size-3" /> Personal information
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                    <div className="space-y-1">
                      <Label className="text-xs">Full name</Label>
                      <Input
                        value={editData.full_name || ""}
                        onChange={(e) => setEditData({ ...editData, full_name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Email</Label>
                      <Input
                        type="email"
                        value={editData.email || ""}
                        onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Contact number</Label>
                      <Input
                        value={editData.contact_number || ""}
                        onChange={(e) => setEditData({ ...editData, contact_number: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Gender</Label>
                      <Select
                        value={
                          ["Male", "Female", "Other"].includes(editData.gender)
                            ? editData.gender
                            : EDIT_GENDER_SENTINEL
                        }
                        onValueChange={(v) =>
                          setEditData({
                            ...editData,
                            gender: v === EDIT_GENDER_SENTINEL ? "" : v,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EDIT_GENDER_SENTINEL}>Not specified</SelectItem>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label className="text-xs">Parent / guardian</Label>
                      <Input
                        value={editData.parent_name || ""}
                        onChange={(e) => setEditData({ ...editData, parent_name: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <StudentEditFormFields
                  editData={editData}
                  setEditData={setEditData}
                  domains={editDialogDomains}
                  unis={editDialogUnis}
                  colleges={colleges}
                  variant={editFormVariant}
                  engineeringCourses={editEngCourses}
                  engineeringBranches={editEngBranches}
                />

                <div className="flex justify-end gap-4">
                  <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={processing}>
                    {processing ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                    Save changes
                  </Button>
                </div>
              </form>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
      <StudentProfileViewDialog
        open={isViewDialogOpen}
        onOpenChange={setIsViewDialogOpen}
        selectedUser={selectedUser}
        onTransferLead={(u) => {
          void handleTransferLead(u);
        }}
      />
      <Dialog open={leadActionOpen} onOpenChange={setLeadActionOpen}>
        <DialogContent className="rounded-3xl border-none sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Lead Action</DialogTitle>
            <DialogDescription>
              Update status, remarks, and follow-up for{" "}
              {leadActionRow?.full_name || "this lead"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={leadActionStatus}
                onValueChange={(v) => setLeadActionStatus(v as LeadCrmStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAFF_ACTION_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {LEAD_CRM_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Remarks</Label>
              <textarea
                className="w-full h-24 p-3 rounded-xl border bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                value={leadActionRemarks}
                onChange={(e) => setLeadActionRemarks(e.target.value)}
                placeholder="Add call notes…"
              />
            </div>
            <div className="space-y-2">
              <Label>Next follow-up date</Label>
              <Input
                type="date"
                value={leadActionFollowUp}
                onChange={(e) => setLeadActionFollowUp(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setLeadActionOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveLeadAction()} disabled={leadActionSaving}>
              {leadActionSaving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Save Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isResetPassOpen} onOpenChange={setIsResetPassOpen}><DialogContent className="rounded-3xl border-none"><DialogHeader><DialogTitle>Reset Password</DialogTitle></DialogHeader><div className="py-4"><Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New Password" /></div><Button className="w-full" onClick={async () => {
                          if (!selectedUser?.id || !newPassword) return;
                          try {
                            const { error } = await supabase.rpc('admin_reset_user_password', { target_user_id: selectedUser.id, new_pass: newPassword });
                            if (error) throw error;
                            const { data: prevRow } = await supabase.from("students").select("metadata").eq("id", selectedUser.id).maybeSingle();
                            const prevMeta = typeof prevRow?.metadata === "object" && prevRow.metadata !== null ? prevRow.metadata : {};
                            const mergedMeta = { ...(prevMeta as object), password: newPassword };
                            const { error: upErr } = await supabase.from("students").update({ metadata: mergedMeta }).eq("id", selectedUser.id);
                            if (upErr) throw upErr;
                            toast.success("Reset!");
                            setIsResetPassOpen(false);
                            setNewPassword("");
                            loadData();
                          } catch (e: unknown) {
                            toast.error(e instanceof Error ? e.message : "Reset failed");
                          }
                        }}>Confirm</Button></DialogContent></Dialog>

      <Dialog
        open={isTransferPassOpen}
        onOpenChange={(open) => {
          setIsTransferPassOpen(open);
          if (!open) setTransferLeadTarget(null);
        }}
      >
        <DialogContent className="rounded-3xl border-none sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Set password for transfer</DialogTitle>
            <DialogDescription>
              No password was saved on this lead. Set one so the student can sign in after transfer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Student password</Label>
            <div className="flex gap-2">
              <Input
                type="text"
                value={transferPassword}
                onChange={(e) => setTransferPassword(e.target.value)}
                placeholder="Enter or generate password"
                className="font-mono"
              />
              <Button type="button" variant="outline" onClick={() => setTransferPassword(generateTempPassword())}>
                Generate
              </Button>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsTransferPassOpen(false);
                setTransferLeadTarget(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={confirmTransferWithPassword} disabled={processing || !transferPassword.trim()}>
              {processing && <Loader2 className="size-4 animate-spin mr-2" />}
              Transfer with password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddStudentOpen} onOpenChange={setIsAddStudentOpen}>
        <DialogContent className="max-w-[min(100vw-2rem,56rem)] max-h-[90vh] overflow-y-auto border-none shadow-elegant rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-black">
              <UserPlus className="size-6 text-primary" />
              Add student (full registration)
            </DialogTitle>
            <DialogDescription>
              Same workflow as the admin panel: complete all steps; no payment when disabled globally.
            </DialogDescription>
          </DialogHeader>
          <RegistrationForm
            key={addStudentFormKey}
            variant="admin"
            onAdminComplete={async (info) => {
              await logAdminAction(
                "CREATE",
                "student",
                `Staff added student (full form): ${info.full_name}`,
                { email: info.email }
              );
              setIsAddStudentOpen(false);
              loadData();
              setDirectoryRefreshKey((k) => k + 1);
            }}
          />
        </DialogContent>
      </Dialog>

      <div className="fixed left-[-10000px] top-0 pointer-events-none" aria-hidden>
        {selectedUser && <OfferLetter ref={offerLetterRef} profile={selectedUser} />}
      </div>
    </div>
  );
};

export default StaffDashboard;
