// Deploy refresh marker — no functional change (2026-07-08).
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Papa from "papaparse";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import {
  clearAdminSessionExpiry,
  adminIntentionalSignOut,
  ensureAdminAuthSession,
  isAdminPortalSessionActive,
  persistAdminAuthSession,
  recoverAdminSessionAfterSignOut,
  isAdminIntentionalLogout,
} from "@/lib/adminAuthSession";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Award, Users, Building2, Edit, Eye, MoreHorizontal, Shield, Mail, Phone, User, BookOpen, Heart, LogIn, Ban, CheckCircle2, Download, Briefcase, UserPlus, Filter, Search, Calendar, ToggleLeft, ToggleRight, DollarSign, GraduationCap, Bell, FileText, Clock, Activity, TrendingUp, CheckSquare, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, LineChart, Line
} from 'recharts';
import AIAssignmentBuilder from "@/components/AIAssignmentBuilder";
import { AdminMobileNav, AdminSidebar, AdminTopBar } from "@/components/admin/AdminShell";
import { ChangePinModal } from "@/components/ChangePinModal";
import { Sparkles, KeyRound, Store, Share2, FileSpreadsheet, IndianRupee, Settings, Wrench, Cog } from "lucide-react";
import { OfferLetter } from "@/components/OfferLetter";
import { downloadOfferLetterPdf, OFFER_LETTER_CAPTURE_WIDTH_PX } from "@/lib/offerLetterPdf";
import { normalizeOfferLetterProfile } from "@/lib/offerLetterProfile";
import { RegistrationForm } from "@/components/RegistrationForm";
import {
  setLoginPasswordViaRpc,
  userFacingPasswordError,
  validateRegistrationPassword,
} from "@/lib/registrationPassword";
import { transferLeadToStudentDirectory } from "@/lib/transferLeadToStudent";
import { resolveLeadStoredPassword } from "@/lib/leadTransferPayload";
import { AdminAddRegistrationPanel } from "@/components/AdminAddRegistrationPanel";
import { StudentDataUploadPanel } from "@/components/admin/StudentDataUploadPanel";
import { GalleryManagementPanel } from "@/components/admin/GalleryManagementPanel";
import { HomeCmsManagementPanel } from "@/components/admin/HomeCmsManagementPanel";
import { ConsultLetterManagementPanel } from "@/components/admin/ConsultLetterManagementPanel";
import { LeadAssignmentPanel } from "@/components/admin/LeadAssignmentPanel";
import { BulkUploadStudentBadge } from "@/components/BulkUploadStudentBadge";
import { ADMIN_LOGIN_PATH, buildCollegeLoginLink, buildStudentCredentialLoginLink } from "@/lib/authRoutes";
import { mergeRegistrationMetadataFromStudentRow } from "@/lib/studentSync";
import {
  hydrateStudentEditWithEngineeringDetails,
  upsertBeuDetailsFromStudentEdit,
} from "@/lib/beuDetails";
import {
  EDIT_GENDER_SENTINEL,
  fetchLatestStudentCredentialRow,
  generateTempPassword,
  getStudentDirectoryPassword,
} from "@/lib/studentCredentials";
import {
  createCollegeAdminWithoutServiceRole,
  createSubUserWithoutServiceRole,
  generateCollegeAdminCode,
  updateCollegeAdminAssignments,
} from "@/lib/createSubUser";
import { CollegeAdminCollegePicker } from "@/components/admin/CollegeAdminCollegePicker";
import { displayCollegeName } from "@/lib/collegeDisplay";
import { collegesForUniversity, fetchAllCollegesCatalog } from "@/lib/institutionCatalog";
import { fetchAdminCoreBootstrap } from "@/lib/portalAuth";
import { isAwsLambdaApiUrl } from "@/lib/awsFetchThrottle";
import { resolveSupabaseUrl } from "@/lib/supabaseEnv";
import { adminUpsertStudentProfile } from "@/lib/adminProfileUpsert";
import { assertSendMailOk, getSendMailApiUrl } from "@/lib/sendMailApi";
import { DatabaseBackup, ArrowUpRight, UploadCloud, AlertTriangle, Check } from "lucide-react";
import {
  estimateBulkMailSeconds,
  formatBulkMailEta,
  sendBulkCustomMail,
} from "@/lib/bulkCustomMailSend";
import { fetchAllSupabaseRows } from "@/lib/fetchAllSupabaseRows";
import {
  fetchAdminSiteVisitStats,
  fetchAdminStudentDirectoryPage,
  fetchAdminStudentsLight,
  fetchSuperAdminUserIds,
} from "@/lib/adminStudentDirectory";
import { fetchCollegeAdminDirectory } from "@/lib/collegeAdminDirectory";
import { parseJsonField } from "@/lib/parseJsonField";
import { exportAdminStudentsCsv } from "@/lib/adminStudentExport";
import {
  filterCommsRecipients,
  searchCommsRecipients,
} from "@/lib/adminBulkComms";
import { buildLeadHuntRows } from "@/lib/leadHunt";
import { fetchRegistrationLeadsPage } from "@/lib/registrationLeadsAdmin";
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
import { ReferralsPanel } from "@/components/admin/ReferralsPanel";
import { CollegeRostersPanel } from "@/components/admin/CollegeRostersPanel";
import { FeesManagementPanel } from "@/components/admin/FeesManagementPanel";
import { CourseManagementPanel } from "@/components/admin/CourseManagementPanel";
import { ClassLinkManagementPanel } from "@/components/admin/ClassLinkManagementPanel";
import { NotificationManagementPanel } from "@/components/admin/NotificationManagementPanel";
import { AssignmentManagementPanel } from "@/components/admin/AssignmentManagementPanel";
import { LearningMaterialsPanel } from "@/components/admin/LearningMaterialsPanel";
import { CertificateManagementPanel } from "@/components/admin/CertificateManagementPanel";
import { EngineeringDirectoryPanel } from "@/components/admin/EngineeringDirectoryPanel";
import { StaffManagementPanel } from "@/components/admin/StaffManagementPanel";
import { IdCardManagementPanel } from "@/components/admin/IdCardManagementPanel";
import {
  emptyStaffPermissions,
  normalizeStaffPermissions,
  staffPermissionsPayload,
  STAFF_PERMISSION_CATALOG,
} from "@/lib/staffPermissions";
import {
  StudentDirectoryActionsMenu,
  type StudentDirectoryStudent,
} from "@/components/admin/StudentDirectoryActionsMenu";
import { StudentAttendancePanel } from "@/components/admin/StudentAttendancePanel";
import { StudentLogbookDialog } from "@/components/admin/StudentLogbookDialog";
import { InternshipModeFilterSelect } from "@/components/admin/InternshipModeFilterSelect";
import { getStudentConsentLetterUrl, saveAdminStudentConsentLetter } from "@/lib/studentDocuments";
import { downloadStudentAttendanceReportPdf } from "@/lib/adminDownloadAttendanceReport";
import { MultiSelectCheckboxGroup } from "@/components/admin/MultiSelectCheckboxGroup";
import { collegesForUniversityNames, pruneCollegesForUniversities } from "@/lib/classLinkTargeting";
import { matchesInternshipModeFilter } from "@/lib/internshipMode";
import { fetchAdminNotifications } from "@/lib/notificationApi";
import { resolveInternshipProgrammeConfig, resolveInternshipModeForUniversity, programmeAttendanceDayBasis, bulkAttendanceDateRangeForUniversity, ADMIN_PROGRAMME_ATTENDANCE_HINT } from "@/lib/internshipProgramme";
import { isBnmuStudent } from "@/lib/feeRules";
import { enrichStudentProfileForDisplay, studentMetadataOf } from "@/lib/studentProfileDisplay";
import { resolveBnmuUniversityRollNumber } from "@/lib/certificateFormat";
import {
  ATTENDANCE_ELIGIBILITY_MIN_PERCENT,
  INTERNSHIP_ATTENDANCE_TOTAL_DAYS,
  LNMU_BULK_ATTENDANCE_END,
  LNMU_BULK_ATTENDANCE_START,
  calcAttendancePercentage,
  attendanceCountsFromRows,
  enrichStudentAttendance,
  getStudentRecordId,
  isAttendanceEligible,
  minDaysForAttendanceEligibility,
  normalizeStudentId,
  normalizeAttendanceCriteria,
} from "@/lib/attendanceStats";
import {
  adminBulkMarkAttendance,
  adminResetAllAttendance,
  fetchAllAttendanceCountsMap,
  fetchAttendanceCountsForAdmin,
  formatAttendanceBulkScopeLabel,
  isAttendanceResetScoped,
  exportAttendanceReportXlsx,
} from "@/lib/attendanceAdmin";
import {
  countProgrammePresentDays,
  nextAbsentProgrammeDayKeys,
  programmeDayMarkedAtIso,
} from "@/lib/studentPortalDocuments";

/** Cyber partner eKYC is not used for admin decisions — never show “KYC” in admin labels. */
function formatCyberCafeStatusLabel(status: string | undefined | null): string {
  if (!status) return "—";
  if (status === "pending_kyc") return "Pending approval";
  return status.replace(/_/g, " ");
}

function cyberCafeRowForEdit(cafe: any) {
  return {
    ...cafe,
    status: cafe?.status === "pending_kyc" ? "pending_approval" : cafe?.status,
  };
}

function getAttendanceBarWidth(percentage: number) {
  if (!Number.isFinite(percentage) || percentage <= 0) return "0%";
  return `${Math.min(100, percentage)}%`;
}

function formatAttendancePercentage(percentage: number) {
  if (!Number.isFinite(percentage)) return "0.0%";
  if (percentage > 0 && percentage < 1) return `${percentage.toFixed(2)}%`;
  return `${percentage.toFixed(1)}%`;
}

function mergeAttendanceCountMaps(
  target: Record<string, number>,
  source: Record<string, number>
): void {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] || 0) + value;
  }
}

export default function Admin() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const [activeTab, setActiveTab] = useState(queryParams.get("tab") || "dashboard");
  const [showSidebar, setShowSidebar] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  // Data
  const [students, setStudents] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [collegeAdmins, setCollegeAdmins] = useState<any[]>([]);
  const [unis, setUnis] = useState<any[]>([]);
  const [colleges, setColleges] = useState<any[]>([]);
  const [certs, setCerts] = useState<any[]>([]);
  const [domains, setDomains] = useState<any[]>([]);
  const [classesList, setClassesList] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [failedPayments, setFailedPayments] = useState<any[]>([]);
  const [cancelledPayments, setCancelledPayments] = useState<any[]>([]);
  const [visitorCount, setVisitorCount] = useState(0);
  const [uniqueVisitorCount, setUniqueVisitorCount] = useState(0);
  const [systemSettings, setSystemSettings] = useState<any[]>([]);
  const [myPermissions, setMyPermissions] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [cyberCafes, setCyberCafes] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const consentUploadInputRef = useRef<HTMLInputElement>(null);
  const consentUploadStudentRef = useRef<StudentDirectoryStudent | null>(null);
  const [isAIBuilderOpen, setIsAIBuilderOpen] = useState(false);

  // Password Reset States
  const [isResetPassOpen, setIsResetPassOpen] = useState(false);
  const [resetPassUser, setResetPassUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");

  // Lead → directory transfer password (when lead has none stored)
  const [isTransferPassOpen, setIsTransferPassOpen] = useState(false);
  const [transferLeadTarget, setTransferLeadTarget] = useState<any>(null);
  const [transferPassword, setTransferPassword] = useState("");

  // Offer Letter States for Cyber Cafe
  const [offerEmail, setOfferEmail] = useState("");
  const [offerStudent, setOfferStudent] = useState<any>(null);
  const offerLetterRef = useRef<HTMLDivElement>(null);

  // Notification States
  const [newNoticeTitle, setNewNoticeTitle] = useState("");
  const [newNoticeMessage, setNewNoticeMessage] = useState("");
  const [newNoticeTarget, setNewNoticeTarget] = useState("all");
  const [newNoticeTargetUserId, setNewNoticeTargetUserId] = useState("");

  // Selection & Filters
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [domainFilter, setDomainFilter] = useState("all");
  const [uniFilter, setUniFilter] = useState("all");
  const [collegeFilter, setCollegeFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");
  const [payStartDate, setPayStartDate] = useState("");
  const [payEndDate, setPayEndDate] = useState("");
  const [payCollegeFilter, setPayCollegeFilter] = useState("all");
  const [leadsSearchTerm, setLeadsSearchTerm] = useState("");
  const [leadsUniFilter, setLeadsUniFilter] = useState("all");
  const [leadsCollegeFilter, setLeadsCollegeFilter] = useState("all");
  const [leadsPage, setLeadsPage] = useState(0);
  const [leadsTotalCount, setLeadsTotalCount] = useState(0);

  // Pagination
  const [studentPage, setStudentPage] = useState(0);
  const [studentTotalCount, setStudentTotalCount] = useState(0);
  const [isStudentsLoading, setIsStudentsLoading] = useState(false);
  const pageSize = 20;
  const leadsPageSize = 20;
  const payPageSize = 20;
  const attendancePageSize = 20;

  // Dialog States
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [editData, setEditData] = useState<any>(null);
  const [editFormVariant, setEditFormVariant] = useState<StudentEditFormVariant>("directory");
  const [engineeringUniNames, setEngineeringUniNames] = useState<string[]>([]);
  const [engCatalog, setEngCatalog] = useState(() => aggregateEngineeringCatalogOptions([]));
  const [processing, setProcessing] = useState(false);

  // Form States
  const [staffEmail, setStaffEmail] = useState("");

  // CRUD States
  const [newUni, setNewUni] = useState("");
  const [collegeUni, setCollegeUni] = useState("");
  const [newCollege, setNewCollege] = useState("");
  const [newDomain, setNewDomain] = useState("");

  // Class Scheduler States
  const [newClassTitle, setNewClassTitle] = useState("");
  const [newClassType, setNewClassType] = useState("youtube");
  const [newClassUrl, setNewClassUrl] = useState("");
  const [newClassSchedule, setNewClassSchedule] = useState("");
  const [newClassDomain, setNewClassDomain] = useState("all");

  // Bulk Email States
  const [bulkEmailSubject, setBulkEmailSubject] = useState("");
  const [bulkEmailBody, setBulkEmailBody] = useState("");
  const [isSendingBulk, setIsSendingBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [csvEmails, setCsvEmails] = useState<string[]>([]);
  const [commsSelectedIds, setCommsSelectedIds] = useState<string[]>([]);
  const [commRecipientType, setCommRecipientType] = useState<"enrolled" | "unenrolled">("enrolled");
  const [commUniFilters, setCommUniFilters] = useState<string[]>([]);
  const [commCollegeFilters, setCommCollegeFilters] = useState<string[]>([]);
  const [commDomainFilter, setCommDomainFilter] = useState("all");
  const [commModeFilter, setCommModeFilter] = useState("all");
  const [commSearchTerm, setCommSearchTerm] = useState("");
  const [allStudentsComms, setAllStudentsComms] = useState<any[]>([]);
  const [allLeadsComms, setAllLeadsComms] = useState<any[]>([]);

  // Attendance States
  const [attendanceStudentRows, setAttendanceStudentRows] = useState<any[]>([]);
  const [attendanceCounts, setAttendanceCounts] = useState<Record<string, number>>({});
  const attendanceStudentRowsRef = useRef<any[]>([]);
  const attendanceCountsLoadRef = useRef(0);
  const attendanceCountsFetchKeyRef = useRef("");
  const [attendanceCriteria, setAttendanceCriteria] = useState(75);
  const attendanceCriteriaRef = useRef(attendanceCriteria);
  useEffect(() => {
    attendanceCriteriaRef.current = attendanceCriteria;
  }, [attendanceCriteria]);
  const [attendanceSearchTerm, setAttendanceSearchTerm] = useState("");
  const [attendanceUniFilter, setAttendanceUniFilter] = useState("all");
  const [attendanceCollegeFilter, setAttendanceCollegeFilter] = useState("all");
  const [attendanceDomainFilter, setAttendanceDomainFilter] = useState("all");
  const [logbookStudent, setLogbookStudent] = useState<any>(null);
  const [isLogbookOpen, setIsLogbookOpen] = useState(false);
  const [bulkMarkStartDate, setBulkMarkStartDate] = useState(LNMU_BULK_ATTENDANCE_START);
  const [bulkMarkEndDate, setBulkMarkEndDate] = useState(LNMU_BULK_ATTENDANCE_END);
  const [attendanceConfirmAction, setAttendanceConfirmAction] = useState<"reset" | "bulk" | null>(null);
  const [attendancePage, setAttendancePage] = useState(0);
  const [paySearchTerm, setPaySearchTerm] = useState("");
  const [payPage, setPayPage] = useState(0);
  const [oldLeadsSearchTerm, setOldLeadsSearchTerm] = useState("");
  const [selectedAttendanceStudent, setSelectedAttendanceStudent] = useState<any>(null);
  const [studentAttendanceHistory, setStudentAttendanceHistory] = useState<any[]>([]);
  const [isAttHistoryOpen, setIsAttHistoryOpen] = useState(false);
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [attendanceOpsLoading, setAttendanceOpsLoading] = useState(false);
  const [isServiceAccessOpen, setIsServiceAccessOpen] = useState(false);

  useEffect(() => {
    attendanceStudentRowsRef.current = attendanceStudentRows;
  }, [attendanceStudentRows]);

  useEffect(() => {
    if (attendanceUniFilter === "all") return;
    const range = bulkAttendanceDateRangeForUniversity(attendanceUniFilter);
    if (range) {
      setBulkMarkStartDate(range.startDate);
      setBulkMarkEndDate(range.endDate);
    }
  }, [attendanceUniFilter]);

  const attendanceProgrammeBulkHint = useMemo(() => {
    if (attendanceUniFilter !== "all") {
      return bulkAttendanceDateRangeForUniversity(attendanceUniFilter)?.label ?? null;
    }
    return null;
  }, [attendanceUniFilter]);

  /** Same college catalog as Edit Student — filtered by selected university. */
  const directoryUnis = useMemo(
    () =>
      unis.filter(
        (u) => !isEngineeringUniversityName(u.name, engineeringUniNames)
      ),
    [unis, engineeringUniNames]
  );
  const directoryCollegeOptions = useMemo(
    () => collegesForUniversity(colleges, directoryUnis, uniFilter),
    [colleges, directoryUnis, uniFilter]
  );
  const editDialogUnis = useMemo(() => {
    if (editFormVariant === "engineering") {
      return unis.filter((u) =>
        isEngineeringUniversityName(u.name, engineeringUniNames)
      );
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
  const directoryDomainOptions = useMemo(() => {
    const engDomainSet = new Set(engCatalog.domains.map((d) => d.toLowerCase()));
    if (engDomainSet.size === 0) return domains;
    return domains.filter((d) => !engDomainSet.has(String(d.name || "").toLowerCase()));
  }, [domains, engCatalog.domains]);
  const editEngCourses = engCatalog.courses;
  const editEngBranches = useMemo(() => {
    const course = String(editData?.department || "").trim();
    if (course && engCatalog.branchesByCourse[course]?.length) {
      return engCatalog.branchesByCourse[course];
    }
    return engCatalog.branches;
  }, [editData?.department, engCatalog]);
  const leadsCollegeOptions = useMemo(
    () => collegesForUniversity(colleges, unis, leadsUniFilter),
    [colleges, unis, leadsUniFilter]
  );
  const attendanceCollegeOptions = useMemo(
    () => collegesForUniversity(colleges, unis, attendanceUniFilter),
    [colleges, unis, attendanceUniFilter]
  );

  const attendanceStudents = useMemo(
    () =>
      attendanceStudentRows.map((s) =>
        enrichStudentAttendance(
          s,
          attendanceCounts[normalizeStudentId(getStudentRecordId(s))] ?? 0,
          attendanceCriteria,
          programmeAttendanceDayBasis(s.university_name)
        )
      ),
    [attendanceStudentRows, attendanceCounts, attendanceCriteria]
  );

  // New Sub-User States
  const [newSubUserEmail, setNewSubUserEmail] = useState("");
  const [newSubUserPassword, setNewSubUserPassword] = useState("");
  const [newSubUserRoleTag, setNewSubUserRoleTag] = useState("");
  const [newSubUserRole, setNewSubUserRole] = useState<"admin" | "staff">("staff");
  const [newSubUserPermissions, setNewSubUserPermissions] = useState(emptyStaffPermissions());

  const [newCollegeAdminEmail, setNewCollegeAdminEmail] = useState("");
  const [newCollegeAdminName, setNewCollegeAdminName] = useState("");
  const [newCollegeAdminUniId, setNewCollegeAdminUniId] = useState("");
  const [newCollegeAdminCollegeIds, setNewCollegeAdminCollegeIds] = useState<string[]>([]);
  /** College Admin ID = initial Supabase password; generate before create or type your own (min 6 chars). */
  const [newCollegeAdminCode, setNewCollegeAdminCode] = useState("");
  const [isEditCollegeAdminOpen, setIsEditCollegeAdminOpen] = useState(false);
  const [editingCollegeAdmin, setEditingCollegeAdmin] = useState<any | null>(null);
  const [editCollegeAdminName, setEditCollegeAdminName] = useState("");
  const [editCollegeAdminEmail, setEditCollegeAdminEmail] = useState("");
  const [editCollegeAdminUniId, setEditCollegeAdminUniId] = useState("");
  const [editCollegeAdminCollegeIds, setEditCollegeAdminCollegeIds] = useState<string[]>([]);
  const [editCollegeAdminCode, setEditCollegeAdminCode] = useState("");
  const [viewCollegeAdminRow, setViewCollegeAdminRow] = useState<any | null>(null);

  // Manage Permissions States
  const [isManagePermissionsOpen, setIsManagePermissionsOpen] = useState(false);
  const [selectedStaffMember, setSelectedStaffMember] = useState<any>(null);
  const [staffPermissions, setStaffPermissions] = useState<any>({});

  // Bulk Attendance States
  const [selectedAttendanceIds, setSelectedAttendanceIds] = useState<string[]>([]);
  const [attendanceIncreasePercent, setAttendanceIncreasePercent] = useState<number>(0);
  const [addingAttendanceStudentId, setAddingAttendanceStudentId] = useState<string | null>(null);

  // Cyber Cafe View States
  const [isCafeViewOpen, setIsCafeViewOpen] = useState(false);
  const [selectedCafe, setSelectedCafe] = useState<any>(null);
  const [isEditingCafe, setIsEditingCafe] = useState(false);
  const [editCafeData, setEditCafeData] = useState<any>(null);
  const [cafeStartDate, setCafeStartDate] = useState("");
  const [cafeEndDate, setCafeEndDate] = useState("");
  const [cafeViewStudents, setCafeViewStudents] = useState<any[]>([]);
  const [cafeStudentsLoading, setCafeStudentsLoading] = useState(false);

  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [addStudentFormKey, setAddStudentFormKey] = useState(0);
  const [registrationDraftLeads, setRegistrationDraftLeads] = useState<any[]>([]);

  // ==========================================
  // DATA IMPORT OPTIONS
  // ==========================================
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importType, setImportType] = useState<"transactions" | "students" | "profiles" | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importData, setImportData] = useState<any[]>([]);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importMapping, setImportMapping] = useState<Record<string, string>>({});
  const [importPreview, setImportPreview] = useState<{
    total: number;
    valid: number;
    duplicates: number;
    ready: number;
    invalid: number;
    records: any[];
  } | null>(null);
  const [importStep, setImportStep] = useState<1 | 2 | 3>(1); // 1: upload & map, 2: preview, 3: progress & results
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<{
    success: number;
    failed: number;
    errors: string[];
  } | null>(null);

  const expectedFields = {
    transactions: ["email", "full_name", "payment_id", "amount_paise", "created_at"],
    students: ["email", "full_name", "contact_number", "password", "internship_domain", "college_name", "university_name", "degree", "department", "class_semester", "academic_session", "roll_number", "course"],
    profiles: ["email", "full_name", "contact_number", "password", "gender", "parent_name"]
  };

  const commonAliases: Record<string, string[]> = {
    email: ["email", "Email", "EMAIL", "email_id", "Email Address", "email address", "user_email"],
    full_name: ["full_name", "name", "Full Name", "full name", "Name", "fullname", "fullName"],
    payment_id: ["payment_id", "pay_id", "payment id", "Payment ID", "pay_id", "razorpay_payment_id"],
    amount_paise: ["amount_paise", "amount", "Amount", "amount paise", "Amount Paise", "amount_paid"],
    created_at: ["created_at", "date", "Date", "created at", "Created At"],
    contact_number: ["contact_number", "phone", "Phone", "mobile", "Mobile", "contact", "Contact", "phone_number", "contact_no"],
    password: ["password", "Password", "pwd", "pass"],
    internship_domain: ["internship_domain", "domain", "Domain", "internship domain"],
    college_name: ["college_name", "college", "College", "college name", "institution"],
    university_name: ["university_name", "university", "University", "university name"],
    degree: ["degree", "Degree"],
    department: ["department", "Department"],
    class_semester: ["class_semester", "semester", "Semester", "class semester"],
    academic_session: ["academic_session", "session", "Session", "academic session"],
    roll_number: ["roll_number", "roll no", "roll number", "Roll Number", "Roll No"],
    course: ["course", "Course"],
    gender: ["gender", "Gender", "sex", "Sex"],
    parent_name: ["parent_name", "father_name", "parent name", "Parent Name", "Father Name", "guardian_name"]
  };

  const autoMapHeaders = (headers: string[], type: "transactions" | "students" | "profiles") => {
    const mapping: Record<string, string> = {};
    const fields = expectedFields[type];
    fields.forEach(field => {
      const aliases = commonAliases[field] || [field];
      const match = headers.find(h => 
        aliases.some(alias => alias.toLowerCase().replace(/[^a-z0-9]/g, "") === h.toLowerCase().replace(/[^a-z0-9]/g, ""))
      );
      mapping[field] = match || "";
    });
    return mapping;
  };

  const handleOpenImportDialog = (type: "transactions" | "students" | "profiles") => {
    setImportType(type);
    setImportFile(null);
    setImportData([]);
    setImportHeaders([]);
    setImportMapping({});
    setImportPreview(null);
    setImportStep(1);
    setIsImporting(false);
    setImportProgress(0);
    setImportResults(null);
    setIsImportDialogOpen(true);
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !importType) return;

    setImportFile(file);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          const headers = Object.keys(results.data[0]);
          setImportHeaders(headers);
          setImportData(results.data);
          const initialMapping = autoMapHeaders(headers, importType);
          setImportMapping(initialMapping);
        } else {
          toast.error("CSV file is empty.");
        }
      },
      error: (error) => {
        toast.error("Failed to parse CSV: " + error.message);
      }
    });
  };

  const handleGeneratePreview = async () => {
    if (!importType || importData.length === 0) {
      toast.error("No data available to validate.");
      return;
    }

    setProcessing(true);
    try {
      // 1. Fetch all profile emails from the database to check for duplicates
      const { data: allProfiles, error } = await supabase.from('profiles').select('email');
      if (error) {
        toast.error("Failed to load profiles for duplicate checking: " + error.message);
        return;
      }
      const existingProfileEmails = new Set(allProfiles?.map(p => p.email?.toLowerCase().trim()) || []);

      // 2. Fetch target table keys to check for duplicates in target tables
      const existingTargetKeys = new Set<string>();
      if (importType === "transactions") {
        const { data: allPayments, error: payError } = await supabase.from('payment_success').select('email, payment_id');
        if (!payError && allPayments) {
          allPayments.forEach(p => {
            if (p.email) existingTargetKeys.add(p.email.toLowerCase().trim());
            if (p.payment_id) existingTargetKeys.add(p.payment_id.toLowerCase().trim());
          });
        }
      } else if (importType === "students") {
        const { data: allStudents, error: studError } = await supabase.from('students').select('email');
        if (!studError && allStudents) {
          allStudents.forEach(s => {
            if (s.email) existingTargetKeys.add(s.email.toLowerCase().trim());
          });
        }
      }

      const mappedRecords = importData.map((row, index) => {
        const record: Record<string, any> = {};
        Object.entries(importMapping).forEach(([field, header]) => {
          record[field] = header ? String(row[header] || "").trim() : "";
        });

        const email = String(record.email || "").toLowerCase().trim();
        const paymentId = String(record.payment_id || "").toLowerCase().trim();
        let status: "ready" | "duplicate" | "invalid" = "ready";
        let reason = "";

        if (!email || !email.includes("@")) {
          status = "invalid";
          reason = "Invalid or missing email";
        } else if (existingProfileEmails.has(email)) {
          status = "duplicate";
          reason = "Matches existing Profile Table entry";
        } else if (importType === "transactions" && (existingTargetKeys.has(email) || (paymentId && existingTargetKeys.has(paymentId)))) {
          status = "duplicate";
          reason = "Matches existing Transaction in database";
        } else if (importType === "students" && existingTargetKeys.has(email)) {
          status = "duplicate";
          reason = "Matches existing Student in database";
        }

        return {
          index,
          raw: row,
          data: record,
          status,
          reason,
          email
        };
      });

      const total = mappedRecords.length;
      const duplicates = mappedRecords.filter(r => r.status === "duplicate").length;
      const invalid = mappedRecords.filter(r => r.status === "invalid").length;
      const ready = mappedRecords.filter(r => r.status === "ready").length;

      setImportPreview({
        total,
        valid: ready + duplicates,
        duplicates,
        ready,
        invalid,
        records: mappedRecords
      });

      setImportStep(2);
    } catch (e: any) {
      toast.error("Error creating preview: " + e.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!importPreview || !importType) return;

    setIsImporting(true);
    setImportProgress(0);
    setImportStep(3);

    const recordsToImport = importPreview.records.filter(r => r.status === "ready");
    const totalToImport = recordsToImport.length;

    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    const sendMailUrl = getSendMailApiUrl();

    for (let i = 0; i < totalToImport; i++) {
      const record = recordsToImport[i];
      try {
        if (importType === "transactions") {
          // Direct insert into payment_success
          const paymentId = record.data.payment_id || 'pay_import_' + Math.random().toString(36).substring(2, 12).toUpperCase();
          const amountPaise = record.data.amount_paise ? parseInt(record.data.amount_paise, 10) : 9900;

          const { error } = await supabase.from("payment_success").insert({
            email: record.email,
            full_name: record.data.full_name || "Student",
            payment_id: paymentId,
            amount_paise: amountPaise,
            metadata: { ...record.raw, imported: true },
            created_at: record.data.created_at ? new Date(record.data.created_at).toISOString() : new Date().toISOString()
          });

          if (error) throw error;

        } else if (importType === "students" || importType === "profiles") {
          // 1. Generate password and phone if missing
          const pwd = record.data.password || "ApnaIntern@" + Math.floor(1000 + Math.random() * 9000);
          let phone = record.data.contact_number || "";
          phone = phone.replace(/\D/g, "").slice(-10);
          if (phone.length < 10) {
            phone = "99" + Math.floor(10000000 + Math.random() * 90000000);
          }

          // 2. Call minimal student registration RPC
          const fullName = record.data.full_name || "Student";
          const { data, error: rpcError } = await supabase.rpc("admin_create_minimal_student_registration", {
            p_email: record.email,
            p_password: pwd,
            p_phone: phone,
            p_full_name: fullName,
            p_payment_id: null,
            p_amount_paise: null
          });

          if (rpcError) throw rpcError;

          const row = (data || {}) as Record<string, unknown>;
          if (row.ok !== true) throw new Error("Base registration RPC failed");

          const userId = String(row.user_id || "");
          const regId = row.registration_id ? String(row.registration_id) : "";

          // 3. Update student table details
          if (importType === "students") {
            const updateData: Record<string, any> = {};
            const fields = ["gender", "parent_name", "internship_domain", "college_name", "university_name", "degree", "department", "class_semester", "academic_session", "roll_number", "course"];
            fields.forEach(field => {
              if (record.data[field]) updateData[field] = record.data[field];
            });

            if (Object.keys(updateData).length > 0) {
              const { error: updateError } = await supabase.from("students").update(updateData).eq("id", userId);
              if (updateError) console.warn("Failed to update extra student fields:", updateError);
            }
          }

          // 3b. Update profile details
          if (importType === "profiles") {
            const updateData: Record<string, any> = {};
            const fields = ["gender", "parent_name"];
            fields.forEach(field => {
              if (record.data[field]) updateData[field] = record.data[field];
            });

            if (Object.keys(updateData).length > 0) {
              const { error: updateError } = await supabase.from("profiles").update(updateData).eq("id", userId);
              if (updateError) console.warn("Failed to update profile fields:", updateError);
            }
          }

          // 4. Send welcome email notification
          try {
            const mailRes = await fetch(sendMailUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "registration_success",
                email: record.email,
                data: {
                  fullName: fullName,
                  regId: regId,
                  password: pwd,
                  loginLink: "https://www.apnaintern.in/login?portal=student",
                },
              }),
            });
            await assertSendMailOk(mailRes);
          } catch (e) {
            console.warn("Failed to send welcome email for:", record.email, e);
          }
        }

        successCount++;
      } catch (err: any) {
        console.error(`Import failed for ${record.email}:`, err);
        failedCount++;
        errors.push(`${record.email}: ${err.message || String(err)}`);
      }

      setImportProgress(Math.round(((i + 1) / totalToImport) * 100));
    }

    setImportResults({
      success: successCount,
      failed: failedCount,
      errors
    });

    setIsImporting(false);
    loadAll();
  };
  const [enrolledEmailsSet, setEnrolledEmailsSet] = useState<Set<string>>(() => new Set());
  const [isPaymentsLoading, setIsPaymentsLoading] = useState(false);
  const [isLeadsDataLoading, setIsLeadsDataLoading] = useState(false);
  const [isAttendanceLoading, setIsAttendanceLoading] = useState(false);
  const [isAttendanceCountsLoading, setIsAttendanceCountsLoading] = useState(false);

  const adminDataLoadedRef = useRef({
    core: false,
    payments: false,
    leads: false,
    attendance: false,
    commsStudents: false,
  });
  const paymentsLoadInFlightRef = useRef<Promise<void> | null>(null);
  const leadsLoadInFlightRef = useRef<Promise<void> | null>(null);
  const attendanceLoadInFlightRef = useRef<Promise<void> | null>(null);
  const commsStudentsLoadInFlightRef = useRef<Promise<void> | null>(null);
  const enrolledEmailsRef = useRef<Set<string>>(new Set());
  const cancelledPaymentsRef = useRef<any[]>([]);
  const adminInitDoneRef = useRef(false);

  const applyEnrolledEmails = (emails: Iterable<string | undefined | null>) => {
    const next = new Set<string>();
    for (const e of emails) {
      const norm = e?.toLowerCase();
      if (norm) next.add(norm);
    }
    enrolledEmailsRef.current = next;
    setEnrolledEmailsSet(next);
  };

  const syncLeadsCommsFromCancelled = (cancelledRows: any[]) => {
    const leads = cancelledRows.filter((cp: any) => {
      const email = String(cp.email || cp.user_email || "").toLowerCase();
      return email && !enrolledEmailsRef.current.has(email);
    });
    setAllLeadsComms(leads);
  };

  // Dashboard Visual Logic
  const getRevenueData = () => {
    const daily: any = {};
    payments.forEach(p => {
      const date = new Date(p.created_at).toLocaleDateString();
      daily[date] = (daily[date] || 0) + (p.amount_paise / 100);
    });
    return Object.entries(daily).map(([date, amount]) => ({ date, amount })).slice(-7);
  };

  const [dashStartDate, setDashStartDate] = useState("");
  const [dashEndDate, setDashEndDate] = useState("");
  const [livePulse, setLivePulse] = useState<{name: string, value: number}[]>(
    Array.from({length: 12}, (_, i) => ({name: i.toString(), value: 40 + Math.random() * 20}))
  );
  const [liveTraffic, setLiveTraffic] = useState(86);
  const [monitoringStatus, setMonitoringStatus] = useState("SCANNING...");

  useEffect(() => {
    if (activeTab !== "dashboard") return;
    const interval = setInterval(() => {
      setLivePulse(prev => {
        const newVal = 35 + Math.random() * 35;
        return [...prev.slice(1), {name: Date.now().toString(), value: newVal}];
      });
      setLiveTraffic(prev => prev + (Math.random() > 0.5 ? 1 : -1));
      
      const statuses = ["MONITORING...", "NODE ACTIVE", "TRAFFIC STABLE", "SYSTEM OPTIMIZED"];
      setMonitoringStatus(statuses[Math.floor(Math.random() * statuses.length)]);
    }, 2500);
    return () => clearInterval(interval);
  }, [activeTab]);

  const getFilteredRevenueData = () => {
    let filtered = payments;
    if (dashStartDate) filtered = filtered.filter(p => p.created_at >= `${dashStartDate}T00:00:00`);
    if (dashEndDate) filtered = filtered.filter(p => p.created_at <= `${dashEndDate}T23:59:59`);
    
    const daily: any = {};
    filtered.forEach(p => {
      const date = new Date(p.created_at).toLocaleDateString();
      daily[date] = (daily[date] || 0) + (p.amount_paise / 100);
    });
    return Object.entries(daily).map(([date, amount]) => ({ date, amount }));
  };

  const getDashboardStats = () => {
    const today = new Date().toLocaleDateString();
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString();
    
    const todayRevenue = payments.filter(p => new Date(p.created_at).toLocaleDateString() === today)
      .reduce((acc, curr) => acc + (curr.amount_paise / 100), 0);
    const yesterdayRevenue = payments.filter(p => new Date(p.created_at).toLocaleDateString() === yesterday)
      .reduce((acc, curr) => acc + (curr.amount_paise / 100), 0);
    
    const todayEnrolledCount = payments.filter(p => new Date(p.created_at).toLocaleDateString() === today).length;
    const todayLeadsCount = cancelledPayments.filter(p => new Date(p.created_at).toLocaleDateString() === today).length;
    
    const growth = yesterdayRevenue === 0 ? 100 : ((todayRevenue - yesterdayRevenue) / yesterdayRevenue * 100);

    return { todayRevenue, yesterdayRevenue, growth, todayEnrolledCount, todayLeadsCount, today };
  };

  const stats = getDashboardStats();

  const logAdminAction = async (action_type: string, entity_type: string, description: string, metadata: any = {}) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await supabase.from("admin_logs").insert({
        user_id: session.user.id,
        admin_email: session.user.email,
        action_type,
        entity_type,
        description,
        metadata,
        created_at: new Date().toISOString()
      });
    } catch (err) {
      console.error("Log Action Error:", err);
    }
  };

  const handleResendCredentials = async (student: any) => {
    if (
      !confirm(
        `Resend login details to ${student.full_name}? The email uses the password stored in the student directory (registration / last admin reset / student's saved login password). Continue?`
      )
    )
      return;
    setProcessing(true);
    try {
      const latestData = await fetchLatestStudentCredentialRow(supabase, student.id);
      if (!latestData) throw new Error("Student record not found.");

      let finalPassword = getStudentDirectoryPassword(latestData);
      const finalRegId = latestData.registration_id || student.registration_id;

      if (!finalPassword) {
        const ok = confirm(
          "No password is stored for this student (common when they registered without saving one in the directory).\n\nGenerate a new temporary password, update their login, save it to the directory, and email it?"
        );
        if (!ok) {
          toast.message("Use Reset Password from the menu when you want to set one manually.");
          return;
        }
        finalPassword = generateTempPassword();
        const { error: rpcErr } = await supabase.rpc("admin_reset_user_password", {
          target_user_id: student.id,
          new_pass: finalPassword,
        });
        if (rpcErr) throw rpcErr;
        const prevMeta =
          typeof latestData.metadata === "object" && latestData.metadata !== null
            ? latestData.metadata
            : {};
        const mergedMeta = { ...prevMeta, password: finalPassword };
        const { error: saveErr } = await supabase
          .from("students")
          .update({ metadata: mergedMeta })
          .eq("id", student.id);
        if (saveErr) throw saveErr;
        toast.success("Temporary password generated and saved.");
      }

      const toEmail = String(latestData.email || student.email || "").trim();
      if (!toEmail) throw new Error("Student has no email address — update their profile first.");

      const res = await fetch(getSendMailApiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toEmail,
          email: toEmail,
          action: 'registration_success',
          data: {
            fullName: latestData.full_name || student.full_name,
            regId: finalRegId || "",
            password: finalPassword,
            loginLink: buildStudentCredentialLoginLink(),
          }
        })
      });
      await assertSendMailOk(res);
      toast.success("Credentials sent successfully!");
      await logAdminAction('RESEND_CREDENTIALS', 'student', `Resent login credentials to ${student.full_name}`, { student_id: student.id });
      await fetchStudents();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetPassUser || !newPassword) return;
    setProcessing(true);
    try {
      const { error } = await supabase.rpc('admin_reset_user_password', {
        target_user_id: resetPassUser.id,
        new_pass: newPassword,
      });
      if (error) throw error;

      const { data: prevRow } = await supabase
        .from("students")
        .select("metadata")
        .eq("id", resetPassUser.id)
        .maybeSingle();
      const prevMeta =
        typeof prevRow?.metadata === "object" && prevRow.metadata !== null ? prevRow.metadata : {};
      const mergedMeta = { ...prevMeta, password: newPassword };

      const { error: updateError } = await supabase
        .from("students")
        .update({ metadata: mergedMeta })
        .eq("id", resetPassUser.id);
      if (updateError) throw updateError;

      const resetEmail = String(resetPassUser.email || "").trim();
      if (resetEmail) {
        try {
          const emailRes = await fetch(getSendMailApiUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: resetEmail,
              email: resetEmail,
              action: 'admin_password_reset',
              data: {
                fullName: resetPassUser.full_name,
                password: newPassword,
                loginLink: buildStudentCredentialLoginLink(),
              }
            })
          });
          await assertSendMailOk(emailRes);
        } catch (mailErr: unknown) {
          const msg = mailErr instanceof Error ? mailErr.message : String(mailErr);
          toast.warning(`Password updated, but email failed: ${msg}`);
        }
      }

      toast.success("Password reset successfully!");
      await logAdminAction('RESET_PASSWORD', 'student', `Manually reset password for ${resetPassUser.full_name}`, { student_id: resetPassUser.id });
      setIsResetPassOpen(false);
      setNewPassword("");
      await fetchStudents();
    } catch (err: any) {
      toast.error(err.message || "Failed to reset password");
    } finally {
      setProcessing(false);
    }
  };

  const handleViewPaymentStudent = async (email: string) => {
    setProcessing(true);
    try {
      // First check local state
      let student = students.find(s => s.email === email);
      
      if (!student) {
        // Fetch from DB if not in local paginated state
        const { data, error } = await supabase
          .from('students')
          .select('*')
          .eq('email', email)
          .maybeSingle();
        
        if (error) throw error;
        student = data;
      }
      
      if (student) {
        void openStudentViewDialog(student);
      } else {
        toast.error("Student record not found in database.");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleSendNotification = async () => {
    if (!newNoticeTitle.trim() || !newNoticeMessage.trim()) return toast.error("Please fill title and message");
    if (newNoticeTarget === "specific" && !newNoticeTargetUserId.trim()) return toast.error("Please provide a student ID");
    
    setProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      let target_uid = null;
      if (newNoticeTarget === "specific") {
        const { data: studentCheck } = await supabase.from("students").select("id").or(`registration_id.eq.${newNoticeTargetUserId},id.eq.${newNoticeTargetUserId}`).maybeSingle();
        if (!studentCheck) {
          setProcessing(false);
          return toast.error("Student not found with this ID or Registration ID");
        }
        target_uid = studentCheck.id;
      }

      const { error } = await supabase.from("notifications").insert({
        title: newNoticeTitle,
        message: newNoticeMessage,
        target_type: newNoticeTarget,
        target_user_id: target_uid,
        created_by: session?.user.id
      });

      if (error) throw error;

      toast.success("Notification sent successfully!");
      setNewNoticeTitle("");
      setNewNoticeMessage("");
      setNewNoticeTargetUserId("");
      loadAll();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleEditStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editData) return;
    setProcessing(true);
    try {
      const mergedMeta = {
        ...mergeRegistrationMetadataFromStudentRow(editData),
        student_track: editFormVariant === "engineering" ? "engineering" : "non_tech",
      };
      const courseVal =
        (editData.internship_domain || editData.course || "") as string;
      const emailNorm = String(editData.email || "").trim().toLowerCase();
      if (!emailNorm) {
        toast.error("Student email is required.");
        return;
      }

      const { data: updatedStudent, error } = await supabase.from("students").update({
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
      }).eq("id", editData.id).select("id").maybeSingle();

      if (error) throw error;
      if (!updatedStudent?.id) {
        throw new Error(
          "Student row was not updated (0 rows). Your role may lack UPDATE on students, or RLS is blocking — apply fix_staff_rls.sql / admin policies."
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
        console.warn("[edit-student] beu_details upsert:", beuErr);
      }

      await logAdminAction('UPDATE', 'student', `Updated student details: ${editData.full_name} (Admin)`, { student_id: editData.id });
      
      toast.success("Student updated successfully!");
      setIsEditDialogOpen(false);
      // loadAll() does not refresh paginated `students`; fetchStudents() drives the directory + View Details row snapshots.
      await Promise.all([loadAll(), fetchStudents()]);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const fetchStudents = async () => {
    setIsStudentsLoading(true);
    try {
      const { rows, total } = await fetchAdminStudentDirectoryPage(
        supabase,
        studentPage,
        pageSize,
        {
          searchTerm,
          domainFilter,
          uniFilter,
          collegeFilter,
          modeFilter,
          startDate,
          endDate,
          dateFilter,
        }
      );

      const superAdminIds = await fetchSuperAdminUserIds(supabase);

      setStudents(rows.filter((student) => !superAdminIds.includes(String(student.id))));
      setStudentTotalCount(total);
    } catch (err) {
      console.error("Fetch Students Error:", err);
      toast.error("Failed to load students");
    } finally {
      setIsStudentsLoading(false);
    }
  };

  useEffect(() => {
    if (!isCafeViewOpen || !selectedCafe?.id) {
      setCafeViewStudents([]);
      setCafeStudentsLoading(false);
      return;
    }
    let cancelled = false;
    setCafeStudentsLoading(true);
    const email = String(selectedCafe.email || "").trim();
    const shop = String(selectedCafe.shop_name || "").trim();
    void (async () => {
      try {
        const [r1, r2] = await Promise.all([
          email
            ? supabase.from("students").select("*").eq("cybercafe_email", email)
            : Promise.resolve({ data: [] as any[] }),
          shop
            ? supabase.from("students").select("*").eq("cybercafe_shop_name", shop)
            : Promise.resolve({ data: [] as any[] }),
        ]);
        if (cancelled) return;
        const map = new Map<string, any>();
        [...(r1.data || []), ...(r2.data || [])].forEach((s) => map.set(s.id, s));
        setCafeViewStudents([...map.values()]);
      } finally {
        if (!cancelled) setCafeStudentsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isCafeViewOpen, selectedCafe?.id]);

  const safeQuery = useCallback(async (query: Promise<any>, tableName: string) => {
    try {
      const res = await query;
      if (res.error) {
        console.error(`Error loading table ${tableName}:`, res.error);
        toast.error(`Database error loading ${tableName}: ${res.error.message}`);
        return { data: [], error: res.error };
      }
      return res;
    } catch (err: any) {
      console.error(`Exception loading table ${tableName}:`, err);
      toast.error(`Error loading ${tableName}: ${err.message || String(err)}`);
      return { data: [], error: err };
    }
  }, []);

  /** Fast shell: settings, colleges, permissions — no bulk payments/students. */
  const loadCoreAdmin = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;
    setCurrentUserId(session.user.id);

    if (isAwsLambdaApiUrl(resolveSupabaseUrl())) {
      try {
        const boot = await fetchAdminCoreBootstrap(session.access_token, session.user.id);
        setStaff((boot.admin_staff as any[]) || []);
        setUnis((boot.universities as any[]) || []);

        try {
          const collegeList = (boot.colleges as any[]) || [];
          const collegeAdmins = await fetchCollegeAdminDirectory(supabase, collegeList);
          setCollegeAdmins(collegeAdmins);
        } catch (err: any) {
          console.error("Exception fetching college admin assignments:", err);
          setCollegeAdmins([]);
        }

        setColleges((boot.colleges as any[]) || []);
        setCerts((boot.certificates as any[]) || []);
        setDomains((boot.internship_domains as any[]) || []);
        setClassesList((boot.classes as any[]) || []);
        setSystemSettings((boot.system_settings as any[]) || []);

        let finalPermissions = boot.admin_permissions as any;
        const staffRows = (boot.admin_staff as any[]) || [];
        if (!finalPermissions && session.user.email) {
          const staffEntry = staffRows.find((s) => s.email === session.user.email);
          if (staffEntry) finalPermissions = staffEntry.permissions;
        }
        setMyPermissions(finalPermissions);

        try {
          const rows = await fetchAdminNotifications(supabase, 100);
          setNotifications(rows);
        } catch (err: any) {
          console.error("Error loading notifications:", err);
          setNotifications([]);
        }

        setAssignments((boot.assignments as any[]) || []);
        setCyberCafes((boot.cybercafe_profiles as any[]) || []);

        try {
          const visitStats = await fetchAdminSiteVisitStats(supabase);
          setVisitorCount(visitStats.totalVisits);
          setUniqueVisitorCount(visitStats.uniqueVisitors);
        } catch (visitErr) {
          console.warn("site_visits stats:", visitErr);
        }

        adminDataLoadedRef.current.core = true;
        return true;
      } catch (err: any) {
        console.error("AWS admin bootstrap failed, falling back to parallel load:", err);
        toast.error("Slow connection — loading admin data in smaller batches…");
      }
    }

    const [u, c, ce, dm, cl, ss, ap, notifs, asgnResult, cyber, customStaff] =
      await Promise.all([
        safeQuery(supabase.from("universities").select("*").order("name"), "universities"),
        (async () => {
          try {
            const rows = await fetchAllCollegesCatalog(supabase);
            return { data: rows, error: null };
          } catch (err: any) {
            console.error("Error loading colleges:", err);
            toast.error(`Database error loading colleges: ${err?.message || String(err)}`);
            return { data: [], error: err };
          }
        })(),
        safeQuery(
          supabase
            .from("certificates")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(100),
          "certificates"
        ),
        safeQuery(supabase.from("internship_domains").select("*").order("name"), "internship_domains"),
        safeQuery(
          supabase
            .from("classes")
            .select("*")
            .order("scheduled_at", { ascending: true }),
          "classes"
        ),
        safeQuery(supabase.from("system_settings").select("*"), "system_settings"),
        safeQuery(
          supabase.from("admin_permissions").select("*").eq("user_id", session.user.id).maybeSingle(),
          "admin_permissions"
        ),
        (async () => {
          try {
            const rows = await fetchAdminNotifications(supabase, 100);
            return { data: rows, error: null };
          } catch (err: any) {
            console.error("Error loading notifications:", err);
            return { data: [], error: err };
          }
        })(),
        safeQuery(
          supabase
            .from("assignments")
            .select("*")
            .order("created_at", { ascending: false }),
          "assignments"
        ),
        safeQuery(
          supabase.from("cybercafe_profiles").select("*").order("created_at", { ascending: false }),
          "cybercafe_profiles"
        ),
        safeQuery(
          supabase.from("admin_staff").select("*").order("created_at", { ascending: false }),
          "admin_staff"
        ),
      ]);

    setStaff(customStaff.data || []);
    setUnis(u.data || []);

    try {
      const collegeList = c.data || [];
      const collegeAdmins = await fetchCollegeAdminDirectory(supabase, collegeList);
      setCollegeAdmins(collegeAdmins);
    } catch (err: any) {
      console.error("Exception fetching college admin assignments:", err);
      setCollegeAdmins([]);
    }

    setColleges(c.data || []);
    setCerts(ce.data || []);
    setDomains(dm.data || []);
    setClassesList(cl.data || []);
    setSystemSettings(ss.data || []);

    let finalPermissions = ap.data;
    if (!finalPermissions && session.user.email) {
      const staffEntry = (customStaff.data || []).find((s) => s.email === session.user.email);
      if (staffEntry) finalPermissions = staffEntry.permissions;
    }
    setMyPermissions(finalPermissions);

    setNotifications(notifs.data || []);
    setAssignments(asgnResult.data || []);
    setCyberCafes(cyber.data || []);

    try {
      const visitStats = await fetchAdminSiteVisitStats(supabase);
      setVisitorCount(visitStats.totalVisits);
      setUniqueVisitorCount(visitStats.uniqueVisitors);
    } catch (visitErr) {
      console.warn("site_visits stats:", visitErr);
    }

    adminDataLoadedRef.current.core = true;
    return true;
  }, [navigate, safeQuery]);

  /** Payment history for dashboard + transactions + lead stats. */
  const loadPaymentsData = useCallback(
    async (opts?: { force?: boolean }) => {
      if (adminDataLoadedRef.current.payments && !opts?.force) return;
      if (paymentsLoadInFlightRef.current) return paymentsLoadInFlightRef.current;

      const task = (async () => {
        setIsPaymentsLoading(true);
        try {
          let pcRows: any[] = [];
          let paymentSuccessRows: any[] = [];

          const [cancelled, success] = await Promise.all([
            fetchAllSupabaseRows(supabase, "payment_cancelled", {
              orderBy: "created_at",
              ascending: false,
            }).catch((err: any) => {
              console.error("Error fetching payment_cancelled:", err);
              const msg = String(err?.message || err);
              if (!/payment_cancelled.*does not exist|42P01/i.test(msg)) {
                toast.error("Failed to load cancelled payments: " + msg);
              }
              return [] as any[];
            }),
            fetchAllSupabaseRows(supabase, "payment_success", {
              orderBy: "created_at",
              ascending: false,
            }).catch((err: any) => {
              console.error("Error fetching payment_success:", err);
              const code = String(err?.code || "");
              if (code !== "42501") {
                toast.error("Failed to load payment history: " + (err.message || String(err)));
              }
              return [] as any[];
            }),
          ]);

          pcRows = cancelled;
          paymentSuccessRows = success;

          const allUnified = paymentSuccessRows;
          setPayments(allUnified.filter((p: any) => p.status === "success" || !p.status));
          setFailedPayments(allUnified.filter((p: any) => p.status === "failed"));
          cancelledPaymentsRef.current = pcRows;
          setCancelledPayments(pcRows);
          syncLeadsCommsFromCancelled(pcRows);
          adminDataLoadedRef.current.payments = true;
        } finally {
          setIsPaymentsLoading(false);
          paymentsLoadInFlightRef.current = null;
        }
      })();

      paymentsLoadInFlightRef.current = task;
      return task;
    },
    []
  );

  /** Registration draft leads for Leads Hub — server-paginated for AWS speed. */
  const loadRegistrationLeadsData = useCallback(
    async (opts?: { force?: boolean }) => {
      if (leadsLoadInFlightRef.current) return leadsLoadInFlightRef.current;

      const task = (async () => {
        setIsLeadsDataLoading(true);
        try {
          const { rows, total } = await fetchRegistrationLeadsPage(supabase, {
            page: leadsPage,
            pageSize: leadsPageSize,
            search: leadsSearchTerm,
            university: leadsUniFilter,
            college: leadsCollegeFilter,
          });
          setRegistrationDraftLeads(rows);
          setLeadsTotalCount(total);
          adminDataLoadedRef.current.leads = true;
        } catch (err: any) {
          console.error("Error fetching registration_leads:", err);
          toast.error("Failed to load registration leads: " + (err.message || String(err)));
        } finally {
          setIsLeadsDataLoading(false);
          leadsLoadInFlightRef.current = null;
        }
      })();

      leadsLoadInFlightRef.current = task;
      return task;
    },
    [leadsPage, leadsPageSize, leadsSearchTerm, leadsUniFilter, leadsCollegeFilter]
  );

  /** Email-only index for Leads Hub (avoids full student payload until needed). */
  const loadEnrolledEmailsOnly = useCallback(async () => {
    if (enrolledEmailsRef.current.size > 0) return;
    try {
      const rows = await fetchAllSupabaseRows<{ email?: string }>(supabase, "students", {
        select: "email",
        orderBy: "created_at",
        ascending: false,
      });
      applyEnrolledEmails(rows.map((r) => r.email));
      if (cancelledPaymentsRef.current.length > 0) {
        syncLeadsCommsFromCancelled(cancelledPaymentsRef.current);
      }
    } catch (err: any) {
      console.error("Enrolled emails fetch error:", err);
    }
  }, []);

  /** Load attendance day counts — merges into state, never wipes existing counts with empty. */
  const applyAttendanceCounts = useCallback(
    async (studentRows?: any[], priorityRows?: any[]) => {
      const rows = studentRows?.length
        ? studentRows
        : attendanceStudentRowsRef.current;
      if (!rows.length) return;

      const studentIds = rows
        .map((s) => getStudentRecordId(s))
        .filter((id) => id.length > 0);
      const priorityIds = (priorityRows ?? [])
        .map((s) => getStudentRecordId(s))
        .filter((id) => id.length > 0);
      const uniById: Record<string, string> = {};
      for (const s of rows) {
        const id = normalizeStudentId(getStudentRecordId(s));
        const uni = String(s?.university_name ?? "").trim();
        if (id && uni) uniById[id] = uni;
      }

      const loadId = ++attendanceCountsLoadRef.current;
      setIsAttendanceCountsLoading(true);

      try {
        const mergePage = (pageCounts: Record<string, number>) => {
          if (loadId !== attendanceCountsLoadRef.current) return;
          setAttendanceCounts((prev) => ({ ...prev, ...pageCounts }));
        };

        const map = await fetchAllAttendanceCountsMap(
          supabase,
          studentIds,
          mergePage,
          priorityIds,
          uniById
        );
        if (loadId !== attendanceCountsLoadRef.current) return;

        if (Object.keys(map).length > 0) {
          setAttendanceCounts((prev) => ({ ...prev, ...map }));
        }
      } catch (err: any) {
        console.error("Attendance counts fetch error:", err);
        toast.error(
          "Failed to load attendance counts: " + (err?.message || "Unknown error")
        );
      } finally {
        if (loadId === attendanceCountsLoadRef.current) {
          setIsAttendanceCountsLoading(false);
        }
      }
    },
    []
  );

  /** Re-fetch attendance counts for the current student list. */
  const refreshAttendanceCounts = useCallback(async () => {
    attendanceCountsFetchKeyRef.current = "";
    attendanceCountsLoadRef.current += 1;
    await applyAttendanceCounts();
  }, [applyAttendanceCounts]);

  const fetchAllStudentsLight = useCallback(async (opts?: { force?: boolean }) => {
    let allStudents: any[] = [];
    allStudents = await fetchAdminStudentsLight(supabase, { force: opts?.force });
    if (allStudents.length === 0) {
      const fallbackPageSize = 1000;
      const first = await fetchAdminStudentDirectoryPage(supabase, 0, fallbackPageSize, {});
      allStudents = [...first.rows];
      const totalPages = Math.ceil((first.total || 0) / fallbackPageSize);
      for (let page = 1; page < totalPages; page++) {
        const next = await fetchAdminStudentDirectoryPage(
          supabase,
          page,
          fallbackPageSize,
          {}
        );
        allStudents.push(...next.rows);
      }
    }
    return allStudents;
  }, []);

  /** Student list for Communications tab only (no attendance). */
  const loadCommsStudentsData = useCallback(
    async (opts?: { force?: boolean }) => {
      if (adminDataLoadedRef.current.commsStudents && !opts?.force) return;
      if (commsStudentsLoadInFlightRef.current) {
        return commsStudentsLoadInFlightRef.current;
      }

      const task = (async () => {
        try {
          const allStudents = await fetchAllStudentsLight({ force: opts?.force });
          const combinedComms = allStudents.map((s) => ({
            id: s.id,
            full_name: s.full_name,
            email: s.email,
            college_name: s.college_name,
            university_name: s.university_name,
            internship_domain: s.internship_domain,
            internship_mode: s.internship_mode,
            metadata: s.metadata,
          }));
          setAllStudentsComms(combinedComms);
          applyEnrolledEmails(combinedComms.map((s) => s.email));
          if (cancelledPaymentsRef.current.length > 0) {
            syncLeadsCommsFromCancelled(cancelledPaymentsRef.current);
          }
          adminDataLoadedRef.current.commsStudents = true;
        } catch (err: any) {
          console.error("Comms students fetch error:", err);
          toast.error("Failed to load students for communications: " + (err?.message || "Unknown error"));
        } finally {
          commsStudentsLoadInFlightRef.current = null;
        }
      })();

      commsStudentsLoadInFlightRef.current = task;
      return task;
    },
    [fetchAllStudentsLight]
  );

  /** Refresh certificate registry only (fast — avoids reloading all students). */
  const refreshCertificates = useCallback(async () => {
    const { data, error } = await supabase
      .from("certificates")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      console.error("Certificates refresh error:", error);
      return;
    }
    setCerts(data || []);
  }, []);

  /** Attendance + bulk cert tabs: students with attendance counts. */
  const loadAttendanceTabData = useCallback(
    async (opts?: { force?: boolean }) => {
      const hasRows = attendanceStudentRowsRef.current.length > 0;
      if (adminDataLoadedRef.current.attendance && !opts?.force && hasRows) return;

      if (attendanceLoadInFlightRef.current) {
        if (!opts?.force) return attendanceLoadInFlightRef.current;
        await attendanceLoadInFlightRef.current;
        attendanceLoadInFlightRef.current = null;
      }

      const task = (async () => {
        setIsAttendanceLoading(true);
        try {
          let allStudents: any[] = [];
          try {
            allStudents = await fetchAllStudentsLight({ force: opts?.force });
          } catch (err: any) {
            console.error("Students fetch error:", err);
            toast.error("Failed to load students: " + (err?.message || "Unknown error"));
            return;
          }

          attendanceStudentRowsRef.current = allStudents;
          setAttendanceStudentRows(allStudents);
          setIsAttendanceLoading(false);

          try {
            const attSettingsResult = await supabase
              .from("attendance_settings")
              .select("*")
              .eq("id", 1)
              .maybeSingle();
            const attendanceMinPercent = normalizeAttendanceCriteria(
              attSettingsResult.data?.min_percentage
            );
            setAttendanceCriteria(attendanceMinPercent);
            attendanceCriteriaRef.current = attendanceMinPercent;
          } catch (err: any) {
            console.error("Attendance settings fetch error:", err);
          }

          adminDataLoadedRef.current.attendance = true;
        } finally {
          setIsAttendanceLoading(false);
          attendanceLoadInFlightRef.current = null;
        }
      })();

      attendanceLoadInFlightRef.current = task;
      return task;
    },
    [fetchAllStudentsLight]
  );

  /**
   * Initial login: core shell only, then payments in background.
   * After mutations: refresh only datasets that were already loaded.
   */
  const loadAll = async () => {
    try {
      const ok = await loadCoreAdmin();
      if (!ok) return;

      const tasks: Promise<void>[] = [];
      if (adminDataLoadedRef.current.payments) {
        tasks.push(loadPaymentsData({ force: true }));
      }
      if (adminDataLoadedRef.current.leads) {
        tasks.push(loadRegistrationLeadsData({ force: true }));
      }
      if (adminDataLoadedRef.current.attendance) {
        tasks.push(loadAttendanceTabData({ force: true }));
      }
      if (adminDataLoadedRef.current.commsStudents) {
        tasks.push(loadCommsStudentsData({ force: true }));
      }
      await Promise.all(tasks);
    } catch (err: any) {
      console.error("Load Error:", err);
      toast.error("Global Load Error: " + (err?.message || String(err)));
    }
  };

  const runInitialAdminLoad = async () => {
    try {
      const ok = await loadCoreAdmin();
      if (!ok) {
        setLoading(false);
        return;
      }
      setLoading(false);
      // Payments are lazy-loaded when dashboard/payments/leads/comms tabs open (see effect below).
    } catch (err: any) {
      console.error("Initial load error:", err);
      toast.error("Failed to load admin panel: " + (err?.message || String(err)));
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!allowed) return;
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
  }, [allowed]);

  useEffect(() => {
    if (!allowed || activeTab !== "students") return;
    const delay = searchTerm.trim() ? 300 : 0;
    const timer = setTimeout(() => {
      void fetchStudents();
    }, delay);
    return () => clearTimeout(timer);
  }, [
    allowed,
    activeTab,
    studentPage,
    searchTerm,
    domainFilter,
    dateFilter,
    startDate,
    endDate,
    uniFilter,
    collegeFilter,
    modeFilter,
  ]);

  useEffect(() => {
    setLeadsPage(0);
  }, [leadsSearchTerm, leadsUniFilter, leadsCollegeFilter]);

  useEffect(() => {
    if (activeTab !== "leads") return;
    const delay = leadsSearchTerm.trim() ? 300 : 0;
    const timer = setTimeout(() => {
      void loadRegistrationLeadsData({ force: true });
    }, delay);
    return () => clearTimeout(timer);
  }, [
    activeTab,
    leadsPage,
    leadsSearchTerm,
    leadsUniFilter,
    leadsCollegeFilter,
    loadRegistrationLeadsData,
  ]);

  useEffect(() => {
    setAttendancePage(0);
  }, [attendanceSearchTerm, attendanceUniFilter, attendanceCollegeFilter, attendanceDomainFilter]);

  const attendanceScopeStudents = useMemo(
    () =>
      attendanceStudents.filter((s) => {
        if (attendanceUniFilter !== "all" && s.university_name !== attendanceUniFilter) return false;
        if (attendanceCollegeFilter !== "all" && s.college_name !== attendanceCollegeFilter) return false;
        if (attendanceDomainFilter !== "all" && s.internship_domain !== attendanceDomainFilter) return false;
        return true;
      }),
    [attendanceStudents, attendanceUniFilter, attendanceCollegeFilter, attendanceDomainFilter]
  );

  const filteredAttendanceStudents = useMemo(
    () =>
      attendanceScopeStudents.filter(
        (s) =>
          !attendanceSearchTerm ||
          s.full_name?.toLowerCase().includes(attendanceSearchTerm.toLowerCase()) ||
          s.email?.toLowerCase().includes(attendanceSearchTerm.toLowerCase())
      ),
    [attendanceScopeStudents, attendanceSearchTerm]
  );

  const enrolledEmailsForLeads = enrolledEmailsSet;

  const leadHuntRows = useMemo(
    () =>
      buildLeadHuntRows({
        registrationDraftLeads,
        failedPayments,
        cancelledPayments,
        enrolledEmails: enrolledEmailsForLeads,
        // Search / uni / college already applied server-side for drafts.
        searchTerm: "",
        uniFilter: "all",
        collegeFilter: "all",
      }),
    [
      registrationDraftLeads,
      failedPayments,
      cancelledPayments,
      enrolledEmailsForLeads,
    ]
  );

  const leadsPageCount = Math.max(1, Math.ceil(leadsTotalCount / leadsPageSize));
  const leadsSafePage = Math.min(leadsPage, leadsPageCount - 1);
  // Server already returned the current page of draft leads; payment rows append on page 0 only.
  const paginatedLeads = useMemo(() => {
    if (leadsSafePage === 0) return leadHuntRows.slice(0, leadsPageSize);
    return leadHuntRows.filter((r) => String(r.id).startsWith("reg-draft-")).slice(0, leadsPageSize);
  }, [leadHuntRows, leadsSafePage, leadsPageSize]);

  const commsBaseList = useMemo(
    () => (commRecipientType === "enrolled" ? allStudentsComms : allLeadsComms),
    [commRecipientType, allStudentsComms, allLeadsComms]
  );

  const commsFilteredList = useMemo(
    () =>
      filterCommsRecipients(commsBaseList, {
        uniFilters: commUniFilters,
        collegeFilters: commCollegeFilters,
        domainFilter: commDomainFilter,
        modeFilter: commModeFilter,
        colleges,
        unis,
        type: commRecipientType,
      }),
    [
      commsBaseList,
      commUniFilters,
      commCollegeFilters,
      commDomainFilter,
      commModeFilter,
      colleges,
      unis,
      commRecipientType,
    ]
  );

  const commsDisplayedList = useMemo(() => {
    const searched = searchCommsRecipients(commsFilteredList, commSearchTerm);
    return searched.slice(0, 500);
  }, [commsFilteredList, commSearchTerm]);

  const attendancePageCount = Math.max(
    1,
    Math.ceil(filteredAttendanceStudents.length / attendancePageSize)
  );
  const attendanceSafePage = Math.min(attendancePage, attendancePageCount - 1);
  const paginatedAttendanceStudents = useMemo(
    () =>
      filteredAttendanceStudents.slice(
        attendanceSafePage * attendancePageSize,
        (attendanceSafePage + 1) * attendancePageSize
      ),
    [filteredAttendanceStudents, attendanceSafePage, attendancePageSize]
  );

  useEffect(() => {
    if (!allowed || activeTab !== "attendance") return;
    if (attendanceStudentRows.length === 0) return;

    const fetchKey = `${attendanceStudentRows.length}:${attendanceSafePage}:${attendancePageSize}`;
    if (attendanceCountsFetchKeyRef.current === fetchKey) return;
    attendanceCountsFetchKeyRef.current = fetchKey;

    void applyAttendanceCounts(attendanceStudentRows, paginatedAttendanceStudents);
  }, [
    allowed,
    activeTab,
    attendanceStudentRows,
    attendanceSafePage,
    attendancePageSize,
    paginatedAttendanceStudents,
    applyAttendanceCounts,
  ]);

  useEffect(() => {
    let mounted = true;

    const initAdmin = async (session: { user: { id: string } } | null) => {
      if (!mounted) return;

      let active = session;
      if (!active && isAdminPortalSessionActive()) {
        const recovered = await ensureAdminAuthSession(supabase);
        if (recovered) {
          const { data: { session: retry } } = await supabase.auth.getSession();
          active = retry;
        }
      }
      if (!active) {
        const { data: { session: retry } } = await supabase.auth.getSession();
        active = retry;
      }
      if (!active) {
        if (!isAdminPortalSessionActive()) {
          navigate(ADMIN_LOGIN_PATH);
        }
        setLoading(false);
        return;
      }

      const { fetchRolesForUser, readRolesFromUser } = await import("@/lib/portalAuth");
      const fromMeta = readRolesFromUser(active.user, active.user.id);
      const rolesList = fromMeta?.length
        ? fromMeta
        : await fetchRolesForUser(supabase, active.user.id);
      if (!mounted) return;

      const ok = rolesList.includes("admin") || rolesList.includes("super_admin");
      setAllowed(ok);
      if (ok) {
        persistAdminAuthSession();
        if (!adminInitDoneRef.current) {
          adminInitDoneRef.current = true;
          await runInitialAdminLoad();
        } else {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      void initAdmin(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === "SIGNED_OUT") {
        void (async () => {
          if (isAdminIntentionalLogout()) {
            adminInitDoneRef.current = false;
            adminDataLoadedRef.current = {
              core: false,
              payments: false,
              leads: false,
              attendance: false,
              commsStudents: false,
            };
            navigate(ADMIN_LOGIN_PATH);
            return;
          }
          if (isAdminPortalSessionActive()) {
            const recovered = await recoverAdminSessionAfterSignOut(supabase);
            if (recovered) {
              const { data: { session: retry } } = await supabase.auth.getSession();
              if (retry) {
                await initAdmin(retry);
                return;
              }
            }
            clearAdminSessionExpiry();
          }
          adminInitDoneRef.current = false;
          adminDataLoadedRef.current = {
            core: false,
            payments: false,
            leads: false,
            attendance: false,
            commsStudents: false,
          };
          navigate(ADMIN_LOGIN_PATH);
        })();
        return;
      }
      if (_event === "SIGNED_IN" || _event === "INITIAL_SESSION") {
        void initAdmin(session);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  /** Lazy-load heavy datasets when their tab is first opened (cached until manual refresh). */
  useEffect(() => {
    if (!allowed) return;

    if (activeTab === "dashboard" || activeTab === "payments") {
      void loadPaymentsData();
      return;
    }
    if (activeTab === "leads") {
      void (async () => {
        await loadPaymentsData();
        if (!adminDataLoadedRef.current.commsStudents) {
          await loadEnrolledEmailsOnly();
        }
      })();
      return;
    }
    if (activeTab === "attendance" || activeTab === "bulk") {
      void (async () => {
        const needsStudents =
          !adminDataLoadedRef.current.attendance ||
          attendanceStudentRowsRef.current.length === 0;
        if (needsStudents) {
          await loadAttendanceTabData();
        }
      })();
      return;
    }
    if (activeTab === "comms") {
      void (async () => {
        await loadPaymentsData();
        await loadCommsStudentsData();
      })();
    }
  }, [
    allowed,
    activeTab,
    loadPaymentsData,
    loadRegistrationLeadsData,
    loadEnrolledEmailsOnly,
    loadAttendanceTabData,
    loadCommsStudentsData,
    refreshAttendanceCounts,
  ]);

  const toggleSelect = (id: string) => {
    setSelectedStudents(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedStudents.length === filteredStudents.length && filteredStudents.length > 0) setSelectedStudents([]);
    else setSelectedStudents(filteredStudents.map(s => s.id));
  };

  const handleBulkAttendanceIncrease = async () => {
    if (selectedAttendanceIds.length === 0) return toast.error("Select at least one student");
    if (attendanceIncreasePercent <= 0) return toast.error("Enter a valid percentage");
    
    setProcessing(true);
    try {
      const inserts: Array<{ student_id: string; marked_at: string }> = [];
      let totalRecordsAdded = 0;
      const addedByStudent: Record<string, number> = {};

      const { data: existingRows, error: fetchErr } = await supabase
        .from("attendance")
        .select("student_id, marked_at")
        .in("student_id", selectedAttendanceIds);
      if (fetchErr) throw fetchErr;

      const recordsByStudent: Record<string, Array<{ marked_at?: string | null }>> = {};
      for (const row of existingRows || []) {
        const sid = String(row.student_id);
        if (!recordsByStudent[sid]) recordsByStudent[sid] = [];
        recordsByStudent[sid].push(row);
      }

      for (const id of selectedAttendanceIds) {
        const student = attendanceStudents.find(s => s.id === id);
        if (!student) continue;

        const programmeDays = resolveInternshipProgrammeConfig(student.university_name).programmeDayCount;
        const countToAdd = Math.ceil(
          (attendanceIncreasePercent / 100) * programmeDays
        );
        if (countToAdd <= 0) continue;

        const dayKeys = nextAbsentProgrammeDayKeys(
          recordsByStudent[id] || [],
          countToAdd,
          student.university_name
        );
        for (const dayKey of dayKeys) {
          inserts.push({
            student_id: id,
            marked_at: programmeDayMarkedAtIso(dayKey),
          });
        }
        if (dayKeys.length > 0) {
          addedByStudent[id] = dayKeys.length;
          totalRecordsAdded += dayKeys.length;
          recordsByStudent[id] = [
            ...(recordsByStudent[id] || []),
            ...dayKeys.map((dayKey) => ({ marked_at: programmeDayMarkedAtIso(dayKey) })),
          ];
        }
      }

      if (inserts.length > 0) {
        const { error } = await supabase.from('attendance').insert(inserts);
        if (error) throw error;
      }

      setAttendanceCounts((prev) => {
        const next = { ...prev };
        for (const id of selectedAttendanceIds) {
          const student = attendanceStudents.find((s) => s.id === id);
          if (!student) continue;
          const key = normalizeStudentId(id);
          const add = addedByStudent[id];
          if (add) next[key] = (next[key] ?? student.total_days ?? 0) + add;
        }
        return next;
      });

      await logAdminAction('BULK_ACTION', 'attendance', `Increased attendance by ${attendanceIncreasePercent}% for ${selectedAttendanceIds.length} students (Admin)`);
      
      toast.success(`Successfully added ${totalRecordsAdded} attendance records for ${selectedAttendanceIds.length} students!`);
      setSelectedAttendanceIds([]);
      setAttendanceIncreasePercent(0);
      try {
        await refreshAttendanceCounts();
      } catch (refreshErr) {
        console.warn("[attendance] counts refresh after increase failed:", refreshErr);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to increase attendance");
    } finally {
      setProcessing(false);
    }
  };

  const handleResetAllAttendance = async () => {
    setAttendanceOpsLoading(true);
    try {
      const universityName = attendanceUniFilter === "all" ? null : attendanceUniFilter;
      const collegeName = attendanceCollegeFilter === "all" ? null : attendanceCollegeFilter;
      const deleted = await adminResetAllAttendance(supabase, {
        universityName,
        collegeName,
      });
      toast.success(`Cleared ${deleted} attendance record(s).`);
      setSelectedAttendanceIds([]);

      setAttendanceCounts((prev) => {
        const next = { ...prev };
        for (const s of attendanceStudentRowsRef.current) {
          const inScope =
            (universityName == null || s.university_name === universityName) &&
            (collegeName == null || s.college_name === collegeName);
          if (inScope) next[normalizeStudentId(s.id)] = 0;
        }
        return next;
      });
      setSelectedAttendanceStudent((prev) => {
        if (!prev?.id) return prev;
        const inScope =
          (universityName == null || prev.university_name === universityName) &&
          (collegeName == null || prev.college_name === collegeName);
        if (!inScope) return prev;
        return enrichStudentAttendance(
          prev,
          0,
          attendanceCriteriaRef.current,
          programmeAttendanceDayBasis(prev.university_name)
        );
      });

      void refreshAttendanceCounts();
      setAttendanceConfirmAction(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reset attendance";
      toast.error(msg);
    } finally {
      setAttendanceOpsLoading(false);
    }
  };

  const handleBulkMarkAttendance = async () => {
    if (!bulkMarkStartDate || !bulkMarkEndDate) {
      toast.error("Pick a start and end date.");
      return;
    }
    if (bulkMarkEndDate < bulkMarkStartDate) {
      toast.error("End date must be on or after start date.");
      return;
    }
    setAttendanceOpsLoading(true);
    try {
      const universityName = attendanceUniFilter === "all" ? null : attendanceUniFilter;
      const collegeName = attendanceCollegeFilter === "all" ? null : attendanceCollegeFilter;
      const result = await adminBulkMarkAttendance(supabase, {
        startDate: bulkMarkStartDate,
        endDate: bulkMarkEndDate,
        universityName,
        collegeName,
      });
      toast.success(
        `Marked present: ${result.records_inserted} record(s) for ${result.students_matched} student(s).`
      );
      setAttendanceConfirmAction(null);
      // Refreshing counts must never override the success above (the marks are
      // already saved); a counts RPC hiccup should not look like a mark failure.
      try {
        await refreshAttendanceCounts();
      } catch (refreshErr) {
        console.warn("[attendance] counts refresh after bulk mark failed:", refreshErr);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to mark attendance";
      toast.error(msg);
    } finally {
      setAttendanceOpsLoading(false);
    }
  };

  const attendanceBulkScopeLabel = formatAttendanceBulkScopeLabel(
    attendanceUniFilter === "all" ? null : attendanceUniFilter,
    attendanceCollegeFilter === "all" ? null : attendanceCollegeFilter,
    attendanceDomainFilter === "all" ? null : attendanceDomainFilter
  );
  const attendanceResetScoped = isAttendanceResetScoped(
    attendanceUniFilter === "all" ? null : attendanceUniFilter,
    attendanceCollegeFilter === "all" ? null : attendanceCollegeFilter,
    attendanceDomainFilter === "all" ? null : attendanceDomainFilter
  );

  const handleAddAttendanceForStudent = async (student: any) => {
    if (!student?.id || addingAttendanceStudentId) return;
    setAddingAttendanceStudentId(student.id);
    try {
      const { data: existing, error: fetchErr } = await supabase
        .from("attendance")
        .select("marked_at")
        .eq("student_id", student.id);
      if (fetchErr) throw fetchErr;

      const dayKeys = nextAbsentProgrammeDayKeys(existing || [], 1, student.university_name);
      if (dayKeys.length === 0) {
        toast.error("All programme days are already marked present for this student.");
        return;
      }

      const { error } = await supabase.from("attendance").insert({
        student_id: student.id,
        marked_at: programmeDayMarkedAtIso(dayKeys[0]),
      });
      if (error) throw error;

      const programmeMarked = countProgrammePresentDays(
        [...(existing || []), { marked_at: programmeDayMarkedAtIso(dayKeys[0]) }],
        student.university_name
      );
      const studentKey = normalizeStudentId(student.id);
      setAttendanceCounts((prev) => ({
        ...prev,
        [studentKey]: programmeMarked,
      }));
      setSelectedAttendanceStudent((prev) =>
        prev?.id === student.id
          ? enrichStudentAttendance(
              student,
              programmeMarked,
              attendanceCriteriaRef.current,
              programmeAttendanceDayBasis(student.university_name)
            )
          : prev
      );

      void logAdminAction(
        "UPDATE",
        "attendance",
        `Manually added 1 attendance entry for ${student.full_name || student.email} (Admin)`,
        { student_id: student.id }
      );
      void refreshAttendanceCounts();
      toast.success("Attendance entry added.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to add attendance entry.");
    } finally {
      setAddingAttendanceStudentId(null);
    }
  };

  const toggleAttendanceSelect = (id: string) => {
    setSelectedAttendanceIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleAttendanceSelectAll = () => {
    const visibleIds = filteredAttendanceStudents.map((s) => s.id);
      
    if (selectedAttendanceIds.length === visibleIds.length && visibleIds.length > 0) {
      setSelectedAttendanceIds([]);
    } else {
      setSelectedAttendanceIds(visibleIds);
    }
  };


  // ─── Student Block / Unblock ───────────────────────────────────────────────
  // Toggles the student's status between "Active" and "Blocked".
  // - Blocked students cannot log in to the student portal.
  // - Action is logged to admin_logs for audit trail.
  // - Both loadAll() and fetchStudents() are called so the paginated
  //   student directory refreshes immediately without a manual page reload.
  const toggleBlock = async (user: any) => {
    // Determine the new status based on current status
    const newStatus = user.status === "Blocked" ? "Active" : "Blocked";

    // Update status in the students table
    await supabase.from("students").update({ status: newStatus }).eq("id", user.id);
    
    // Log the admin action for audit purposes
    await logAdminAction(
      'UPDATE', 
      'student', 
      `${newStatus === "Blocked" ? "Blocked" : "Unblocked"} student ${user.full_name} (Admin)`,
      { student_id: user.id, status: newStatus }
    );

    // Show success toast with clear message
    toast.success(`Student ${newStatus === "Blocked" ? "blocked" : "unblocked"} successfully!`);

    // Refresh both global data and paginated student directory
    await Promise.all([loadAll(), fetchStudents()]);
  };

  const handleDelete = async (id: string, fallbackName?: string) => {
    if (!confirm("Are you sure?")) return;
    const user = students.find(s => s.id === id);
    await supabase.from("students").delete().eq("id", id);
    
    await logAdminAction(
      'DELETE', 
      'student', 
      `Deleted student ${user?.full_name || fallbackName || id} (Admin)`,
      { entity_id: id, name: user?.full_name || fallbackName }
    );

    toast.success("Deleted");
    loadAll();
  };

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
        hydrated.university_roll_number ||
        resolveBnmuUniversityRollNumber(hydrated) ||
        "",
      internship_mode: resolveInternshipModeForUniversity(
        hydrated.university_name as string | undefined,
        (hydrated.internship_mode as string | undefined) ||
          (hydrated.metadata as { internship_mode?: string } | undefined)?.internship_mode
      ),
      department: String(
        hydrated.department || hydrated.beu_course || ""
      ).trim(),
      subject: String(hydrated.subject || hydrated.beu_branch || "").trim(),
      section_type: hydrated.section_type || hydrated.beu_section_type || "",
      section_duration:
        hydrated.section_duration ||
        hydrated.beu_section_duration ||
        hydrated.internship_duration ||
        "",
      internship_duration:
        hydrated.internship_duration ||
        hydrated.section_duration ||
        hydrated.beu_section_duration ||
        "",
      internship_domain:
        hydrated.internship_domain || hydrated.beu_domain || hydrated.course || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleCafeAction = async (id: string, action: 'approved' | 'rejected') => {
    let reason = null;
    if (action === 'rejected') {
      reason = prompt("Reason for rejection:");
      if (reason === null) return;
    }
    setProcessing(true);
    try {
      await supabase.from("cybercafe_profiles").update({ status: action, rejection_reason: reason }).eq("id", id);
      toast.success(`Cyber Cafe ${action}`);
      loadAll();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleAddStaff = async () => {
    if (!staffEmail.trim()) return toast.error("Enter email");
    const { data } = await supabase.from("profiles").select("id").eq("email", staffEmail.trim()).single();
    if (!data) return toast.error("User not found");
    await supabase.from("user_roles").insert({ user_id: data.id, role: "admin" });
    
    await logAdminAction('CREATE', 'staff', `Granted admin access to ${staffEmail.trim()} (Admin)`, { user_id: data.id, email: staffEmail.trim() });
    
    toast.success("Admin added");
    setStaffEmail(""); setIsAddStaffOpen(false); loadAll();
  };

  // CRUD for Domains/Unis
  const addDomain = async () => {
    if (!newDomain.trim()) return;
    await supabase.from("internship_domains").insert({ name: newDomain.trim() });
    
    await logAdminAction('CREATE', 'domain', `Added internship domain: ${newDomain.trim()} (Admin)`);
    
    setNewDomain(""); loadAll();
  };

  const delDomain = async (id: string) => {
    if (!confirm("Delete domain?")) return;
    const domain = domains.find(d => d.id === id);
    await supabase.from("internship_domains").delete().eq("id", id);
    
    await logAdminAction('DELETE', 'domain', `Deleted internship domain: ${domain?.name || id} (Admin)`);
    
    loadAll();
  };

  const addUni = async () => {
    if (!newUni.trim()) return;
    const logo = prompt("Enter University Logo URL (optional):") || "";
    await supabase.from("universities").insert({ name: newUni.trim(), logo_url: logo });
    
    await logAdminAction('CREATE', 'university', `Added university: ${newUni.trim()} (Admin)`);
    
    setNewUni(""); loadAll();
  };

  const delUni = async (id: string) => {
    if (!confirm("Delete university?")) return;
    const uni = unis.find(u => u.id === id);
    await supabase.from("universities").delete().eq("id", id);
    
    await logAdminAction('DELETE', 'university', `Deleted university: ${uni?.name || id} (Admin)`);
    
    loadAll();
  };

  const addCollege = async () => {
    if (!newCollege.trim() || !collegeUni) return toast.error("Enter name and select university");
    await supabase.from("colleges").insert({ name: newCollege.trim(), university_id: collegeUni });
    
    const uniName = unis.find(u => u.id === collegeUni)?.name;
    await logAdminAction('CREATE', 'college', `Added college: ${newCollege.trim()} to ${uniName} (Admin)`);
    
    setNewCollege(""); loadAll();
    toast.success("College added");
  };

  const delCollege = async (id: string) => {
    if (!confirm("Delete college?")) return;
    const college = colleges.find(c => c.id === id);
    await supabase.from("colleges").delete().eq("id", id);
    
    await logAdminAction('DELETE', 'college', `Deleted college: ${college?.name || id} (Admin)`);
    
    loadAll();
  };

  const handleLogoUpload = async (file: File, uniId: string) => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${uniId}-${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(filePath);

      await supabase.from("universities").update({ logo_url: publicUrl }).eq("id", uniId);
      toast.success("Logo uploaded!");
      loadAll();
    } catch (err: any) {
      toast.error("Upload failed: " + err.message);
    }
  };

  const editUni = async (u: any) => {
    const newName = prompt("Enter new name:", u.name);
    if (newName !== null) {
      await supabase.from("universities").update({ name: newName }).eq("id", u.id);
      loadAll();
    }
  };

  const exportToCSV = async () => {
    const toastId = toast.loading("Preparing export…");
    try {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "super_admin");
      const superAdminIds = (roles || []).map((r) => r.user_id);

      const count = await exportAdminStudentsCsv(
        supabase,
        {
          searchTerm,
          domainFilter,
          uniFilter,
          collegeFilter,
          modeFilter,
          startDate,
          endDate,
          dateFilter,
        },
        { excludeUserIds: superAdminIds }
      );

      toast.success(`Exported ${count} student(s) (same filters as the directory).`, { id: toastId });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Export failed";
      toast.error(message, { id: toastId });
    }
  };

  // Filtering Logic
  const filteredStudents = students;

  // Class Logic
  const addClass = async () => {
    if (!newClassTitle || !newClassUrl || !newClassSchedule) return toast.error("Please fill all required fields");
    try {
      await supabase.from("classes").insert({
        title: newClassTitle,
        link_type: newClassType,
        url: newClassUrl,
        scheduled_at: new Date(newClassSchedule).toISOString(),
        domain_id: newClassDomain === "all" ? null : newClassDomain
      });

      await logAdminAction('CREATE', 'class', `Scheduled class: ${newClassTitle} (Admin)`, { title: newClassTitle, schedule: newClassSchedule });

      toast.success("Class Scheduled!");
      setNewClassTitle(""); setNewClassUrl(""); setNewClassSchedule("");
      loadAll();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const delClass = async (id: string) => {
    if (!confirm("Delete this scheduled class?")) return;
    const cl = classesList.find(c => c.id === id);
    await supabase.from("classes").delete().eq("id", id);
    
    await logAdminAction('DELETE', 'class', `Deleted scheduled class: ${cl?.title || id} (Admin)`);
    
    toast.success("Class deleted");
    loadAll();
  };

  const toggleClassActive = async (cl: any) => {
    const newStatus = !cl.is_active;
    await supabase.from("classes").update({ is_active: newStatus }).eq("id", cl.id);
    
    await logAdminAction('UPDATE', 'class', `${newStatus ? "Enabled" : "Disabled"} class: ${cl.title} (Admin)`, { class_id: cl.id, active: newStatus });
    
    toast.success(newStatus ? "Class enabled — students can now see it" : "Class disabled — hidden from students");
    loadAll();
  };

  const isServiceEnabled = (key: string) => {
    const s = systemSettings.find((x) => x.key === key);
    if (s && !s.is_enabled) return false;

    // Match previous admin behavior: only hide when a permission is explicitly false.
    // Missing keys stay allowed so full admins (sparse admin_permissions rows) keep the sidebar.
    if (myPermissions) {
      const denied = (perm: string) => myPermissions[perm] === false;
      if (key === "students" && denied("can_manage_students")) return false;
      if (key === "add-registration" && denied("can_manage_students")) return false;
      if (key === "classes" && denied("can_manage_classes")) return false;
      if (key === "uploads" && denied("can_manage_uploads") && denied("can_manage_classes")) return false;
      if (key === "bulk" && denied("can_manage_certificates")) return false;
      if (key === "id-cards" && denied("can_manage_id_cards") && denied("can_manage_certificates")) return false;
      if (key === "payments" && denied("can_view_payments")) return false;
      if (key === "leads" && denied("can_manage_leads")) return false;
      if (key === "notifications" && denied("can_manage_notifications")) return false;
      if (key === "assignments" && denied("can_manage_assignments")) return false;
      if (key === "comms" && denied("can_manage_communications")) return false;
      if (key === "engineering-directory" && denied("can_manage_engineering")) return false;
      if (key === "non-engineering-management" && denied("can_manage_non_engineering")) return false;
      // Attendance stays visible in AdminShell; do not hide via false permission defaults.
      if (key === "fees-management" && denied("can_manage_fees")) return false;
      if (key === "course-management" && denied("can_manage_courses")) return false;
      if (key === "cybercafe" && denied("can_manage_cybercafe")) return false;
      if (key === "referrals" && denied("can_manage_referrals")) return false;
      if (key === "college-rosters" && denied("can_manage_college_rosters")) return false;
      if (key === "settings" && denied("can_manage_settings") && denied("can_manage_institutions")) {
        return true; // keep settings reachable for other admin tasks
      }
    }
    return true;
  };

  const runOfferLetterPdfFromStudent = (data: any) => {
    setOfferStudent(normalizeOfferLetterProfile(data));
    setTimeout(async () => {
      if (!offerLetterRef.current) {
        toast.error("Generation failed - element not found");
        setProcessing(false);
        return;
      }

      try {
        await downloadOfferLetterPdf(offerLetterRef.current, {
          fileName: `ApnaIntern_Offer_Letter_${data.full_name?.replace(/\s+/g, "_") || "Student"}.pdf`,
          captureInPlace: false,
        });
        toast.success("Offer letter downloaded successfully!");
      } catch (pdfErr) {
        console.error(pdfErr);
        toast.error("Failed to generate PDF");
      } finally {
        setProcessing(false);
      }
    }, 800);
  };

  const openStudentViewDialog = async (student: StudentDirectoryStudent | Record<string, unknown>) => {
    let row: Record<string, unknown> = student as Record<string, unknown>;
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
      metadata: meta,
    });
    setIsViewDialogOpen(true);
  };

  const studentDirectoryActions = {
    onViewDetails: (student: StudentDirectoryStudent) => {
      void openStudentViewDialog(student);
    },
    onEditDetails: (student: StudentDirectoryStudent) => {
      void openStudentEditDialog(student, "directory");
    },
    onResetPassword: (student: StudentDirectoryStudent) => {
      setResetPassUser(student);
      setIsResetPassOpen(true);
    },
    onResendCredentials: handleResendCredentials,
    onViewConsentLetter: (student: StudentDirectoryStudent) => {
      const url = getStudentConsentLetterUrl(student);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else toast.error("No consent letter on file for this student.");
    },
    onUploadConsentLetter: (student: StudentDirectoryStudent) => {
      consentUploadStudentRef.current = student;
      if (consentUploadInputRef.current) {
        consentUploadInputRef.current.value = "";
        consentUploadInputRef.current.click();
      }
    },
    onViewLogbook: (student: StudentDirectoryStudent) => {
      setLogbookStudent(student);
      setIsLogbookOpen(true);
    },
    onDownloadAttendanceReport: (student: StudentDirectoryStudent) => {
      void (async () => {
        try {
          toast.message("Generating attendance report…");
          await downloadStudentAttendanceReportPdf(supabase, student as Record<string, unknown>);
          toast.success("Attendance report downloaded.");
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Could not generate attendance report.");
        }
      })();
    },
    onDownloadOfferLetter: (student: StudentDirectoryStudent) => {
      setProcessing(true);
      runOfferLetterPdfFromStudent(student);
    },
    onToggleBlock: toggleBlock,
    onDelete: (student: StudentDirectoryStudent) => handleDelete(student.id, student.full_name || undefined),
  };

  const engineeringDirectoryActions = {
    ...studentDirectoryActions,
    onEditDetails: (student: StudentDirectoryStudent) => {
      void openStudentEditDialog(student, "engineering");
    },
  };

  const handleDirectoryConsentUpload = async (file: File | null | undefined) => {
    const student = consentUploadStudentRef.current;
    consentUploadStudentRef.current = null;
    if (!file || !student?.id) return;
    try {
      toast.message(`Uploading consent letter for ${student.full_name || "student"}…`);
      await saveAdminStudentConsentLetter(supabase, student, file);
      toast.success("Consent letter uploaded for this student.");
      await fetchStudents();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not upload consent letter.");
    } finally {
      if (consentUploadInputRef.current) consentUploadInputRef.current.value = "";
    }
  };

  const handleDownloadOfferLetter = async () => {
    if (!offerEmail.trim()) return toast.error("Please enter student email");

    setProcessing(true);
    try {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .eq("email", offerEmail.trim())
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        setProcessing(false);
        return toast.error("Student not found with this email");
      }

      runOfferLetterPdfFromStudent(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch student");
      setProcessing(false);
    }
  };

  const handleCreateSubUser = async () => {
    if (!newSubUserEmail || !newSubUserPassword || !newSubUserRoleTag) {
      return toast.error("Please fill all required fields");
    }
    setProcessing(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Session expired. Please login again.");

      await createSubUserWithoutServiceRole(supabase, {
        email: newSubUserEmail,
        password: newSubUserPassword,
        roleTag: newSubUserRoleTag,
        role: newSubUserRole,
        permissions: staffPermissionsPayload(newSubUserPermissions),
      });

      toast.success(`Staff member ${newSubUserRoleTag} created successfully!`);
      
      setNewSubUserEmail("");
      setNewSubUserPassword("");
      setNewSubUserRoleTag("");
      setNewSubUserPermissions(emptyStaffPermissions());
      loadAll();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to add staff member");
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateCollegeAdmin = async () => {
    if (!newCollegeAdminEmail?.trim() || !newCollegeAdminName?.trim()) {
      return toast.error("Please enter email and display name");
    }
    if (newCollegeAdminCollegeIds.length < 1) {
      return toast.error("Add at least one college: open the list, tick colleges, then press Add");
    }
    const collegeAdminCode = newCollegeAdminCode.trim();
    if (collegeAdminCode.length < 6) {
      return toast.error("Generate or enter a College Admin ID (at least 6 characters) before creating.");
    }
    setProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Session expired. Please login again.");

      const { updatedExisting } = await createCollegeAdminWithoutServiceRole(supabase, {
        email: newCollegeAdminEmail.trim(),
        collegeAdminCode,
        fullName: newCollegeAdminName.trim(),
        collegeIds: newCollegeAdminCollegeIds,
      });

      const loginUrl = buildCollegeLoginLink();
      const toEmail = newCollegeAdminEmail.trim().toLowerCase();
      const displayName = newCollegeAdminName.trim();
      // Same mail path as ReferralsPanel (`bulk_custom_mail`) so hosts that strip custom actions still deliver.
      const message = `Hello ${displayName},

Your Apna Intern college portal access is ready.

Sign-in URL:
${loginUrl}

Email (sign-in): ${toEmail}
College Admin ID (enter this on the sign-in page with your email): ${collegeAdminCode}

Please keep your College Admin ID private. If you need help, contact your institution administrator.

Thank you,
Apna Intern Team`;

      const emailRes = await fetch(getSendMailApiUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: toEmail,
          action: "bulk_custom_mail",
          subject: "Apna Intern — College portal access",
          message,
        }),
      });
      await assertSendMailOk(emailRes);

      toast.success(
        updatedExisting
          ? "This email was already a college admin — colleges and details were updated. Login email was sent again."
          : "College administrator created. Login details were emailed to the recipient."
      );
      setNewCollegeAdminEmail("");
      setNewCollegeAdminName("");
      setNewCollegeAdminUniId("");
      setNewCollegeAdminCollegeIds([]);
      setNewCollegeAdminCode("");
      loadAll();
    } catch (err: any) {
      console.error(err);
      const msg = String(err?.message || "");
      toast.error(msg || "Failed to create college administrator");
    } finally {
      setProcessing(false);
    }
  };

  const openEditCollegeAdmin = (row: any) => {
    const firstCollege = colleges.find((c) => c.id === row.college_ids?.[0]);
    setEditingCollegeAdmin(row);
    setEditCollegeAdminName(row.profile_name || "");
    setEditCollegeAdminEmail(row.profile_email || "");
    setEditCollegeAdminUniId(firstCollege?.university_id || "");
    setEditCollegeAdminCollegeIds([...(row.college_ids || [])]);
    setEditCollegeAdminCode("");
    setIsEditCollegeAdminOpen(true);
  };

  const handleUpdateCollegeAdmin = async () => {
    if (!editingCollegeAdmin?.user_id) return;
    if (!editCollegeAdminEmail?.trim() || !editCollegeAdminName?.trim()) {
      return toast.error("Please enter email and display name");
    }
    if (editCollegeAdminCollegeIds.length < 1) {
      return toast.error("Add at least one college: open the list, tick colleges, then press Add");
    }
    const emailNorm = editCollegeAdminEmail.trim().toLowerCase();
    setProcessing(true);
    try {
      const { data: clash } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", emailNorm)
        .neq("id", editingCollegeAdmin.user_id)
        .maybeSingle();
      if (clash?.id) {
        return toast.error(
          "This email is already used by another account. Enter a different email or edit that user from the table."
        );
      }

      await updateCollegeAdminAssignments(supabase, {
        userId: editingCollegeAdmin.user_id,
        email: editCollegeAdminEmail.trim(),
        fullName: editCollegeAdminName.trim(),
        collegeIds: editCollegeAdminCollegeIds,
        collegeAdminCode: editCollegeAdminCode.trim() || undefined,
      });
      toast.success("College administrator updated.");
      setIsEditCollegeAdminOpen(false);
      setEditingCollegeAdmin(null);
      loadAll();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to update college administrator");
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteStaff = async (staffId: string) => {
    if (!confirm("Remove this admin's access?")) return;
    try {
      await supabase.from("admin_staff").delete().eq("id", staffId);
      await supabase.rpc('remove_staff_access', { target_id: staffId });
      toast.success("Staff member removed.");
      loadAll();
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to remove staff.");
    }
  };

  const handleDeleteCollegeAdmin = async (userId: string) => {
    if (!confirm("Are you sure you want to delete?")) return;
    try {
      const { error } = await supabase.rpc("delete_college_admin", { target_user_id: userId });
      if (error) {
        const msg = error.message || "";
        if (/delete_college_admin|does not exist|42883/i.test(msg)) {
          throw new Error(
            "Database function delete_college_admin is missing. Apply supabase/migrations/20260514150000_delete_college_admin_rpc.sql in the SQL Editor."
          );
        }
        throw error;
      }
      toast.success("College administrator access removed.");
      loadAll();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to remove college administrator.");
    }
  };

  const executeTransferLead = async (lead: any, password: string) => {
    const leadEmail = lead.email || lead.user_email;
    setProcessing(true);
    try {
      const { userId } = await transferLeadToStudentDirectory({
        directoryClient: supabase,
        lead,
        password,
        paymentIdPrefix: "ADMIN_TRANS_",
      });

      if (lead.registration_draft && lead.draft_id) {
        await supabase.from("registration_leads").delete().eq("id", lead.draft_id);
        setRegistrationDraftLeads((prev) => prev.filter((r) => r.id !== lead.draft_id));
      } else if (lead.user_email) {
        await supabase.from("payment_cancelled").delete().eq("id", lead.id);
        setCancelledPayments((prev) => prev.filter((p) => p.id !== lead.id));
      } else {
        await supabase.from("payment_success").delete().eq("id", lead.id);
        setFailedPayments((prev) => prev.filter((p) => p.id !== lead.id));
      }

      toast.success("Lead successfully transferred to registered students!");

      await logAdminAction(
        "TRANSFER",
        "lead",
        `Transferred lead ${leadEmail} to registered students (Admin)`,
        { lead_id: lead.id, student_id: userId }
      );

      loadAll();
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

  // Payment Filtering Logic
  const filteredPayments = payments.filter(pay => {
    // Date filter
    if (payStartDate) {
      const payDate = new Date(pay.created_at);
      const start = new Date(payStartDate);
      start.setHours(0, 0, 0, 0);
      if (payDate < start) return false;
    }
    if (payEndDate) {
      const payDate = new Date(pay.created_at);
      const end = new Date(payEndDate);
      end.setHours(23, 59, 59, 999);
      if (payDate > end) return false;
    }
    
    // Search filter
    if (paySearchTerm) {
      const s = paySearchTerm.toLowerCase();
      const student = students.find(
        (st) => st.email?.toLowerCase() === pay.email?.toLowerCase()
      );
      if (
        !pay.full_name?.toLowerCase().includes(s) &&
        !pay.email?.toLowerCase().includes(s) &&
        !pay.payment_id?.toLowerCase().includes(s) &&
        !pay.college_name?.toLowerCase().includes(s) &&
        !student?.contact_number?.toLowerCase().includes(s)
      ) {
        return false;
      }
    }

    // College filter — prefer payment row, then loaded directory page
    if (payCollegeFilter !== "all") {
      const college =
        pay.college_name ||
        students.find((s) => s.email?.toLowerCase() === pay.email?.toLowerCase())?.college_name;
      if (college !== payCollegeFilter) return false;
    }
    
    return true;
  });

  const payPageCount = Math.max(1, Math.ceil(filteredPayments.length / payPageSize));
  const paySafePage = Math.min(payPage, payPageCount - 1);
  const paginatedPayments = useMemo(
    () =>
      filteredPayments.slice(
        paySafePage * payPageSize,
        (paySafePage + 1) * payPageSize
      ),
    [filteredPayments, paySafePage, payPageSize]
  );

  useEffect(() => {
    setPayPage(0);
  }, [payStartDate, payEndDate, payCollegeFilter, paySearchTerm]);

  const handleUpdateAdminPassword = async () => {
    setProcessing(true);
    try {
      await setLoginPasswordViaRpc(supabase, newPassword);
      toast.success("Admin password updated successfully!");
      setNewPassword("");
      await logAdminAction("UPDATE", "admin", "Changed dashboard password (Admin Self-Service)");
    } catch (err: unknown) {
      toast.error(userFacingPasswordError(err));
    } finally {
      setProcessing(false);
    }
  };

  const handleAdminLogout = async () => {
    await adminIntentionalSignOut(supabase);
    navigate(ADMIN_LOGIN_PATH);
  };

  const dashboardToolbar =
    activeTab === "dashboard" ? (
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          value={dashStartDate}
          onChange={(e) => setDashStartDate(e.target.value)}
          className="h-8 w-[8.5rem] rounded-lg border-slate-200 text-[11px] font-bold"
        />
        <Input
          type="date"
          value={dashEndDate}
          onChange={(e) => setDashEndDate(e.target.value)}
          className="h-8 w-[8.5rem] rounded-lg border-slate-200 text-[11px] font-bold"
        />
        <Button
          variant="outline"
          size="sm"
          className="gap-2 rounded-xl border-emerald-200 bg-emerald-50 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
          onClick={exportToCSV}
        >
          <Download className="size-3.5" /> Export
        </Button>
      </div>
    ) : null;

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="size-8 animate-spin text-primary" /></div>;
  if (!allowed) return <div className="p-10 text-center">Access Denied</div>;

  return (
    <>
    <input
      ref={consentUploadInputRef}
      type="file"
      accept="application/pdf,image/png,image/jpeg,image/jpg,image/webp,image/gif,.pdf,.png,.jpg,.jpeg,.webp,.gif"
      className="hidden"
      onChange={(e) => void handleDirectoryConsentUpload(e.target.files?.[0])}
    />
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        setActiveTab(value);
        setMobileNavOpen(false);
      }}
      className="flex min-h-screen bg-slate-50"
    >
      {showSidebar && (
        <AdminSidebar
          isServiceEnabled={isServiceEnabled}
          onNavigateEngineering={() => navigate("/admin/engineering-management")}
          onNavigateNonEngineering={() => navigate("/admin/non-engineering-management")}
          onCollapse={() => setShowSidebar(false)}
          onLogout={() => void handleAdminLogout()}
        />
      )}

      <AdminMobileNav
        open={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
        isServiceEnabled={isServiceEnabled}
        onNavigateEngineering={() => navigate("/admin/engineering-management")}
        onNavigateNonEngineering={() => navigate("/admin/non-engineering-management")}
        onLogout={() => void handleAdminLogout()}
      />

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <AdminTopBar
          activeTab={activeTab}
          showSidebar={showSidebar}
          onOpenMenu={() => setMobileNavOpen(true)}
          onShowSidebar={() => setShowSidebar(true)}
          visitorCount={visitorCount}
          uniqueVisitorCount={uniqueVisitorCount}
          toolbar={dashboardToolbar}
        />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[1400px] rounded-[1.75rem] border border-white bg-white/70 p-5 shadow-xl backdrop-blur-3xl md:p-8">
              <TabsContent value="dashboard" className="animate-fade-in space-y-8 mt-0">
              {/* Visual Analytics Hub */}
              <div className="grid lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 p-6 border-none shadow-soft bg-white group overflow-hidden relative">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <TrendingUp className="size-32 text-primary -mr-8 -mt-8" />
                  </div>
                  <div className="flex items-center justify-between mb-8 relative z-10">
                    <div>
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        <DollarSign className="size-5 text-emerald-600" /> 
                        Revenue Statistics
                        {isPaymentsLoading && payments.length === 0 && (
                          <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        )}
                      </h2>
                      <div className="flex gap-4 mt-2">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase">Start Date</span>
                          <Input type="date" value={dashStartDate} onChange={e => setDashStartDate(e.target.value)} className="h-7 w-28 text-[10px] border-none bg-slate-50 font-bold" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase">End Date</span>
                          <Input type="date" value={dashEndDate} onChange={e => setDashEndDate(e.target.value)} className="h-7 w-28 text-[10px] border-none bg-slate-50 font-bold" />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mb-1">Students</div>
                        <div className="text-xl font-black text-blue-600">{stats.todayEnrolledCount}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mb-1">Leads</div>
                        <div className="text-xl font-black text-orange-500">{stats.todayLeadsCount}</div>
                      </div>
                      <div className="text-right pl-4 border-l border-slate-100">
                        <div className="text-2xl font-black text-emerald-600">₹{stats.todayRevenue.toLocaleString()}</div>
                        <div className="text-[10px] text-muted-foreground mb-1 font-bold">Today's Revenue</div>
                        <Badge variant="outline" className={`${stats.growth >= 0 ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-red-50 text-red-600 border-red-100"} text-[8px] font-black`}>
                          {stats.growth >= 0 ? "+" : ""}{stats.growth.toFixed(1)}% vs Yesterday
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={getFilteredRevenueData()}>
                        <defs>
                          <linearGradient id="adminRev" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                        <YAxis hide />
                        <Tooltip 
                          contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                        />
                        <Area type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={3} fill="url(#adminRev)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card className="p-6 border-none shadow-soft bg-slate-900 text-white relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4">
                    <div className="flex items-center gap-1.5 bg-primary/20 px-2 py-1 rounded-full border border-primary/30">
                      <div className="size-1 bg-primary rounded-full animate-pulse" />
                      <span className="text-[7px] font-black text-primary tracking-widest">{monitoringStatus}</span>
                    </div>
                  </div>
                  <div className="relative z-10">
                    <div className="size-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary mb-6 shadow-glow">
                      <Activity className="size-6" />
                    </div>
                    <h3 className="text-lg font-bold mb-1">Infrastructure</h3>
                    <p className="text-xs text-slate-400 font-medium mb-4">Traffic: {liveTraffic} pkts/s</p>
                    
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">API Speed</span>
                        <span className="text-lg font-bold text-emerald-400">Stable</span>
                      </div>
                      <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 w-[92%] rounded-full shadow-glow" />
                      </div>
                    </div>
                  </div>
                  <div className="h-[100px] w-full mt-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={livePulse}>
                        <defs>
                          <linearGradient id="pulseGradientAdmin" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <Area 
                          type="monotone" 
                          dataKey="value" 
                          stroke="#3b82f6" 
                          strokeWidth={2} 
                          fill="url(#pulseGradientAdmin)" 
                          isAnimationActive={true}
                          animationDuration={800}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Card className="p-6 border-none shadow-soft bg-white border-l-4 border-l-primary">
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Enrolled Students</div>
                  <div className="text-3xl font-black">{studentTotalCount}</div>
                  <p className="text-[10px] text-muted-foreground mt-2">Active internship period</p>
                </Card>
                <Card className="p-6 border-none shadow-soft bg-white border-l-4 border-l-orange-500">
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Abandoned Carts</div>
                  <div className="text-3xl font-black text-orange-600">{cancelledPayments.length}</div>
                  <p className="text-[10px] text-muted-foreground mt-2">Requires follow-up</p>
                </Card>
                <Card className="p-6 border-none shadow-soft bg-white border-l-4 border-l-blue-500">
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Today's Revenue</div>
                  <div className="text-3xl font-black text-blue-600">₹{stats.todayRevenue.toLocaleString()}</div>
                  <Badge variant="hero" className="mt-2 text-[8px] bg-blue-50 text-blue-700 border-blue-100">
                    {stats.growth >= 0 ? "+" : ""}{stats.growth.toFixed(1)}% vs Yesterday
                  </Badge>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="id-cards">
              <IdCardManagementPanel />
            </TabsContent>

            <TabsContent value="assignments">
              <AssignmentManagementPanel
                assignments={assignments}
                unis={unis}
                colleges={colleges}
                domains={domains}
                currentUserId={currentUserId}
                onRefresh={loadAll}
                onOpenAiBuilder={() => setIsAIBuilderOpen(true)}
                isActive={activeTab === "assignments"}
              />
            </TabsContent>

            <TabsContent value="notifications">
              <NotificationManagementPanel
                notifications={notifications}
                unis={unis}
                colleges={colleges}
                domains={domains}
                studentsForTargeting={allStudentsComms}
                currentUserId={currentUserId}
                onRefresh={loadAll}
                isActive={activeTab === "notifications"}
              />
            </TabsContent>

            <TabsContent value="students">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold flex items-center gap-2"><Users className="size-5 text-primary" /> Students Directory <span className="text-sm font-semibold text-muted-foreground">(Non-Technical)</span></h3>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="gap-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                    onClick={exportToCSV}
                  >
                    <Download className="size-4" /> Export CSV
                  </Button>
                  <Button
                    className="gap-2"
                    onClick={() => {
                      setAddStudentFormKey((k) => k + 1);
                      setIsAddStudentOpen(true);
                    }}
                  >
                    <UserPlus className="size-4" /> Add Student
                  </Button>
                </div>
              </div>
              <Card className="p-6 border-none shadow-elegant mb-6 bg-card/50 backdrop-blur-sm">
                <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Name or email..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setStudentPage(0); }} />
                  </div>
                  
                  <Select value={domainFilter} onValueChange={(v) => { setDomainFilter(v); setStudentPage(0); }}>
                    <SelectTrigger className="gap-2"><Briefcase className="size-4" /><SelectValue placeholder="All Domains" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All Domains</SelectItem>{directoryDomainOptions.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}</SelectContent>
                  </Select>

                  <Select
                    value={uniFilter}
                    onValueChange={(v) => {
                      setUniFilter(v);
                      setCollegeFilter("all");
                      setStudentPage(0);
                    }}
                  >
                    <SelectTrigger className="gap-2"><Building2 className="size-4" /><SelectValue placeholder="All Universities" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All Universities</SelectItem>{directoryUnis.map(u => <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>)}</SelectContent>
                  </Select>

                  <Select value={collegeFilter} onValueChange={(v) => { setCollegeFilter(v); setStudentPage(0); }}>
                    <SelectTrigger className="gap-2"><GraduationCap className="size-4" /><SelectValue placeholder="All Colleges" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="all">
                        All Colleges
                        {uniFilter !== "all" ? ` (${directoryCollegeOptions.length})` : ""}
                      </SelectItem>
                      {directoryCollegeOptions.map((c) => (
                        <SelectItem key={c.id} value={c.name}>
                          {displayCollegeName(c.name)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Start Date</Label>
                    <div className="relative"><Calendar className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input type="date" className="pl-9" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">End Date</Label>
                    <div className="relative"><Calendar className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input type="date" className="pl-9" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Mode</Label>
                    <InternshipModeFilterSelect
                      value={modeFilter}
                      onValueChange={(v) => {
                        setModeFilter(v);
                        setStudentPage(0);
                      }}
                    />
                  </div>
                  <Button variant="outline" className="gap-2" onClick={() => { 
                    setSearchTerm(""); setDateFilter(""); setDomainFilter("all"); 
                    setUniFilter("all"); setCollegeFilter("all"); setModeFilter("all"); setStartDate(""); setEndDate(""); 
                  }}><Filter className="size-4" /> Reset Filters</Button>
                </div>
              </Card>

              <Card className="overflow-hidden border-none shadow-elegant">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="w-10"><Checkbox checked={selectedStudents.length === filteredStudents.length && filteredStudents.length > 0} onCheckedChange={toggleSelectAll} /></TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Domain</TableHead>
                      <TableHead>Institution</TableHead>
                      <TableHead>Joined Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isStudentsLoading ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-20"><Loader2 className="size-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                    ) : (
                      <>
                        {filteredStudents.map(s => (
                          <TableRow key={s.id} className="group hover:bg-muted/20">
                            <TableCell><Checkbox checked={selectedStudents.includes(s.id)} onCheckedChange={() => toggleSelect(s.id)} /></TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-xs">{s.full_name?.charAt(0)}</div>
                                <div><div className="font-bold text-sm flex items-center gap-2 flex-wrap">{s.full_name}<BulkUploadStudentBadge metadata={s.metadata} showAddRegistration /></div><div className="text-[10px] text-muted-foreground">{s.email}</div></div>
                              </div>
                            </TableCell>
                            <TableCell><Badge variant="secondary" className="text-[9px] uppercase">{s.internship_domain || "Unassigned"}</Badge></TableCell>
                            <TableCell><div className="text-xs font-medium">{s.college_name || "—"}</div></TableCell>
                            <TableCell className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</TableCell>
                            <TableCell className="text-right">
                              <StudentDirectoryActionsMenu
                                student={s}
                                {...studentDirectoryActions}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                        {filteredStudents.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-20 text-muted-foreground font-medium italic">No interns found matching your filters.</TableCell></TableRow>}
                      </>
                    )}
                  </TableBody>
                </Table>

                {/* Pagination Controls */}
                <div className="p-4 bg-muted/10 border-t flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="text-xs text-muted-foreground font-medium">
                    Showing {studentTotalCount === 0 ? 0 : studentPage * pageSize + 1} to {Math.min(studentTotalCount, (studentPage + 1) * pageSize)} of {studentTotalCount} students
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      disabled={studentPage === 0 || isStudentsLoading}
                      onClick={() => setStudentPage(p => p - 1)}
                    >
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.ceil(studentTotalCount / pageSize) }, (_, i) => i)
                        .filter(pageNum => {
                          const totalPages = Math.ceil(studentTotalCount / pageSize);
                          if (totalPages <= 7) return true;
                          return Math.abs(pageNum - studentPage) <= 2 || pageNum === 0 || pageNum === totalPages - 1;
                        })
                        .map((pageNum, i, arr) => (
                          <div key={pageNum} className="flex items-center gap-1">
                            {i > 0 && pageNum - arr[i-1] > 1 && <span className="text-muted-foreground px-1 text-xs">...</span>}
                            <Button
                              variant={studentPage === pageNum ? "default" : "outline"}
                              size="sm"
                              className="size-8 p-0"
                              onClick={() => setStudentPage(pageNum)}
                              disabled={isStudentsLoading}
                            >
                              {pageNum + 1}
                            </Button>
                          </div>
                        ))
                      }
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      disabled={(studentPage + 1) * pageSize >= studentTotalCount || isStudentsLoading}
                      onClick={() => setStudentPage(p => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="engineering-directory">
              <EngineeringDirectoryPanel
                isActive={activeTab === "engineering-directory"}
                domains={
                  engCatalog.domains.length
                    ? engCatalog.domains.map((name) => ({ id: `eng-${name}`, name }))
                    : domains
                }
                unis={unis}
                colleges={colleges}
                actions={engineeringDirectoryActions}
              />
            </TabsContent>

            <TabsContent value="bulk">
              {activeTab === "bulk" && (
                <CertificateManagementPanel
                  students={attendanceStudents}
                  certificates={certs}
                  domains={domains}
                  unis={unis}
                  colleges={colleges}
                  onRefreshCertificates={refreshCertificates}
                  onLogAction={logAdminAction}
                  isActive={activeTab === "bulk"}
                  studentsLoading={isAttendanceLoading && attendanceStudentRows.length === 0}
                  onRequestStudents={() => loadAttendanceTabData({ force: true })}
                />
              )}
            </TabsContent>

            <TabsContent value="uploads">
              <LearningMaterialsPanel
                unis={unis}
                colleges={colleges}
                domains={domains}
                currentUserId={currentUserId}
                isActive={activeTab === "uploads"}
                studentsForTargeting={allStudentsComms}
              />
            </TabsContent>

            <TabsContent value="classes">
              <div className="mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  📡 Live Classes Management
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Create, schedule, and manage live class sessions for students. Target by university, college, or domain.
                </p>
              </div>
              <ClassLinkManagementPanel
                classesList={classesList}
                domains={domains}
                unis={unis}
                colleges={colleges}
                studentsForTargeting={allStudentsComms}
                currentUserId={currentUserId}
                onRefresh={loadAll}
                onLogAction={logAdminAction}
              />
            </TabsContent>
            <TabsContent value="payments">
              <div className="space-y-6">
                <Card className="p-6 border-none shadow-elegant">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <h3 className="text-xl font-bold flex items-center gap-2 text-green-600"><CheckCircle2 className="size-5" /> Successful Transactions</h3>
                      <Button variant="ghost" size="sm" onClick={loadAll} className="size-8 p-0"><Loader2 className={`size-4 ${loading ? 'animate-spin' : ''}`} /></Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="hero" className="bg-green-100 text-green-700 hover:bg-green-200 border-none px-4 py-1.5 font-bold">
                        Count: {filteredPayments.length}
                      </Badge>
                    </div>
                  </div>
 
                  {/* Payment Filters */}
                  <Card className="p-4 border-none shadow-sm bg-muted/20 mb-6">
                    <div className="grid md:grid-cols-4 gap-4 items-end">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Start Date</Label>
                        <Input type="date" className="h-9" value={payStartDate} onChange={e => setPayStartDate(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">End Date</Label>
                        <Input type="date" className="h-9" value={payEndDate} onChange={e => setPayEndDate(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Filter by College</Label>
                        <Select value={payCollegeFilter} onValueChange={setPayCollegeFilter}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="All Colleges" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Colleges</SelectItem>
                            {Array.from(new Set(students.map(s => s.college_name).filter(Boolean))).map(college => (
                              <SelectItem key={college} value={college}>{college}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Search Details</Label>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                          <Input 
                            placeholder="Email, Phone, ID..." 
                            className="h-9 pl-9 text-xs" 
                            value={paySearchTerm} 
                            onChange={e => setPaySearchTerm(e.target.value)} 
                          />
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => { setPayStartDate(""); setPayEndDate(""); setPayCollegeFilter("all"); setPaySearchTerm(""); }}>
                        <Filter className="size-3" /> Reset
                      </Button>
                    </div>
                  </Card>
                  <ScrollArea className="h-[450px]">
                    <Table>
                      <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Student Details</TableHead><TableHead>Contact</TableHead><TableHead>College</TableHead><TableHead>Transaction ID</TableHead><TableHead>Payment</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Profile</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {paginatedPayments.map(pay => {
                          const student = students.find(s => s.email === pay.email);
                          return (
                            <TableRow key={pay.id}>
                              <TableCell className="text-[10px] font-medium">{new Date(pay.created_at).toLocaleString()}</TableCell>
                              <TableCell>
                                <div className="font-bold text-slate-800">{pay.full_name || pay.email}</div>
                                <div className="text-[10px] text-muted-foreground">{pay.email}</div>
                              </TableCell>
                              <TableCell>
                                <div className="text-[10px] font-medium text-slate-500">{student?.contact_number || "—"}</div>
                              </TableCell>
                              <TableCell>
                                <div className="text-[10px] font-bold text-slate-500 uppercase">{student?.college_name || "—"}</div>
                              </TableCell>
                              <TableCell><Badge variant="outline" className="text-[10px] font-mono">{pay.payment_id}</Badge></TableCell>
                              <TableCell className="text-xs text-muted-foreground">Paid</TableCell>
                              <TableCell><Badge className="bg-green-500 text-[10px] uppercase">Captured</Badge></TableCell>
                              <TableCell className="text-right">
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="size-8 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 transition-colors" 
                                  disabled={processing}
                                  onClick={() => handleViewPaymentStudent(pay.email)}
                                >
                                  {processing ? <Loader2 className="size-4 animate-spin text-indigo-600" /> : <Eye className="size-4" />}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {paginatedPayments.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No transactions found matching filters.</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                  <div className="p-4 bg-muted/10 border-t flex flex-col md:flex-row items-center justify-between gap-4 mt-0 rounded-b-xl">
                    <div className="text-xs text-muted-foreground font-medium">
                      Showing {filteredPayments.length === 0 ? 0 : paySafePage * payPageSize + 1} to{" "}
                      {Math.min(filteredPayments.length, (paySafePage + 1) * payPageSize)} of {filteredPayments.length}{" "}
                      transactions
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={paySafePage === 0}
                        onClick={() => setPayPage((p) => p - 1)}
                      >
                        Previous
                      </Button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: payPageCount }, (_, i) => i)
                          .filter((pageNum) => {
                            if (payPageCount <= 7) return true;
                            return (
                              Math.abs(pageNum - paySafePage) <= 2 ||
                              pageNum === 0 ||
                              pageNum === payPageCount - 1
                            );
                          })
                          .map((pageNum, i, arr) => (
                            <div key={pageNum} className="flex items-center gap-1">
                              {i > 0 && pageNum - arr[i - 1] > 1 && (
                                <span className="text-muted-foreground px-1 text-xs">...</span>
                              )}
                              <Button
                                variant={paySafePage === pageNum ? "default" : "outline"}
                                size="sm"
                                className="size-8 p-0"
                                onClick={() => setPayPage(pageNum)}
                              >
                                {pageNum + 1}
                              </Button>
                            </div>
                          ))}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={paySafePage >= payPageCount - 1}
                        onClick={() => setPayPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="leads">
              <Card className="p-6 border-none shadow-elegant">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                  <div>
                    <h3 className="text-xl font-bold flex items-center gap-2 text-indigo-600"><UserPlus className="size-5" /> Active Leads</h3>
                    <p className="text-xs text-muted-foreground font-medium">Incomplete registrations and failed/cancelled payments</p>
                  </div>
                  <div className="flex flex-col md:flex-row md:items-center gap-4 w-full md:w-auto">
                    <div className="relative w-full md:w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <Input 
                        placeholder="Search leads..." 
                        className="pl-9 h-9" 
                        value={leadsSearchTerm}
                        onChange={e => setLeadsSearchTerm(e.target.value)}
                      />
                    </div>
                    <Badge className="bg-indigo-100 text-indigo-700 border-none px-4 py-1.5 font-bold whitespace-nowrap">
                      Total Leads: {leadsTotalCount}
                    </Badge>
                  </div>
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  <Select
                    value={leadsUniFilter}
                    onValueChange={(v) => {
                      setLeadsUniFilter(v);
                      setLeadsCollegeFilter("all");
                    }}
                  >
                    <SelectTrigger className="gap-2 h-9">
                      <Building2 className="size-4" />
                      <SelectValue placeholder="All Universities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Universities</SelectItem>
                      {unis.map((u) => (
                        <SelectItem key={u.id} value={u.name}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={leadsCollegeFilter}
                    onValueChange={setLeadsCollegeFilter}
                  >
                    <SelectTrigger className="gap-2 h-9">
                      <GraduationCap className="size-4" />
                      <SelectValue placeholder="All Colleges" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="all">
                        All Colleges
                        {leadsUniFilter !== "all" ? ` (${leadsCollegeOptions.length})` : ""}
                      </SelectItem>
                      {leadsCollegeOptions.map((c) => (
                        <SelectItem key={c.id} value={c.name}>
                          {displayCollegeName(c.name)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    className="h-9 gap-2"
                    onClick={() => {
                      setLeadsSearchTerm("");
                      setLeadsUniFilter("all");
                      setLeadsCollegeFilter("all");
                    }}
                  >
                    <Filter className="size-4" /> Reset Filters
                  </Button>
                </div>
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Student Details</TableHead><TableHead>Transaction ID</TableHead><TableHead>Payment</TableHead><TableHead>Error</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {isLeadsDataLoading && paginatedLeads.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-20">
                            <Loader2 className="size-8 animate-spin mx-auto text-primary" />
                          </TableCell>
                        </TableRow>
                      ) : paginatedLeads.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-20 text-muted-foreground italic">
                            No current leads.
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedLeads.map((cp) => (
                          <TableRow key={cp.id}>
                            <TableCell className="text-[10px] font-medium">
                              {new Date(cp.created_at).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <div className="font-bold text-slate-800">{cp.full_name}</div>
                              <div className="text-[10px] text-muted-foreground">{cp.email}</div>
                              {cp.contact_number && (
                                <div className="text-[10px] text-slate-500 font-bold mt-0.5">
                                  📞 {cp.contact_number}
                                </div>
                              )}
                              <div className="flex flex-wrap gap-1 mt-1">
                                {cp.university_name && cp.university_name !== "—" ? (
                                  <Badge
                                    variant="outline"
                                    className="text-[8px] font-black uppercase text-slate-500 border-slate-200 leading-none py-0.5"
                                  >
                                    {cp.university_name}
                                  </Badge>
                                ) : null}
                                <Badge
                                  variant="outline"
                                  className="text-[8px] font-black uppercase text-indigo-500 border-indigo-100 leading-none py-0.5"
                                >
                                  {cp.college_name}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className="text-[8px] font-black uppercase text-emerald-500 border-emerald-100 leading-none py-0.5"
                                >
                                  {cp.course}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {cp.payment_id || "N/A"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">—</TableCell>
                            <TableCell>
                              <Badge
                                className={
                                  cp.failure_reason === "Incomplete registration"
                                    ? "bg-amber-100 text-amber-900 hover:bg-amber-100 border-none text-[10px] font-bold"
                                    : "bg-red-100 text-red-700 hover:bg-red-100 border-none text-[10px] font-bold"
                                }
                              >
                                {cp.failure_reason}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="size-8 p-0"
                                  onClick={() => {
                                    void openStudentViewDialog(cp.original);
                                  }}
                                >
                                  <Eye className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="size-8 p-0 rounded-full hover:bg-emerald-600 hover:text-white transition-all"
                                  onClick={() => handleTransferLead(cp.original)}
                                  title="Transfer to Registered Students"
                                  disabled={processing}
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
                </ScrollArea>
                <div className="p-4 bg-muted/10 border-t flex flex-col md:flex-row items-center justify-between gap-4 mt-0 rounded-b-xl">
                  <div className="text-xs text-muted-foreground font-medium">
                    Showing {leadsTotalCount === 0 ? 0 : leadsSafePage * leadsPageSize + 1} to{" "}
                    {Math.min(leadsTotalCount, (leadsSafePage + 1) * leadsPageSize)} of {leadsTotalCount}{" "}
                    leads
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={leadsSafePage === 0}
                      onClick={() => setLeadsPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: leadsPageCount }, (_, i) => i)
                        .filter((pageNum) => {
                          if (leadsPageCount <= 7) return true;
                          return (
                            Math.abs(pageNum - leadsSafePage) <= 2 ||
                            pageNum === 0 ||
                            pageNum === leadsPageCount - 1
                          );
                        })
                        .map((pageNum, i, arr) => (
                          <div key={pageNum} className="flex items-center gap-1">
                            {i > 0 && pageNum - arr[i - 1] > 1 && (
                              <span className="text-muted-foreground px-1 text-xs">...</span>
                            )}
                            <Button
                              variant={leadsSafePage === pageNum ? "default" : "outline"}
                              size="sm"
                              className="size-8 p-0"
                              onClick={() => setLeadsPage(pageNum)}
                            >
                              {pageNum + 1}
                            </Button>
                          </div>
                        ))}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={leadsSafePage >= leadsPageCount - 1}
                      onClick={() => setLeadsPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="lead-assignment" className="mt-0">
              <LeadAssignmentPanel client={supabase} isActive={activeTab === "lead-assignment"} />
            </TabsContent>

            <TabsContent value="comms" className="animate-fade-in">
              <div className="grid lg:grid-cols-3 gap-6">
                {/* Left: Compose Section */}
                <Card className="lg:col-span-2 p-6 shadow-soft border-slate-100">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        <Mail className="size-5 text-primary" />
                        Compose Bulk Email
                      </h2>
                      <p className="text-sm text-muted-foreground mt-1">Send custom announcements to your students</p>
                    </div>
                    {isSendingBulk && (
                      <div className="flex items-center gap-3 bg-primary/5 px-4 py-2 rounded-full border border-primary/20">
                        <Loader2 className="size-4 animate-spin text-primary" />
                        <span className="text-sm font-bold text-primary">
                          Sending {bulkProgress}/{bulkTotal}
                          {bulkProgress < bulkTotal && (
                            <span className="font-normal text-muted-foreground ml-1">
                              ({formatBulkMailEta(estimateBulkMailSeconds(bulkTotal - bulkProgress))} left)
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label>Email Subject</Label>
                      <Input 
                        placeholder="Enter email subject" 
                        value={bulkEmailSubject}
                        onChange={(e) => setBulkEmailSubject(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Message Content (Supports text & basic HTML)</Label>
                      <textarea 
                        className="w-full min-h-[300px] p-4 rounded-xl border border-input bg-background focus:ring-2 focus:ring-primary/20 transition-all text-sm resize-y"
                        placeholder="Write your message here... \nUse <br/> for new lines or <p> for paragraphs."
                        value={bulkEmailBody}
                        onChange={(e) => setBulkEmailBody(e.target.value)}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between pt-4 border-t">
                      <div className="text-sm">
                        <span className="text-muted-foreground">Recipients selected: </span>
                        <span className="font-bold text-primary">{commsSelectedIds.length + csvEmails.length}</span>
                      </div>
                      <Button 
                        variant="hero" 
                        size="lg" 
                        className="px-8 shadow-glow"
                        disabled={isSendingBulk || (!bulkEmailSubject || !bulkEmailBody) || (commsSelectedIds.length === 0 && csvEmails.length === 0)}
                        onClick={async () => {
                          const activeList = commRecipientType === 'enrolled' ? allStudentsComms : allLeadsComms;
                          const emailField = commRecipientType === 'enrolled' ? 'email' : 'user_email';
                          
                          const targets = [
                            ...activeList.filter((s: any) => commsSelectedIds.includes(s.id)).map((s: any) => s[emailField]),
                            ...csvEmails
                          ];
                          const uniqueTargets = Array.from(new Set(targets));
                          
                          setIsSendingBulk(true);
                          setBulkTotal(uniqueTargets.length);
                          setBulkProgress(0);
                          toast.info(
                            uniqueTargets.length === 1
                              ? "Sending email…"
                              : `Sending to ${uniqueTargets.length} recipients…`
                          );

                          const result = await sendBulkCustomMail(
                            uniqueTargets,
                            bulkEmailSubject,
                            bulkEmailBody,
                            (done, total) => setBulkProgress(done)
                          );

                          setIsSendingBulk(false);

                          if (result.rateLimited) {
                            toast.error(
                              result.sent > 0
                                ? `Hostinger rate limit after ${result.sent} sent. Wait 1 hour, then send remaining ${uniqueTargets.length - result.sent - result.failed} recipients in smaller batches.`
                                : "Hostinger rate limit — wait 1 hour before sending. Send to 1 test address first, then batches of 50."
                            );
                          } else if (result.failed > 0) {
                            toast.warning(
                              `Sent ${result.sent} of ${uniqueTargets.length}. ${result.failed} failed.`
                            );
                          } else {
                            toast.success(`Sent to ${result.sent} recipients.`);
                            setBulkEmailSubject("");
                            setBulkEmailBody("");
                            setCommsSelectedIds([]);
                            setCsvEmails([]);
                          }
                        }}
                      >
                        {isSendingBulk ? "Sending..." : "Send Bulk Email Now"}
                      </Button>
                    </div>
                  </div>
                </Card>

                {/* Right: Selection & CSV Section */}
                <div className="space-y-6">
                  <Card className="p-5 shadow-soft border-slate-100">
                    <h3 className="font-bold mb-4 flex items-center gap-2">
                      <Users className="size-4 text-primary" />
                      Target Selection
                    </h3>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-black text-muted-foreground">Audience Type</Label>
                        <Select value={commRecipientType} onValueChange={(v: any) => {
                          setCommRecipientType(v);
                          setCommUniFilters([]);
                          setCommCollegeFilters([]);
                          setCommDomainFilter("all");
                          setCommModeFilter("all");
                          setCommSearchTerm("");
                          setCommsSelectedIds([]);
                        }}>
                          <SelectTrigger className="h-10 bg-slate-50 border-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="enrolled">Enrolled Students ({allStudentsComms.length})</SelectItem>
                            <SelectItem value="unenrolled">Unenrolled Leads ({allLeadsComms.length})</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <MultiSelectCheckboxGroup
                        label="University"
                        options={unis}
                        selectedValues={commUniFilters}
                        onChange={(newUnis) => {
                          setCommUniFilters(newUnis);
                          setCommCollegeFilters((prev) =>
                            pruneCollegesForUniversities(colleges, unis, newUnis, prev)
                          );
                          setCommsSelectedIds([]);
                        }}
                        triggerClassName="h-10 bg-slate-50 border-none"
                      />

                      <MultiSelectCheckboxGroup
                        label="College"
                        options={collegesForUniversityNames(colleges, unis, commUniFilters)}
                        selectedValues={commCollegeFilters}
                        onChange={(newColleges) => {
                          setCommCollegeFilters(newColleges);
                          setCommsSelectedIds([]);
                        }}
                        triggerClassName="h-10 bg-slate-50 border-none"
                      />

                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-black text-muted-foreground">
                          Internship Domain
                        </Label>
                        <Select
                          value={commDomainFilter}
                          onValueChange={(v) => {
                            setCommDomainFilter(v);
                            setCommsSelectedIds([]);
                          }}
                        >
                          <SelectTrigger className="h-10 bg-slate-50 border-none">
                            <SelectValue placeholder="All Domains" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Domains</SelectItem>
                            {domains.map((d) => (
                              <SelectItem key={d.id} value={d.name}>
                                {d.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-black text-muted-foreground">
                          Internship Mode
                        </Label>
                        <InternshipModeFilterSelect
                          value={commModeFilter}
                          onValueChange={(v) => {
                            setCommModeFilter(v);
                            setCommsSelectedIds([]);
                          }}
                          className="h-10 bg-slate-50 border-none"
                        />
                      </div>

                      <p className="text-[10px] text-muted-foreground">
                        {commsFilteredList.length} match current filters
                        {(commUniFilters.length > 0 ||
                          commCollegeFilters.length > 0 ||
                          commDomainFilter !== "all" ||
                          commModeFilter !== "all") &&
                          ` of ${commsBaseList.length} total`}
                      </p>

                      <Separator />

                      <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200">
                        <p className="text-xs text-muted-foreground mb-3 text-center">Upload CSV with 'email' column</p>
                        <Input 
                          type="file" 
                          accept=".csv" 
                          className="bg-white"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              Papa.parse(file, {
                                header: true,
                                complete: (results) => {
                                  const emails = results.data
                                    .map((row: any) => row.email || row.Email || row.EMAIL)
                                    .filter(e => e && e.includes("@"));
                                  setCsvEmails(emails);
                                  toast.success(`Imported ${emails.length} emails from CSV`);
                                }
                              });
                            }
                          }}
                        />
                        {csvEmails.length > 0 && (
                          <div className="mt-3 flex items-center justify-between">
                            <Badge variant="outline" className="bg-white">{csvEmails.length} from CSV</Badge>
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500" onClick={() => setCsvEmails([])}>Clear</Button>
                          </div>
                        )}
                      </div>

                      <Separator />

                      <div>
                        <p className="text-xs font-bold text-muted-foreground uppercase mb-3">Filter & Select {commRecipientType === 'enrolled' ? 'Students' : 'Leads'}</p>
                        <Input
                          placeholder="Search name or email..."
                          value={commSearchTerm}
                          onChange={(e) => setCommSearchTerm(e.target.value)}
                          className="h-9 bg-white text-sm"
                        />
                        <div className="space-y-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full justify-start gap-2"
                            onClick={() => {
                              setCommsSelectedIds(commsFilteredList.map((s: any) => s.id));
                            }}
                          >
                            <CheckCircle2 className="size-4" /> Select All Filtered ({commsFilteredList.length})
                          </Button>
                          <Button 
                            type="button"
                            variant="ghost" 
                            size="sm" 
                            className="w-full justify-start gap-2 text-red-500"
                            onClick={() => {
                              setCommsSelectedIds([]);
                              setCsvEmails([]);
                            }}
                          >
                            <Trash2 className="size-4" /> Clear Selection
                          </Button>
                        </div>
                        
                        <div className="mt-4 border rounded-md bg-white">
                          <div className="px-3 py-2 bg-slate-50 border-b text-[10px] font-black uppercase text-slate-500 flex justify-between">
                            <span>{commsSelectedIds.length} Selected</span>
                            {commsFilteredList.length > commsDisplayedList.length && (
                              <span className="text-[9px] font-normal normal-case">
                                Showing first {commsDisplayedList.length} — narrow search
                              </span>
                            )}
                          </div>
                          <ScrollArea className="h-[200px]">
                            <div className="p-2 space-y-1">
                              {commsDisplayedList.map((item: any) => (
                                <label key={item.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer group">
                                  <Checkbox 
                                    checked={commsSelectedIds.includes(item.id)}
                                    onCheckedChange={(checked) => {
                                      setCommsSelectedIds((prev) =>
                                        checked
                                          ? prev.includes(item.id)
                                            ? prev
                                            : [...prev, item.id]
                                          : prev.filter((id) => id !== item.id)
                                      );
                                    }}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                                      {item.full_name || item.user_name || "Unknown"}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground truncate">
                                      {item.email || item.user_email}
                                    </div>
                                  </div>
                                </label>
                              ))}
                              {commsDisplayedList.length === 0 && (
                                <div className="text-center p-4 text-xs text-muted-foreground">
                                  No {commRecipientType === 'enrolled' ? 'students' : 'leads'} match filters
                                </div>
                              )}
                            </div>
                          </ScrollArea>
                        </div>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-5 shadow-soft border-slate-100 bg-primary/5 border-primary/10">
                    <h3 className="font-bold mb-2 flex items-center gap-2">
                      <Shield className="size-4 text-primary" />
                      Pro Tips
                    </h3>
                    <ul className="text-xs space-y-2 text-slate-600 list-disc pl-4">
                      <li>You can use basic HTML like <b>bold</b> or <i>italic</i>.</li>
                      <li>Check selection counts before sending.</li>
                      <li>CSV upload is the fastest way for large groups.</li>
                      <li>Do not close this window while sending is in progress.</li>
                      <li>Sends 15 emails per server batch (~3–4 min per 50). Hostinger limit ~100–200/hour — wait 1 hour if rate limited.</li>
                    </ul>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="settings">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Card className="p-6 border-none shadow-elegant bg-white">
                  <h3 className="font-bold mb-4 flex items-center gap-2"><Briefcase className="size-5 text-primary" /> Internship Domains</h3>
                  <div className="flex gap-2 mb-4"><Input value={newDomain} onChange={e => setNewDomain(e.target.value)} placeholder="New Domain..." className="bg-slate-50 border-none" /><Button variant="hero" onClick={addDomain}><Plus className="size-4" /></Button></div>
                  <ScrollArea className="h-[200px] pr-2">
                    <div className="flex flex-wrap gap-2">{domains.map(d => <Badge key={d.id} variant="secondary" className="pl-3 pr-1 py-1 gap-2 bg-slate-100 text-slate-700 border-none rounded-lg">{d.name} <Button size="sm" variant="ghost" className="size-4 p-0 h-auto hover:bg-red-50 hover:text-red-600" onClick={() => delDomain(d.id)}><Trash2 className="size-3" /></Button></Badge>)}</div>
                  </ScrollArea>
                </Card>

                <Card className="p-6 border-none shadow-elegant bg-slate-900 text-white">
                  <h3 className="font-bold mb-4 flex items-center gap-2 text-primary"><Shield className="size-5" /> Security & Access</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-6">Change Your Password</p>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-slate-400">New Password</Label>
                      <div className="relative">
                        <LogIn className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
                        <Input 
                          type="password" 
                          value={newPassword} 
                          onChange={e => setNewPassword(e.target.value)} 
                          placeholder="••••••••"
                          className="bg-slate-800 border-none text-white pl-9 placeholder:text-slate-600"
                        />
                      </div>
                    </div>
                    <Button 
                      className="w-full bg-primary hover:bg-primary/90 font-black tracking-tight" 
                      disabled={processing || !newPassword}
                      onClick={async () => {
                        setProcessing(true);
                        try {
                          await setLoginPasswordViaRpc(supabase, newPassword);
                          toast.success("Admin password updated successfully!");
                          setNewPassword("");
                          await logAdminAction('UPDATE', 'admin', 'Changed dashboard password (Admin Self-Service)');
                        } catch (err: unknown) {
                          toast.error(userFacingPasswordError(err));
                        } finally {
                          setProcessing(false);
                        }
                      }}
                    >
                      {processing ? <Loader2 className="size-4 animate-spin mr-2" /> : "Update Credentials"}
                    </Button>
                    {currentUserId ? (
                      <div className="pt-2 border-t border-slate-700">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-3">
                          Security PIN
                        </p>
                        <ChangePinModal
                          userId={currentUserId}
                          trigger={
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full border-slate-600 bg-slate-800 text-white hover:bg-slate-700"
                            >
                              <KeyRound className="size-4 mr-2" />
                              Manage Security PIN
                            </Button>
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                </Card>

                {/* Data Import Options Card */}
                <Card className="p-6 border-none shadow-elegant bg-white flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold mb-4 flex items-center gap-2 text-slate-800">
                      <DatabaseBackup className="size-5 text-primary" /> Data Import
                    </h3>
                    <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
                      Import data from CSV files directly into the system. Choose from three table targets. All imports automatically filter out duplicate rows matching existing Profile records.
                    </p>
                    <div className="space-y-3">
                      <Button 
                        variant="outline" 
                        className="w-full justify-between gap-2 h-10 text-xs font-bold border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-700 transition-all rounded-xl"
                        onClick={() => handleOpenImportDialog("transactions")}
                      >
                        <span className="flex items-center gap-2">
                          <FileSpreadsheet className="size-4 text-emerald-600" />
                          Transaction Table Import
                        </span>
                        <ArrowUpRight className="size-3.5 opacity-60" />
                      </Button>
                      <Button 
                        variant="outline" 
                        className="w-full justify-between gap-2 h-10 text-xs font-bold border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-700 transition-all rounded-xl"
                        onClick={() => handleOpenImportDialog("students")}
                      >
                        <span className="flex items-center gap-2">
                          <Users className="size-4 text-emerald-600" />
                          Students Table Import
                        </span>
                        <ArrowUpRight className="size-3.5 opacity-60" />
                      </Button>
                      <Button 
                        variant="outline" 
                        className="w-full justify-between gap-2 h-10 text-xs font-bold border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-700 transition-all rounded-xl"
                        onClick={() => handleOpenImportDialog("profiles")}
                      >
                        <span className="flex items-center gap-2">
                          <User className="size-4 text-emerald-600" />
                          Profile Table Import
                        </span>
                        <ArrowUpRight className="size-3.5 opacity-60" />
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="attendance" className="space-y-6 animate-fade-in">
              <StudentAttendancePanel
                currentUserId={currentUserId}
                isActive={activeTab === "attendance"}
                onStudentsLoaded={(rows) => {
                  setAttendanceStudentRows(rows as any[]);
                }}
              />
            </TabsContent>

            <TabsContent value="staff-management" className="space-y-6 animate-fade-in">
              <StaffManagementPanel
                staff={(staff || []) as any}
                currentUserId={currentUserId || null}
                isActive={activeTab === "staff-management"}
                onRefresh={loadAll}
                onDeleteStaff={handleDeleteStaff}
              />
            </TabsContent>

            <TabsContent value="settings" className="space-y-6">
              <div className="grid md:grid-cols-3 gap-6">
                <div className="md:col-span-1 space-y-6">
                  <Card className="p-6 border-none shadow-elegant bg-gradient-to-br from-indigo-50 to-white">
                    <h3 className="font-black text-indigo-900 mb-2 flex items-center gap-2 uppercase tracking-widest text-xs">
                      <Users className="size-4" /> Staff Management
                    </h3>
                    <p className="text-[11px] text-indigo-900/80 leading-relaxed mb-4">
                      Create staff IDs, manage profiles, service access, block/unblock, and attendance are now in the dedicated{" "}
                      <strong>Staff Management</strong> section.
                    </p>
                    <Button
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black"
                      onClick={() => setActiveTab("staff-management")}
                    >
                      Open Staff Management
                    </Button>
                  </Card>

                  <Card className="p-6 border-none shadow-elegant bg-gradient-to-br from-emerald-50 to-white">
                    <h3 className="font-black text-emerald-900 mb-4 flex items-center gap-2 uppercase tracking-widest text-xs">
                      <GraduationCap className="size-4" /> Create College Admin
                    </h3>
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase text-slate-500 ml-1">Display name</Label>
                        <Input
                          placeholder="e.g. Dr. A. Kumar"
                          value={newCollegeAdminName}
                          onChange={(e) => setNewCollegeAdminName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase text-slate-500 ml-1">Email</Label>
                        <Input
                          placeholder="principal@college.edu"
                          value={newCollegeAdminEmail}
                          onChange={(e) => setNewCollegeAdminEmail(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase text-slate-500 ml-1">University</Label>
                        <Select
                          value={newCollegeAdminUniId || undefined}
                          onValueChange={(v) => {
                            setNewCollegeAdminUniId(v);
                            setNewCollegeAdminCollegeIds([]);
                          }}
                        >
                          <SelectTrigger className="h-9 bg-white border-emerald-100 font-bold text-xs">
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
                        <Label className="text-[10px] font-black uppercase text-slate-500 ml-1">Colleges</Label>
                        <CollegeAdminCollegePicker
                          colleges={colleges}
                          universityId={newCollegeAdminUniId}
                          selectedIds={newCollegeAdminCollegeIds}
                          onChange={setNewCollegeAdminCollegeIds}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase text-slate-500 ml-1">College Admin ID</Label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Input
                            className="h-9 bg-white border-emerald-100 font-mono text-xs font-bold tracking-tight"
                            placeholder="Click Generate or type your own (min 6 characters)"
                            value={newCollegeAdminCode}
                            onChange={(e) => setNewCollegeAdminCode(e.target.value)}
                            autoComplete="off"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 shrink-0 border-emerald-200 font-black text-[10px] uppercase bg-white"
                            onClick={() => setNewCollegeAdminCode(generateCollegeAdminCode())}
                            disabled={processing}
                          >
                            <KeyRound className="size-3.5 mr-1.5" />
                            Generate ID
                          </Button>
                        </div>
                        <p className="text-[10px] text-emerald-800/70 leading-snug">
                          This is their sign-in secret (stored as the account password). You can regenerate until you create the user.
                        </p>
                      </div>
                      <Button
                        type="button"
                        className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black shadow-glow"
                        onClick={handleCreateCollegeAdmin}
                        disabled={processing}
                      >
                        {processing ? (
                          <Loader2 className="size-4 animate-spin mr-2" />
                        ) : (
                          <Mail className="size-4 mr-2" />
                        )}
                        CREATE AND EMAIL LOGIN
                      </Button>
                    </div>
                  </Card>
                </div>

                <div className="md:col-span-2 space-y-6">
                  <Card className="p-6 border-none shadow-elegant bg-slate-50">
                    <h3 className="font-black text-slate-800 mb-2 flex items-center gap-2 uppercase tracking-widest text-xs">
                      <Users className="size-4 text-primary" /> Staff directory moved
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Staff list, create, edit, block/unblock, permissions, and attendance are managed under{" "}
                      <strong>Staff Management</strong> in the sidebar.
                    </p>
                    <Button variant="outline" onClick={() => setActiveTab("staff-management")}>
                      Go to Staff Management
                    </Button>
                  </Card>

                  <Card className="p-6 border-none shadow-elegant">
                    <h3 className="font-black text-slate-800 mb-2 flex items-center gap-2 uppercase tracking-widest text-xs">
                      <GraduationCap className="size-4 text-emerald-600" /> College administrators
                    </h3>
                    <p className="text-[11px] text-muted-foreground mb-4">
                      Accounts for <code className="text-[10px]">/college/login</code>. Trash removes college portal access and restores a student role on that user (Auth user is not deleted).
                    </p>
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow>
                          <TableHead className="text-[10px] font-black uppercase">Email</TableHead>
                          <TableHead className="text-[10px] font-black uppercase">Name</TableHead>
                          <TableHead className="text-[10px] font-black uppercase">Colleges</TableHead>
                          <TableHead className="text-[10px] font-black uppercase">College Admin ID</TableHead>
                          <TableHead className="text-[10px] font-black uppercase">Added</TableHead>
                          <TableHead className="text-right text-[10px] font-black uppercase">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {collegeAdmins.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                              No college administrators yet. Create one using the card on the left.
                            </TableCell>
                          </TableRow>
                        ) : (
                          collegeAdmins.map((row) => (
                            <TableRow key={row.user_id}>
                              <TableCell className="font-bold text-sm">{row.profile_email || "—"}</TableCell>
                              <TableCell className="text-sm">{row.profile_name || "—"}</TableCell>
                              <TableCell className="text-sm">
                                {(row.college_names || []).length ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-[11px] font-bold gap-1.5 border-emerald-200 text-emerald-800 hover:bg-emerald-50"
                                    onClick={() => setViewCollegeAdminRow(row)}
                                  >
                                    <Eye className="size-3.5 shrink-0" />
                                    View ({row.college_names.length})
                                  </Button>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs font-mono font-semibold">{row.college_admin_code || "—"}</TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-blue-600 hover:bg-blue-50"
                                    title="Edit college administrator"
                                    onClick={() => openEditCollegeAdmin(row)}
                                  >
                                    <Edit className="size-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-500 hover:bg-red-50 hover:text-red-600"
                                    title="Remove college portal access"
                                    onClick={() => handleDeleteCollegeAdmin(row.user_id)}
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </Card>

                  <Card className="p-6 border-none shadow-elegant bg-slate-900 text-white">
                    <h3 className="font-black text-primary mb-6 flex items-center gap-2 uppercase tracking-widest text-xs">
                      <Shield className="size-4" /> Domain Management
                    </h3>
                    <div className="space-y-6">
                      <div className="flex gap-2">
                        <Input value={newDomain} onChange={e => setNewDomain(e.target.value)} placeholder="New Domain..." className="h-9 bg-white/10 border-white/20 text-white placeholder:text-white/30" />
                        <Button size="sm" onClick={async () => {
                          if(!newDomain) return;
                          await supabase.from("internship_domains").insert({ name: newDomain });
                          setNewDomain("");
                          loadAll();
                        }}><Plus className="size-4" /></Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {domains.map(d => (
                          <Badge key={d.id} variant="outline" className="bg-white/5 border-white/10 text-white font-bold py-1">
                            {d.name}
                            <Trash2 className="size-3 ml-2 cursor-pointer text-red-400" onClick={async () => {
                              if(confirm("Delete domain?")) { await supabase.from("internship_domains").delete().eq("id", d.id); loadAll(); }
                            }} />
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="cybercafe">
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold flex items-center gap-2"><Store className="size-5 text-primary" /> Cyber Cafe Management</h2>
                </div>
                
                <Card className="p-0 border-none shadow-soft overflow-hidden">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-slate-50 border-b border-slate-100">
                        <TableRow>
                          <TableHead className="font-bold text-slate-500 uppercase text-[10px] tracking-widest">Shop & Owner</TableHead>
                          <TableHead className="font-bold text-slate-500 uppercase text-[10px] tracking-widest">Contact</TableHead>
                          <TableHead className="font-bold text-slate-500 uppercase text-[10px] tracking-widest">Location</TableHead>
                          <TableHead className="font-bold text-slate-500 uppercase text-[10px] tracking-widest">Status</TableHead>
                          <TableHead className="text-right font-bold text-slate-500 uppercase text-[10px] tracking-widest">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cyberCafes.length === 0 ? (
                          <TableRow><TableCell colSpan={5} className="text-center py-10 text-slate-500">No Cyber Cafes found.</TableCell></TableRow>
                        ) : cyberCafes.map(cafe => (
                          <TableRow key={cafe.id} className="hover:bg-slate-50 transition-colors">
                            <TableCell>
                              <div className="font-bold text-sm text-slate-900">{cafe.shop_name}</div>
                              <div className="text-xs text-slate-500">{cafe.owner_name}</div>
                            </TableCell>
                            <TableCell>
                              <div className="text-xs text-slate-900">{cafe.email}</div>
                              <div className="text-xs text-slate-500">{cafe.phone}</div>
                            </TableCell>
                            <TableCell className="text-xs text-slate-700 max-w-[200px]">
                              {cafe.location || "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-[10px] font-black uppercase tracking-widest ${
                                cafe.status === 'approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                                cafe.status === 'rejected' ? 'bg-red-50 text-red-600 border-red-200' :
                                'bg-orange-50 text-orange-600 border-orange-200'
                              }`}>
                                {formatCyberCafeStatusLabel(cafe.status)}
                              </Badge>
                              {cafe.rejection_reason && <div className="text-[9px] text-red-500 mt-1 max-w-[150px] truncate" title={cafe.rejection_reason}>Reason: {cafe.rejection_reason}</div>}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="h-8 text-xs font-bold gap-1"
                                  onClick={() => {
                                    setSelectedCafe(cafe);
                                    setIsCafeViewOpen(true);
                                  }}
                                >
                                  <Eye className="size-3" /> View
                                </Button>

                                {(cafe.status === 'pending_approval' || cafe.status === 'pending_kyc') && (
                                  <>
                                    <Button size="sm" variant="outline" className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200 h-8 text-xs font-bold" onClick={() => handleCafeAction(cafe.id, 'approved')}>
                                      Approve
                                    </Button>
                                    <Button size="sm" variant="outline" className="bg-red-50 text-red-700 hover:bg-red-100 border-red-200 h-8 text-xs font-bold" onClick={() => handleCafeAction(cafe.id, 'rejected')}>
                                      Reject
                                    </Button>
                                  </>
                                )}
                                {cafe.status === 'approved' && (
                                  <Button size="sm" variant="outline" className="bg-red-50 text-red-700 hover:bg-red-100 border-red-200 h-8 text-xs font-bold" onClick={() => handleCafeAction(cafe.id, 'rejected')}>
                                    Revoke
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="referrals">
              <ReferralsPanel />
            </TabsContent>

            <TabsContent value="college-rosters">
              <CollegeRostersPanel />
            </TabsContent>

            <TabsContent value="fees-management" className="mt-0">
              <FeesManagementPanel onLogAction={logAdminAction} />
            </TabsContent>

            <TabsContent value="course-management" className="mt-0">
              <CourseManagementPanel onLogAction={logAdminAction} />
            </TabsContent>

            <TabsContent value="add-registration" className="mt-0">
              <AdminAddRegistrationPanel
                client={supabase}
                portalLabel="Admin"
                onLogAction={logAdminAction}
                onSuccess={async () => {
                  await fetchStudents();
                  await loadAll();
                }}
              />
            </TabsContent>

            <TabsContent value="student-data-upload" className="mt-0">
              <StudentDataUploadPanel
                client={supabase}
                onLogAction={logAdminAction}
                onSuccess={async () => {
                  await fetchStudents();
                  await loadAll();
                }}
              />
            </TabsContent>

            <TabsContent value="gallery" className="mt-0">
              <GalleryManagementPanel client={supabase} currentUserId={currentUserId} />
            </TabsContent>

            <TabsContent value="home-cms" className="mt-0">
              <HomeCmsManagementPanel client={supabase} currentUserId={currentUserId} />
            </TabsContent>

            <TabsContent value="consult-letter" className="mt-0">
              <ConsultLetterManagementPanel client={supabase} currentUserId={currentUserId} />
            </TabsContent>
          </div>
        </main>
      </div>
    </Tabs>

      <Dialog
        open={!!viewCollegeAdminRow}
        onOpenChange={(open) => {
          if (!open) setViewCollegeAdminRow(null);
        }}
      >
        <DialogContent className="max-w-lg border-none shadow-elegant">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="size-5 text-emerald-600" />
              Assigned colleges
            </DialogTitle>
            <DialogDescription>
              {viewCollegeAdminRow?.profile_name
                ? `${viewCollegeAdminRow.profile_name} (${viewCollegeAdminRow.profile_email || "—"})`
                : "Colleges this administrator can access in the college portal."}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[min(60vh,320px)] pr-3">
            <ol className="space-y-2 list-decimal list-inside">
              {(viewCollegeAdminRow?.college_names || []).map((name: string, idx: number) => (
                <li
                  key={`${name}-${idx}`}
                  className="text-sm font-medium text-slate-800 leading-snug pl-1 marker:text-emerald-600"
                >
                  {displayCollegeName(name)}
                </li>
              ))}
            </ol>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewCollegeAdminRow(null)}>
              Close
            </Button>
            {viewCollegeAdminRow ? (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  openEditCollegeAdmin(viewCollegeAdminRow);
                  setViewCollegeAdminRow(null);
                }}
              >
                <Edit className="size-4 mr-2" />
                Edit administrator
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditCollegeAdminOpen} onOpenChange={setIsEditCollegeAdminOpen}>
        <DialogContent className="max-w-md border-none shadow-elegant">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="size-5 text-emerald-600" />
              Edit college administrator
            </DialogTitle>
            <DialogDescription>
              Update name, email, and which colleges this account can view in the college portal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-slate-500">Display name</Label>
              <Input
                value={editCollegeAdminName}
                onChange={(e) => setEditCollegeAdminName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-slate-500">Email</Label>
              <Input
                value={editCollegeAdminEmail}
                onChange={(e) => setEditCollegeAdminEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-slate-500">University</Label>
              <Select
                value={editCollegeAdminUniId || undefined}
                onValueChange={(v) => {
                  setEditCollegeAdminUniId(v);
                  setEditCollegeAdminCollegeIds((ids) =>
                    ids.filter((id) => colleges.find((c) => c.id === id)?.university_id === v)
                  );
                }}
              >
                <SelectTrigger className="h-9 font-bold text-xs">
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
              <Label className="text-[10px] font-black uppercase text-slate-500">Colleges</Label>
              <CollegeAdminCollegePicker
                colleges={colleges}
                universityId={editCollegeAdminUniId}
                selectedIds={editCollegeAdminCollegeIds}
                onChange={setEditCollegeAdminCollegeIds}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-slate-500">College Admin ID (optional)</Label>
              <Input
                className="font-mono text-xs"
                placeholder="Leave blank to keep current sign-in ID"
                value={editCollegeAdminCode}
                onChange={(e) => setEditCollegeAdminCode(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditCollegeAdminOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleUpdateCollegeAdmin}
              disabled={processing}
            >
              {processing ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddStudentOpen} onOpenChange={setIsAddStudentOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto border-none shadow-elegant">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-5 text-primary" />
              Add student (same steps as registration)
            </DialogTitle>
            <DialogDescription>
              Multi-step form matching the public registration flow. Payment is skipped; credentials are emailed when possible.
            </DialogDescription>
          </DialogHeader>
          <RegistrationForm
            key={addStudentFormKey}
            variant="admin"
            onAdminComplete={async (info) => {
              await logAdminAction(
                "CREATE",
                "student",
                `Manually added student (full form): ${info.full_name} (Admin)`,
                { email: info.email }
              );
              setIsAddStudentOpen(false);
              loadAll();
              fetchStudents();
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isAddStaffOpen} onOpenChange={setIsAddStaffOpen}><DialogContent><DialogHeader><DialogTitle>Add Administrator</DialogTitle><DialogDescription>Enter the staff email address to grant administrator dashboard access.</DialogDescription></DialogHeader>
        <div className="p-4 space-y-4"><div className="space-y-2"><Label>User Email</Label><Input value={staffEmail} onChange={e => setStaffEmail(e.target.value)} /></div></div>
        <DialogFooter><Button onClick={handleAddStaff}>Grant Access</Button></DialogFooter>
      </DialogContent></Dialog>

      {/* Attendance History Dialog */}
      <Dialog open={isAttHistoryOpen} onOpenChange={setIsAttHistoryOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] p-0 overflow-hidden rounded-3xl border-none shadow-elegant flex flex-col">
          <DialogDescription className="sr-only">
            Attendance summary and daily attendance records for the selected student.
          </DialogDescription>
          <div className="bg-slate-900 p-6 text-white shrink-0">
            <div className="flex items-center gap-3 mb-1">
              <div className="size-10 rounded-xl bg-violet-500/20 flex items-center justify-center"><CheckSquare className="size-5 text-violet-400" /></div>
              <div>
                <DialogTitle className="text-lg font-black text-white">{selectedAttendanceStudent?.full_name}</DialogTitle>
                <p className="text-slate-400 text-xs">{selectedAttendanceStudent?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-6 mt-4 pt-4 border-t border-white/10">
              <div className="text-center">
                <div className="text-2xl font-black text-violet-400">
                  {selectedAttendanceStudent?.total_days ?? studentAttendanceHistory.length}
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                  Programme Days Marked
                  {selectedAttendanceStudent?.attendanceTotalDays
                    ? ` / ${selectedAttendanceStudent.attendanceTotalDays}`
                    : ""}
                </div>
              </div>
              <div className="text-center">
                <div className={`text-lg font-black ${selectedAttendanceStudent?.isEligible ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatAttendancePercentage(selectedAttendanceStudent?.percentage ?? 0)}
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Attendance</div>
              </div>
              <div className="text-center">
                {selectedAttendanceStudent?.isEligible
                  ? <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">✅ Eligible</Badge>
                  : <Badge className="bg-red-500/20 text-red-400 border-red-500/30">❌ Not Eligible</Badge>
                }
              </div>
            </div>
          </div>
          <div className="p-4 pt-3 flex flex-col min-h-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3 ml-1 shrink-0">
              Attendance Records ({studentAttendanceHistory.length})
            </p>
            <ScrollArea className="h-[min(420px,calc(90vh-220px))] w-full rounded-xl border border-slate-100">
              <div className="space-y-2 pr-4 pb-2 p-1">
                {studentAttendanceHistory.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">No records found</div>
                ) : studentAttendanceHistory.map((rec, idx) => (
                  <div key={rec.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-violet-100 flex items-center justify-center text-violet-600 font-black text-xs">{idx + 1}</div>
                      <div>
                        <div className="text-sm font-bold text-slate-800">
                          {new Date(rec.marked_at).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                          <Clock className="size-3" />
                          {new Date(rec.marked_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                        </div>
                      </div>
                    </div>
                    <Badge className="bg-emerald-50 text-emerald-700 border-none text-[10px] font-black">Present</Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isResetPassOpen} onOpenChange={setIsResetPassOpen}>
        <DialogContent className="sm:max-w-[425px] border-none shadow-elegant">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogIn className="size-5 text-orange-600" />
              Reset Student Password
            </DialogTitle>
            <DialogDescription>
              Set a new manual password for {resetPassUser?.full_name}. This will take effect immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input 
                type="text" 
                value={newPassword} 
                onChange={e => setNewPassword(e.target.value)} 
                placeholder="Enter new password"
                className="font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsResetPassOpen(false)}>Cancel</Button>
            <Button variant="hero" className="bg-orange-600 hover:bg-orange-700 shadow-orange-200" onClick={handleResetPassword} disabled={processing || !newPassword}>
              {processing && <Loader2 className="size-4 animate-spin mr-2" />} Update Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isTransferPassOpen}
        onOpenChange={(open) => {
          setIsTransferPassOpen(open);
          if (!open) setTransferLeadTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-[425px] border-none shadow-elegant">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogIn className="size-5 text-emerald-600" />
              Set password for transfer
            </DialogTitle>
            <DialogDescription>
              No password was saved on this lead. Set one so the student can sign in after transfer
              {transferLeadTarget
                ? ` (${transferLeadTarget.full_name || transferLeadTarget.metadata?.fullName || transferLeadTarget.email || transferLeadTarget.user_email || "lead"})`
                : ""}
              .
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Student password</Label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={transferPassword}
                  onChange={(e) => setTransferPassword(e.target.value)}
                  placeholder="Enter or generate password"
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => setTransferPassword(generateTempPassword())}
                >
                  Generate
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                This password is stored on the student record and included in the welcome email.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsTransferPassOpen(false);
                setTransferLeadTarget(null);
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={confirmTransferWithPassword}
              disabled={processing || !transferPassword.trim()}
            >
              {processing && <Loader2 className="size-4 animate-spin mr-2" />}
              Transfer with password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}><DialogContent className="max-w-2xl p-0 overflow-hidden rounded-3xl border-none shadow-elegant">
        <DialogDescription className="sr-only">
          Student profile including personal, academic, emergency contacts, and stored metadata.
        </DialogDescription>
        <div className="bg-primary p-6 text-white">
          <DialogTitle className="text-2xl font-black flex items-center gap-2 flex-wrap">
            {selectedUser?.full_name || selectedUser?.metadata?.fullName || "Profile Details"}
          </DialogTitle>
          <p className="text-primary-foreground/80 text-xs mt-1">
            {selectedUser?.registration_id ? `Reg ID: ${selectedUser.registration_id}` : "Lead / Pending Registration"}
          </p>
        </div>
        {selectedUser && (
          <ScrollArea className="max-h-[70vh]">
            <div className="p-8 space-y-8">
              {/* Personal Section */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                  <User className="size-3" /> Personal Information
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  <div><Label className="text-[9px] uppercase text-muted-foreground font-bold">Gender</Label><p className="text-sm font-bold">{selectedUser.gender || selectedUser.metadata?.gender || "—"}</p></div>
                  <div><Label className="text-[9px] uppercase text-muted-foreground font-bold">Email</Label><p className="text-sm font-bold truncate">{selectedUser.email || selectedUser.user_email || "—"}</p></div>
                  <div><Label className="text-[9px] uppercase text-muted-foreground font-bold">Contact</Label><p className="text-sm font-bold">{selectedUser.contact_number || selectedUser.user_phone || selectedUser.metadata?.contact_number || selectedUser.metadata?.contact || "—"}</p></div>
                  <div className="md:col-span-2"><Label className="text-[9px] uppercase text-muted-foreground font-bold">Parent / Guardian</Label><p className="text-sm font-bold">{selectedUser.parent_name || selectedUser.metadata?.parentName || "—"}</p></div>
                </div>
              </div>

              <Separator className="bg-slate-100" />

              {/* Academic Section */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                  <GraduationCap className="size-3" /> Academic Details
                </h4>
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <div className="col-span-2"><Label className="text-[9px] uppercase text-muted-foreground font-bold">University</Label><p className="text-sm font-bold">{selectedUser.university_name || selectedUser.metadata?.university_name || selectedUser.metadata?.university || "—"}</p></div>
                  <div className="col-span-2"><Label className="text-[9px] uppercase text-muted-foreground font-bold">College</Label><p className="text-sm font-bold">{selectedUser.college_name || selectedUser.metadata?.college_name || selectedUser.metadata?.college || "—"}</p></div>
                  <div><Label className="text-[9px] uppercase text-muted-foreground font-bold">Degree</Label><p className="text-sm font-bold">{selectedUser.degree || selectedUser.metadata?.degree || "—"}</p></div>
                  <div><Label className="text-[9px] uppercase text-muted-foreground font-bold">Department</Label><p className="text-sm font-bold">{selectedUser.department || selectedUser.metadata?.department || "—"}</p></div>
                  <div><Label className="text-[9px] uppercase text-muted-foreground font-bold">Subject</Label><p className="text-sm font-bold">{selectedUser.metadata?.subject || "—"}</p></div>
                  <div><Label className="text-[9px] uppercase text-muted-foreground font-bold">Session</Label><p className="text-sm font-bold">{selectedUser.academic_session || selectedUser.metadata?.session || "—"}</p></div>
                  <div><Label className="text-[9px] uppercase text-muted-foreground font-bold">Semester</Label><p className="text-sm font-bold">{selectedUser.class_semester || selectedUser.metadata?.semester || selectedUser.metadata?.classSem || "—"}</p></div>
                  <div><Label className="text-[9px] uppercase text-muted-foreground font-bold">Registration No.</Label><p className="text-sm font-bold">{selectedUser.roll_number || selectedUser.metadata?.rollNo || "—"}</p></div>
                  {isBnmuStudent(
                    selectedUser.university_name || selectedUser.metadata?.university_name
                  ) ? (
                    <div>
                      <Label className="text-[9px] uppercase text-muted-foreground font-bold">Roll No.</Label>
                      <p className="text-sm font-bold">
                        {selectedUser.university_roll_number ||
                          selectedUser.metadata?.university_roll_number ||
                          selectedUser.metadata?.universityRollNumber ||
                          resolveBnmuUniversityRollNumber(selectedUser) ||
                          "—"}
                      </p>
                    </div>
                  ) : null}
                  <div className="col-span-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <Label className="text-[9px] uppercase text-primary font-bold">Internship Domain</Label>
                    <p className="text-base font-black text-slate-900">{selectedUser.internship_domain || selectedUser.metadata?.course || selectedUser.metadata?.internship_domain || "—"}</p>
                  </div>
                </div>
              </div>

              <Separator className="bg-slate-100" />

              {/* Emergency Section */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                  <Phone className="size-3" /> Emergency Contacts
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  <div><Label className="text-[9px] uppercase text-muted-foreground font-bold">Contact Name</Label><p className="text-sm font-bold">{selectedUser.emergency_name || selectedUser.metadata?.emName || "—"}</p></div>
                  <div><Label className="text-[9px] uppercase text-muted-foreground font-bold">Relationship</Label><p className="text-sm font-bold">{selectedUser.emergency_relation || selectedUser.metadata?.emRel || "—"}</p></div>
                  <div><Label className="text-[9px] uppercase text-muted-foreground font-bold">Contact Phone</Label><p className="text-sm font-bold">{selectedUser.emergency_contact || selectedUser.metadata?.emPhone || "—"}</p></div>
                </div>
              </div>

              {typeof selectedUser.metadata?.consent_form_url === "string" &&
                selectedUser.metadata.consent_form_url.trim() !== "" && (
                  <>
                    <Separator className="bg-slate-100" />
                    <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-4 space-y-2">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                        <FileText className="size-3" /> Consent letter
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        File uploaded at registration — opens in a new tab.
                      </p>
                      <Button variant="outline" size="sm" className="font-bold" asChild>
                        <a
                          href={selectedUser.metadata.consent_form_url.trim()}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open consent letter
                        </a>
                      </Button>
                    </div>
                  </>
                )}

              {selectedUser.reason && (
                <>
                  <Separator className="bg-slate-100" />
                  <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
                    <Label className="text-[9px] uppercase text-red-600 font-bold">Lead Status / Payment Issue</Label>
                    <p className="text-sm font-bold text-red-700">{selectedUser.reason}</p>
                  </div>
                </>
              )}

              {/* Technical / A2Z Section */}
              <div className="space-y-4 pt-6 border-t border-slate-100 bg-slate-50 p-6 rounded-2xl">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-600 flex items-center gap-2">
                  <Shield className="size-3" /> Technical Metadata (A2Z Details)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label className="text-[9px] uppercase text-orange-400 font-bold">Account Password (directory)</Label>
                    <p className="text-sm font-mono font-bold text-orange-700 bg-orange-100 px-2 py-1 rounded inline-block">
                      {getStudentDirectoryPassword(selectedUser) || "Not stored — use Reset Password or Resend Credentials"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-[9px] uppercase text-muted-foreground font-bold">Address</Label>
                    <p className="text-sm font-bold">{selectedUser.metadata?.address || "—"}</p>
                  </div>
                </div>
                
                {/* JSON Raw Dump for A2Z Check */}
                <div className="mt-4">
                  <Label className="text-[9px] uppercase text-slate-400 font-bold">Raw JSON Metadata</Label>
                  <pre className="text-[9px] bg-slate-900 text-slate-300 p-4 rounded-xl mt-2 overflow-x-auto max-h-48">
                    {JSON.stringify(studentMetadataOf(selectedUser), null, 2)}
                  </pre>
                </div>
              </div>

              <div className="flex justify-end gap-4 mt-8">
                <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>Close View</Button>
                {!selectedUser.registration_id && (
                  <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold" onClick={() => { setIsViewDialogOpen(false); handleTransferLead(selectedUser); }}>
                    Transfer to Student
                  </Button>
                )}
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent></Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden rounded-3xl border-none shadow-elegant">
          <DialogDescription className="sr-only">
            Edit student personal details, academic information, internship fields, and emergency contacts.
          </DialogDescription>
          <div className="bg-primary p-6 text-white">
            <DialogTitle className="text-2xl font-black">Edit Student Details</DialogTitle>
            <p className="text-primary-foreground/80 text-xs mt-1">Update personal and academic records</p>
          </div>
          {editData && (
            <ScrollArea className="max-h-[70vh]">
              <form onSubmit={handleEditStudentSubmit} className="p-8 space-y-8">
                {/* Personal Section */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                    <User className="size-3" /> Personal Information
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                    <div className="space-y-1"><Label className="text-xs">Full Name</Label><Input value={editData.full_name || ""} onChange={e => setEditData({...editData, full_name: e.target.value})} required /></div>
                    <div className="space-y-1"><Label className="text-xs">Email</Label><Input type="email" value={editData.email || ""} onChange={e => setEditData({...editData, email: e.target.value})} required /></div>
                    <div className="space-y-1"><Label className="text-xs">Contact Number</Label><Input value={editData.contact_number || ""} onChange={e => setEditData({...editData, contact_number: e.target.value})} /></div>
                    <div className="space-y-1"><Label className="text-xs">Gender</Label>
                      <Select
                        value={["Male", "Female", "Other"].includes(editData.gender) ? editData.gender : EDIT_GENDER_SENTINEL}
                        onValueChange={(v) =>
                          setEditData({ ...editData, gender: v === EDIT_GENDER_SENTINEL ? "" : v })
                        }
                      >
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EDIT_GENDER_SENTINEL}>Not specified</SelectItem>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 md:col-span-2"><Label className="text-xs">Parent / Guardian</Label><Input value={editData.parent_name || ""} onChange={e => setEditData({...editData, parent_name: e.target.value})} /></div>
                  </div>
                </div>

                <StudentEditFormFields
                  editData={editData}
                  setEditData={setEditData}
                  domains={editDialogDomains}
                  unis={editDialogUnis}
                  colleges={colleges}
                  registrationNumLabel="Registration number"
                  variant={editFormVariant}
                  engineeringCourses={editEngCourses}
                  engineeringBranches={editEngBranches}
                />

                <div className="flex justify-end gap-4 mt-8">
                  <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={processing}>{processing ? <Loader2 className="size-4 animate-spin mr-2" /> : null} Save Changes</Button>
                </div>
              </form>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* Manage Permissions Dialog */}
      <Dialog open={isManagePermissionsOpen} onOpenChange={setIsManagePermissionsOpen}>
        <DialogContent className="max-w-md border-none shadow-elegant">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="size-5 text-blue-600" />
              Manage Staff Services
            </DialogTitle>
            <DialogDescription>
              Toggle specific dashboard services for {selectedStaffMember?.email}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-1 gap-4">
              {STAFF_PERMISSION_CATALOG.map((perm) => (
                <div key={perm.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <Label htmlFor={perm.id} className="font-bold text-sm text-slate-700 cursor-pointer">{perm.label}</Label>
                  <Checkbox 
                    id={perm.id}
                    checked={staffPermissions[perm.id] === true}
                    onCheckedChange={(checked) => {
                      setStaffPermissions((prev: any) => ({ ...prev, [perm.id]: !!checked }));
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsManagePermissionsOpen(false)}>Cancel</Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700 shadow-blue-200 font-bold"
              disabled={processing}
              onClick={async () => {
                setProcessing(true);
                try {
                  const normalized = staffPermissionsPayload(normalizeStaffPermissions(staffPermissions));
                  const { error: staffTableError } = await supabase
                    .from("admin_staff")
                    .update({
                      permissions: normalized
                    })
                    .eq("id", selectedStaffMember.id);
                  
                  if (staffTableError) throw staffTableError;

                  try {
                    await supabase
                      .from("admin_permissions")
                      .upsert({
                        user_id: selectedStaffMember.id,
                        ...normalized,
                        updated_at: new Date().toISOString()
                      });
                  } catch (e) {
                    console.warn("Sync to standard permissions failed (likely no auth user yet):", e);
                  }

                  toast.success("Permissions updated successfully!");
                  loadAll();
                  setIsManagePermissionsOpen(false);
                } catch (err: any) {
                  toast.error(err.message);
                } finally {
                  setProcessing(false);
                }
              }}
            >
              {processing && <Loader2 className="size-4 animate-spin mr-2" />}
              Save Permissions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cyber Cafe View Dialog */}
      <Dialog open={isCafeViewOpen} onOpenChange={setIsCafeViewOpen}>
        <DialogContent className="max-w-4xl border-none shadow-elegant max-h-[90vh] flex flex-col p-0">
          <DialogDescription className="sr-only">
            Cyber cafe dashboard summary, linked students, and transactions.
          </DialogDescription>
          <div className="p-6 border-b">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Store className="size-5 text-primary" />
                  Cyber Cafe Dashboard View
                </div>
              </DialogTitle>
            </DialogHeader>
          </div>
          
          {selectedCafe && (() => {
            const cafeStudents = cafeViewStudents;
            const allCafeEmails = cafeStudents.map((s) => s.email).filter(Boolean);
            
            // Pending / Leads
            const cafePending = failedPayments.filter(fp => fp.cybercafe_email === selectedCafe.email || fp.cybercafe_shop_name === selectedCafe.shop_name || allCafeEmails.includes(fp.email));
            // Also check old legacy leads
            const oldCafePending = cancelledPayments.filter(cp => cp.cybercafe_email === selectedCafe.email || cp.cybercafe_shop_name === selectedCafe.shop_name || allCafeEmails.includes(cp.user_email));
            const allPending = [...cafePending, ...oldCafePending];

            const cafeTransactions = payments.filter(p => allCafeEmails.includes(p.email) || p.cybercafe_email === selectedCafe.email);

            const filterByDate = (item: any) => {
              if (!cafeStartDate && !cafeEndDate) return true;
              const date = new Date(item.created_at);
              if (cafeStartDate) {
                const start = new Date(cafeStartDate);
                start.setHours(0, 0, 0, 0);
                if (date < start) return false;
              }
              if (cafeEndDate) {
                const end = new Date(cafeEndDate);
                end.setHours(23, 59, 59, 999);
                if (date > end) return false;
              }
              return true;
            };

            const filteredStudents = cafeStudents.filter(filterByDate);
            const filteredPending = allPending.filter(filterByDate);
            const filteredTransactions = cafeTransactions.filter(filterByDate);

            return (
              <div className="flex-1 overflow-y-auto min-h-0">
                <div className="p-6 space-y-8">
                  {cafeStudentsLoading && (
                    <p className="text-xs font-medium text-slate-500">
                      Loading students linked to this center…
                    </p>
                  )}
                  {/* Offer Letter Download Section (New Request) */}
                  <Card className="p-6 border-none bg-blue-50/50 shadow-sm">
                    <h3 className="font-black text-blue-900 text-xs uppercase tracking-widest mb-4 flex items-center gap-2">
                      <FileText className="size-4" /> Student Offer Letter Download
                    </h3>
                    <div className="flex gap-3">
                      <div className="relative flex-1">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                        <Input 
                          placeholder="Enter student email ID..." 
                          className="pl-10 h-10 bg-white border-blue-100" 
                          value={offerEmail}
                          onChange={e => setOfferEmail(e.target.value)}
                        />
                      </div>
                      <Button 
                        className="bg-blue-600 hover:bg-blue-700 font-bold gap-2"
                        onClick={handleDownloadOfferLetter}
                        disabled={processing}
                      >
                        {processing ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                        Download Letter
                      </Button>
                    </div>
                    <p className="text-[10px] text-blue-600/70 mt-2 italic font-medium">
                      Enter the registered email of any student to download their official offer letter.
                    </p>
                  </Card>

                  {/* Filter Section */}
                  <div className="flex flex-wrap items-end justify-between gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-4">
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Start Date</Label>
                        <Input type="date" className="h-8 text-xs bg-white border-slate-200" value={cafeStartDate} onChange={e => setCafeStartDate(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">End Date</Label>
                        <Input type="date" className="h-8 text-xs bg-white border-slate-200" value={cafeEndDate} onChange={e => setCafeEndDate(e.target.value)} />
                      </div>
                      <Button variant="ghost" size="sm" className="h-8 text-xs mt-5 text-slate-500" onClick={() => { setCafeStartDate(""); setCafeEndDate(""); }}>Clear Filters</Button>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase font-black tracking-widest text-emerald-600 mb-1">Registrations</div>
                      <div className="text-2xl font-black text-emerald-700">{filteredTransactions.length}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">Successful payments in range</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Shop Details */}
                    <Card className="p-4 border border-slate-100 shadow-sm space-y-4">
                      <div className="flex items-center justify-between border-b pb-2">
                        <h4 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                          <Store className="size-3" /> Shop Details
                        </h4>
                        {!isEditingCafe ? (
                          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 font-bold" onClick={() => { setIsEditingCafe(true); setEditCafeData(cyberCafeRowForEdit(selectedCafe)); }}>Edit Details</Button>
                        ) : (
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-red-500 font-bold" onClick={() => setIsEditingCafe(false)}>Cancel</Button>
                            <Button size="sm" className="h-6 text-[10px] px-2 font-bold bg-primary hover:bg-primary/90 text-white" disabled={processing} onClick={async () => {
                              setProcessing(true);
                              try {
                                const { error } = await supabase.from('cybercafe_profiles').update({
                                  shop_name: editCafeData.shop_name, owner_name: editCafeData.owner_name, email: editCafeData.email, phone: editCafeData.phone,
                                  status: editCafeData.status, rejection_reason: editCafeData.rejection_reason,
                                }).eq('id', selectedCafe.id);
                                if (error) throw error;
                                toast.success("Cyber Cafe details updated!");
                                setSelectedCafe(editCafeData);
                                setIsEditingCafe(false);
                                loadAll();
                              } catch(e: any) { toast.error(e.message); } finally { setProcessing(false); }
                            }}>
                              {processing ? <Loader2 className="size-3 animate-spin mr-1" /> : null} Save Changes
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-[10px] uppercase font-black text-muted-foreground">Shop Name</Label>
                          {isEditingCafe ? <Input className="h-7 text-xs mt-1" value={editCafeData.shop_name} onChange={e => setEditCafeData({...editCafeData, shop_name: e.target.value})} /> : <p className="text-sm font-bold">{selectedCafe.shop_name}</p>}
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase font-black text-muted-foreground">Owner Name</Label>
                          {isEditingCafe ? <Input className="h-7 text-xs mt-1" value={editCafeData.owner_name} onChange={e => setEditCafeData({...editCafeData, owner_name: e.target.value})} /> : <p className="text-sm font-bold">{selectedCafe.owner_name}</p>}
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase font-black text-muted-foreground">Email</Label>
                          {isEditingCafe ? <Input className="h-7 text-xs mt-1" value={editCafeData.email} onChange={e => setEditCafeData({...editCafeData, email: e.target.value})} /> : <p className="text-sm font-bold truncate">{selectedCafe.email}</p>}
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase font-black text-muted-foreground">Phone</Label>
                          {isEditingCafe ? <Input className="h-7 text-xs mt-1" value={editCafeData.phone} onChange={e => setEditCafeData({...editCafeData, phone: e.target.value})} /> : <p className="text-sm font-bold">{selectedCafe.phone}</p>}
                        </div>
                        <div className="col-span-2">
                          <Label className="text-[10px] uppercase font-black text-muted-foreground block mb-1">Status</Label>
                          {isEditingCafe ? (
                            <Select value={editCafeData.status} onValueChange={v => setEditCafeData({...editCafeData, status: v})}>
                              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pending_approval">Pending Approval</SelectItem>
                                  <SelectItem value="approved">Approved</SelectItem>
                                  <SelectItem value="rejected">Rejected</SelectItem>
                                </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant="outline" className={`text-[10px] font-black uppercase tracking-widest ${
                              selectedCafe.status === 'approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                              selectedCafe.status === 'rejected' ? 'bg-red-50 text-red-600 border-red-200' :
                              'bg-orange-50 text-orange-600 border-orange-200'
                            }`}>
                              {formatCyberCafeStatusLabel(selectedCafe.status)}
                            </Badge>
                          )}
                          {(!isEditingCafe && selectedCafe.status === 'rejected' && selectedCafe.rejection_reason) && (
                            <p className="text-xs text-red-600 mt-2"><strong>Reason:</strong> {selectedCafe.rejection_reason}</p>
                          )}
                          {(isEditingCafe && editCafeData.status === 'rejected') && (
                            <div className="mt-2">
                              <Label className="text-[10px] text-red-600">Rejection Reason</Label>
                              <Input className="h-7 text-xs" value={editCafeData.rejection_reason || ''} onChange={e => setEditCafeData({...editCafeData, rejection_reason: e.target.value})} />
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>

                  </div>

                  <Tabs defaultValue="transactions" className="w-full">
                    <TabsList className="grid w-full grid-cols-3 mb-4">
                      <TabsTrigger value="transactions" className="font-bold">Transactions ({filteredTransactions.length})</TabsTrigger>
                      <TabsTrigger value="students" className="font-bold">Registered Students ({filteredStudents.length})</TabsTrigger>
                      <TabsTrigger value="pending" className="font-bold">Pending / Leads ({filteredPending.length})</TabsTrigger>
                    </TabsList>

                    {/* Transactions Tab */}
                    <TabsContent value="transactions">
                      <Card className="border border-slate-100 shadow-sm">
                        <ScrollArea className="h-[300px]">
                          <Table>
                            <TableHeader className="bg-slate-50 sticky top-0">
                              <TableRow>
                                <TableHead className="text-[10px] uppercase font-black">Date</TableHead>
                                <TableHead className="text-[10px] uppercase font-black">Student Details</TableHead>
                                <TableHead className="text-[10px] uppercase font-black">Payment ID</TableHead>
                                <TableHead className="text-[10px] uppercase font-black text-right">Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredTransactions.map(tx => (
                                <TableRow key={tx.id}>
                                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(tx.created_at).toLocaleString()}</TableCell>
                                  <TableCell>
                                    <div className="font-bold text-sm">{tx.full_name}</div>
                                    <div className="text-[10px] text-muted-foreground">{tx.email}</div>
                                  </TableCell>
                                  <TableCell className="text-xs font-mono">{tx.payment_id}</TableCell>
                                  <TableCell className="text-right text-xs text-muted-foreground">Paid</TableCell>
                                </TableRow>
                              ))}
                              {filteredTransactions.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No transactions found.</TableCell></TableRow>}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      </Card>
                    </TabsContent>

                    {/* Students Tab */}
                    <TabsContent value="students">
                      <Card className="border border-slate-100 shadow-sm">
                        <ScrollArea className="h-[300px]">
                          <Table>
                            <TableHeader className="bg-slate-50 sticky top-0">
                              <TableRow>
                                <TableHead className="text-[10px] uppercase font-black">Date</TableHead>
                                <TableHead className="text-[10px] uppercase font-black">Student Details</TableHead>
                                <TableHead className="text-[10px] uppercase font-black">College</TableHead>
                                <TableHead className="text-[10px] uppercase font-black">Reg. ID</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredStudents.map(s => (
                                <TableRow key={s.id}>
                                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(s.created_at).toLocaleDateString()}</TableCell>
                                  <TableCell>
                                    <div className="font-bold text-sm">{s.full_name}</div>
                                    <div className="text-[10px] text-muted-foreground">{s.email} | {s.contact_number}</div>
                                  </TableCell>
                                  <TableCell className="text-xs font-medium">{s.college_name || '—'}</TableCell>
                                  <TableCell className="text-xs font-bold text-primary">{s.registration_id || 'Pending'}</TableCell>
                                </TableRow>
                              ))}
                              {filteredStudents.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No registered students found.</TableCell></TableRow>}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      </Card>
                    </TabsContent>

                    {/* Pending Leads Tab */}
                    <TabsContent value="pending">
                      <Card className="border border-slate-100 shadow-sm">
                        <ScrollArea className="h-[300px]">
                          <Table>
                            <TableHeader className="bg-slate-50 sticky top-0">
                              <TableRow>
                                <TableHead className="text-[10px] uppercase font-black">Date</TableHead>
                                <TableHead className="text-[10px] uppercase font-black">Lead Details</TableHead>
                                <TableHead className="text-[10px] uppercase font-black">Error Reason</TableHead>
                                <TableHead className="text-[10px] uppercase font-black text-right">Payment</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredPending.map(p => (
                                <TableRow key={p.id}>
                                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(p.created_at).toLocaleString()}</TableCell>
                                  <TableCell>
                                    <div className="font-bold text-sm">{p.full_name || p.metadata?.fullName || p.email || p.user_email}</div>
                                    <div className="text-[10px] text-muted-foreground">{p.email || p.user_email}</div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="text-[10px] text-red-600 bg-red-50 border-red-100">
                                      {p.failure_reason || p.reason || 'Payment Failed'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
                                </TableRow>
                              ))}
                              {filteredPending.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No pending leads found.</TableCell></TableRow>}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      </Card>
                    </TabsContent>

                  </Tabs>
                </div>
              </div>
            );
          })()}

          <div className="p-4 border-t bg-slate-50 flex justify-end">
            <Button variant="outline" onClick={() => setIsCafeViewOpen(false)}>Close View</Button>
          </div>
        </DialogContent>
      </Dialog>

      <footer className="py-8 bg-slate-900 text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] border-t border-slate-800">
        <div className="container mx-auto px-4 text-center">
          <p>© {new Date().getFullYear()} Apna Intern Admin. All rights reserved.</p>
        </div>
      </footer>

      {/* Must stay mounted outside dialogs so offerLetterRef works for Students directory + email download */}
      <div className="fixed left-[-10000px] top-0 pointer-events-none" aria-hidden>
        <div style={{ width: OFFER_LETTER_CAPTURE_WIDTH_PX }}>
          <OfferLetter ref={offerLetterRef} profile={offerStudent} />
        </div>
      </div>

      <AIAssignmentBuilder
        open={isAIBuilderOpen}
        onClose={() => setIsAIBuilderOpen(false)}
        onSaved={() => { loadAll(); }}
        currentUserId={currentUserId}
        unis={unis}
        colleges={colleges}
        domains={domains}
      />

      {/* Data Import Wizard Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={(open) => { if (!isImporting) setIsImportDialogOpen(open); }}>
        <DialogContent className="max-w-2xl border-none shadow-elegant p-0 overflow-hidden rounded-[2rem] bg-white">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
            <DialogHeader className="text-white">
              <DialogTitle className="flex items-center gap-2.5 text-xl font-black">
                <DatabaseBackup className="size-5" />
                Data Import Wizard — {importType === "transactions" ? "Transactions" : importType === "students" ? "Students" : "Profiles"}
              </DialogTitle>
              <DialogDescription className="text-blue-100/90 text-xs mt-1">
                Upload CSV, map your columns, and validate records against the Profile table. Matches are skipped automatically to prevent duplicates.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-6 max-h-[70vh] overflow-y-auto">
            {importStep === 1 && (
              <div className="space-y-6">
                {/* File Upload Section */}
                <div className="border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50/20 transition-all rounded-2xl p-8 text-center cursor-pointer relative group">
                  <input
                    type="file"
                    accept=".csv"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={handleImportFileChange}
                  />
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="size-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <UploadCloud className="size-6" />
                    </div>
                    {importFile ? (
                      <div>
                        <p className="font-bold text-slate-800 text-sm truncate max-w-md">{importFile.name}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{(importFile.size / 1024).toFixed(1)} KB — {importData.length} records parsed</p>
                      </div>
                    ) : (
                      <div>
                        <p className="font-bold text-slate-800 text-sm">Select CSV file to import</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Only .csv files are supported</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Column Mapping Section */}
                {importHeaders.length > 0 && importType && (
                  <Card className="p-5 border border-slate-100 shadow-soft bg-slate-50/50 rounded-2xl">
                    <h4 className="font-bold text-slate-800 text-sm mb-4 flex items-center gap-2">
                      <Settings className="size-4 text-primary" />
                      Map CSV Headers to Fields
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {expectedFields[importType].map((field) => {
                        const isRequired = field === "email" || field === "full_name" || (importType !== "transactions" && field === "contact_number");
                        return (
                          <div key={field} className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider flex items-center justify-between">
                              <span>
                                {field.replace(/_/g, " ")}
                                {isRequired && <span className="text-red-500 ml-1">*</span>}
                              </span>
                              {importMapping[field] && (
                                <Badge variant="outline" className="h-4 px-1 py-0 bg-emerald-50 text-emerald-600 border-emerald-100 text-[8px] font-bold">
                                  Mapped
                                </Badge>
                              )}
                            </Label>
                            <Select
                              value={importMapping[field] || "no-mapping"}
                              onValueChange={(val) => {
                                setImportMapping(prev => ({
                                  ...prev,
                                  [field]: val === "no-mapping" ? "" : val
                                }));
                              }}
                            >
                              <SelectTrigger className="h-9 bg-white border-slate-200 text-xs font-semibold rounded-lg shadow-sm">
                                <SelectValue placeholder="-- Select CSV Header --" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="no-mapping" className="text-xs text-muted-foreground italic">Do not import / Leave blank</SelectItem>
                                {importHeaders.map(h => (
                                  <SelectItem key={h} value={h} className="text-xs">{h}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                )}
              </div>
            )}

            {importStep === 2 && importPreview && (
              <div className="space-y-6">
                {/* Validation Stats Grid */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="p-4 rounded-2xl bg-slate-50 text-center border border-slate-100 shadow-sm">
                    <p className="text-2xl font-black text-slate-800">{importPreview.total}</p>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-black mt-1">Total Rows</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-emerald-50 text-center border border-emerald-100 shadow-sm">
                    <p className="text-2xl font-black text-emerald-600">{importPreview.ready}</p>
                    <p className="text-[9px] uppercase tracking-wider text-emerald-600/90 font-black mt-1">Ready to Import</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-amber-50 text-center border border-amber-100 shadow-sm">
                    <p className="text-2xl font-black text-amber-600">{importPreview.duplicates}</p>
                    <p className="text-[9px] uppercase tracking-wider text-amber-600/90 font-black mt-1">Duplicates Skipped</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-red-50 text-center border border-red-100 shadow-sm">
                    <p className="text-2xl font-black text-red-600">{importPreview.invalid}</p>
                    <p className="text-[9px] uppercase tracking-wider text-red-600/90 font-black mt-1">Invalid Emails</p>
                  </div>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-100 text-amber-800 text-[11px] rounded-xl flex items-start gap-2.5">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Duplicate Filter Active:</span> {importPreview.duplicates} records matched email entries in the Profile table and will be bypassed to avoid double registrations.
                  </div>
                </div>

                {/* Preview Table */}
                <div>
                  <h4 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-1.5">
                    <Eye className="size-4 text-primary" />
                    Data Preview (First 5 Rows)
                  </h4>
                  <div className="rounded-xl border overflow-hidden">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="text-[10px] font-black uppercase">Email</TableHead>
                          <TableHead className="text-[10px] font-black uppercase">Full Name</TableHead>
                          {importType !== "transactions" && <TableHead className="text-[10px] font-black uppercase">Contact</TableHead>}
                          <TableHead className="text-right text-[10px] font-black uppercase">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importPreview.records.slice(0, 5).map((rec, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-xs truncate max-w-[150px] font-semibold">{rec.email || <span className="text-muted-foreground italic">missing</span>}</TableCell>
                            <TableCell className="text-xs">{rec.data.full_name || <span className="text-muted-foreground italic">—</span>}</TableCell>
                            {importType !== "transactions" && <TableCell className="text-xs font-mono">{rec.data.contact_number || "—"}</TableCell>}
                            <TableCell className="text-right">
                              {rec.status === "ready" && (
                                <Badge className="bg-emerald-50 text-emerald-700 border-none font-bold text-[9px]">
                                  <Check className="size-3 mr-1 inline" /> Ready
                                </Badge>
                              )}
                              {rec.status === "duplicate" && (
                                <Badge className="bg-amber-50 text-amber-700 border-none font-bold text-[9px]" title={rec.reason}>
                                  <Ban className="size-3 mr-1 inline" /> Bypassed
                                </Badge>
                              )}
                              {rec.status === "invalid" && (
                                <Badge className="bg-red-50 text-red-700 border-none font-bold text-[9px]" title={rec.reason}>
                                  <XCircle className="size-3 mr-1 inline" /> Bypassed
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {importPreview.records.length > 5 && (
                    <p className="text-[10px] text-muted-foreground text-center mt-2.5 italic">
                      + {importPreview.records.length - 5} more records to process
                    </p>
                  )}
                </div>
              </div>
            )}

            {importStep === 3 && (
              <div className="space-y-6 py-6 text-center">
                {isImporting ? (
                  <div className="space-y-4">
                    <Loader2 className="size-10 animate-spin text-primary mx-auto" />
                    <div>
                      <p className="font-bold text-slate-800 text-sm">Processing Data Import...</p>
                      <p className="text-xs text-muted-foreground mt-1">Creating authentication credentials & mailing learners...</p>
                    </div>
                    <div className="max-w-md mx-auto">
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600 rounded-full transition-all duration-300" style={{ width: `${importProgress}%` }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground font-bold mt-2 uppercase">{importProgress}% Completed</p>
                    </div>
                  </div>
                ) : (
                  importResults && (
                    <div className="space-y-6">
                      <div className="size-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                        <Check className="size-8" />
                      </div>
                      <div>
                        <h3 className="font-black text-slate-800 text-lg">Import Process Completed!</h3>
                        <p className="text-xs text-muted-foreground mt-1">Target table populated and confirmation/credential emails dispatched.</p>
                      </div>

                      <div className="max-w-md mx-auto grid grid-cols-2 gap-4 border border-slate-100 p-4 rounded-2xl bg-slate-50/50">
                        <div>
                          <p className="text-3xl font-black text-emerald-600">{importResults.success}</p>
                          <p className="text-[10px] uppercase font-black text-slate-500 tracking-wider mt-1">Successfully Imported</p>
                        </div>
                        <div>
                          <p className="text-3xl font-black text-slate-800">{importResults.failed}</p>
                          <p className="text-[10px] uppercase font-black text-slate-500 tracking-wider mt-1">Failed Records</p>
                        </div>
                      </div>

                      {importResults.errors.length > 0 && (
                        <div className="text-left max-w-lg mx-auto">
                          <p className="text-xs font-bold text-red-600 mb-2">Import Errors ({importResults.errors.length}):</p>
                          <ScrollArea className="h-32 p-3 bg-red-50/50 border border-red-100 rounded-xl">
                            <ul className="list-disc list-inside text-[10px] text-red-800 space-y-1 font-mono">
                              {importResults.errors.map((err, i) => (
                                <li key={i} className="truncate" title={err}>{err}</li>
                              ))}
                            </ul>
                          </ScrollArea>
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          <DialogFooter className="p-6 bg-slate-50 border-t flex justify-end gap-3 rounded-b-[2rem]">
            {importStep === 1 && (
              <>
                <Button variant="outline" className="rounded-xl font-bold" onClick={() => setIsImportDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl gap-2"
                  disabled={processing || importData.length === 0 || !importMapping.email}
                  onClick={handleGeneratePreview}
                >
                  {processing ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
                  Verify &amp; Preview
                </Button>
              </>
            )}

            {importStep === 2 && importPreview && (
              <>
                <Button variant="outline" className="rounded-xl font-bold" disabled={isImporting} onClick={() => setImportStep(1)}>
                  Back
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl gap-2"
                  disabled={processing || isImporting || importPreview.ready === 0}
                  onClick={handleExecuteImport}
                >
                  {processing ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  Import {importPreview.ready} Records
                </Button>
              </>
            )}

            {importStep === 3 && (
              <Button
                variant="default"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl"
                disabled={isImporting}
                onClick={() => setIsImportDialogOpen(false)}
              >
                Close Wizard
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <StudentLogbookDialog
        open={isLogbookOpen}
        onOpenChange={setIsLogbookOpen}
        student={logbookStudent}
      />
    </>
  );
}
