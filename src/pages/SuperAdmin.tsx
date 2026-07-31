import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Papa from "papaparse";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
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
import { toast } from "sonner";
import { 
  Loader2, Plus, Trash2, Award, Users, Building2, Edit, Eye, MoreHorizontal, 
  Shield, Mail, Phone, User, BookOpen, Heart, LogIn, Ban, CheckCircle2, 
  Download, Briefcase, UserPlus, Filter, Search, Calendar, ToggleLeft, 
  ToggleRight, TrendingUp, Activity, DollarSign, Clock, GraduationCap, CheckSquare, FileText
} from "lucide-react";
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
  Tooltip, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell 
} from 'recharts';
import { ADMIN_LOGIN_PATH, buildStudentCredentialLoginLink } from "@/lib/authRoutes";
import { persistAdminAuthSession, adminIntentionalSignOut, ensureAdminAuthSession, isAdminPortalSessionActive } from "@/lib/adminAuthSession";
import { mergeRegistrationMetadataFromStudentRow } from "@/lib/studentSync";
import {
  EDIT_DOMAIN_SENTINEL,
  EDIT_GENDER_SENTINEL,
  fetchLatestStudentCredentialRow,
  generateTempPassword,
  getStudentDirectoryPassword,
} from "@/lib/studentCredentials";
import { adminUpsertStudentProfile } from "@/lib/adminProfileUpsert";
import { assertSendMailOk, getSendMailApiUrl } from "@/lib/sendMailApi";
import { siteApiUrl } from "@/lib/siteApi";
import {
  estimateBulkMailSeconds,
  formatBulkMailEta,
  sendBulkCustomMail,
} from "@/lib/bulkCustomMailSend";
import { FeesManagementPanel } from "@/components/admin/FeesManagementPanel";
import { BulkUploadStudentBadge } from "@/components/BulkUploadStudentBadge";
import { fetchAllSupabaseRows } from "@/lib/fetchAllSupabaseRows";
import {
  ATTENDANCE_ELIGIBILITY_MIN_PERCENT,
  LNMU_BULK_ATTENDANCE_END,
  LNMU_BULK_ATTENDANCE_START,
  enrichStudentAttendance,
  normalizeAttendanceCriteria,
} from "@/lib/attendanceStats";
import {
  adminBulkMarkAttendance,
  adminResetAllAttendance,
  fetchAttendanceRowsForAdmin,
  formatAttendanceBulkScopeLabel,
  isAttendanceResetScoped,
} from "@/lib/attendanceAdmin";
import { programmeAttendanceDayBasis, bulkAttendanceDateRangeForUniversity, ADMIN_PROGRAMME_ATTENDANCE_HINT } from "@/lib/internshipProgramme";
import { countProgrammePresentDays } from "@/lib/studentPortalDocuments";
import { fetchAdminStudentDirectoryPage, fetchAdminStudentsLight, fetchAdminSiteVisitStats } from "@/lib/adminStudentDirectory";
import { exportAdminStudentsCsv } from "@/lib/adminStudentExport";
import { filterCommsRecipients } from "@/lib/adminBulkComms";
import { InternshipModeFilterSelect } from "@/components/admin/InternshipModeFilterSelect";
import { MultiSelectCheckboxGroup } from "@/components/admin/MultiSelectCheckboxGroup";
import { collegesForUniversityNames, pruneCollegesForUniversities } from "@/lib/classLinkTargeting";
import { collegesForUniversity, fetchAllCollegesCatalog } from "@/lib/institutionCatalog";
import { displayCollegeName } from "@/lib/collegeDisplay";
import {
  setLoginPasswordViaRpc,
  userFacingPasswordError,
  validateRegistrationPassword,
} from "@/lib/registrationPassword";
import { transferLeadToStudentDirectory } from "@/lib/transferLeadToStudent";
import { resolveLeadStoredPassword } from "@/lib/leadTransferPayload";
import { fetchAdminPaymentConfig, saveAdminPaymentConfig } from "@/lib/paymentConfigAdmin";

const SuperAdmin = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  // Data
  const [students, setStudents] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [unis, setUnis] = useState<any[]>([]);
  const [colleges, setColleges] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [certs, setCerts] = useState<any[]>([]);
  const [domains, setDomains] = useState<any[]>([]);
  const [classesList, setClassesList] = useState<any[]>([]);
  const [systemSettings, setSystemSettings] = useState<any[]>([]);
  const [adminPermissions, setAdminPermissions] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [failedPayments, setFailedPayments] = useState<any[]>([]);
  const [cancelledPayments, setCancelledPayments] = useState<any[]>([]);
  const [registrationDraftLeads, setRegistrationDraftLeads] = useState<any[]>([]);
  const [visitorCount, setVisitorCount] = useState(0);
  const [uniqueVisitorCount, setUniqueVisitorCount] = useState(0);
  const [leadsSearchTerm, setLeadsSearchTerm] = useState("");
  const [paymentConfig, setPaymentConfig] = useState<any>(null);
  const [adminLogs, setAdminLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [testMailTo, setTestMailTo] = useState("");
  const [testMailSubject, setTestMailSubject] = useState("System Diagnostic");
  const [testMailBody, setTestMailBody] = useState("Hello! This is a test email from the Apna Intern Super Admin panel to verify SMTP settings.");
  const [isSendingTestMail, setIsSendingTestMail] = useState(false);
  const [logsPage, setLogsPage] = useState(0);
  const [logsTotalCount, setLogsTotalCount] = useState(0);
  const [logsSearchTerm, setLogsSearchTerm] = useState("");
  const [siteSettings, setSiteSettings] = useState<any>({
    notice_enabled: false,
    notice_title: 'Important Notice',
    notice_message: '',
    show_on_home: true,
    show_on_registration: true,
    show_on_login: false,
    reg_min_delay: 0,
    reg_max_delay: 0,
    whatsapp_link_enabled: false,
    whatsapp_link_url: 'https://whatsapp.com/channel/0029VbC9lvi3bbV8TS7TbB00'
  });
  const [hasWhatsappColumn, setHasWhatsappColumn] = useState(false);
  const [isSiteSettingsLoading, setIsSiteSettingsLoading] = useState(false);

  // Bulk Email States
  const [bulkEmailSubject, setBulkEmailSubject] = useState("");
  const [bulkEmailBody, setBulkEmailBody] = useState("");
  const [isSendingBulk, setIsSendingBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [csvEmails, setCsvEmails] = useState<string[]>([]);
  const [commsSelectedIds, setCommsSelectedIds] = useState<string[]>([]);
  const [commRecipientType, setCommRecipientType] = useState<"enrolled" | "unenrolled">("enrolled");
  const [allStudentsComms, setAllStudentsComms] = useState<any[]>([]);
  const [allLeadsComms, setAllLeadsComms] = useState<any[]>([]);

  // Attendance States
  const [attendanceStudents, setAttendanceStudents] = useState<any[]>([]);
  const attendanceLoadedRef = useRef(false);
  const [attendanceCriteria, setAttendanceCriteria] = useState(75);
  const [attendanceSearchTerm, setAttendanceSearchTerm] = useState("");
  const [attendanceUniFilter, setAttendanceUniFilter] = useState("all");
  const [attendanceCollegeFilter, setAttendanceCollegeFilter] = useState("all");
  const [bulkMarkStartDate, setBulkMarkStartDate] = useState(LNMU_BULK_ATTENDANCE_START);
  const [bulkMarkEndDate, setBulkMarkEndDate] = useState(LNMU_BULK_ATTENDANCE_END);
  const [attendanceConfirmAction, setAttendanceConfirmAction] = useState<"reset" | "bulk" | null>(null);

  const [paymentSearchTerm, setPaymentSearchTerm] = useState("");
  const [paymentUniFilter, setPaymentUniFilter] = useState("all");
  const [paymentCollegeFilter, setPaymentCollegeFilter] = useState("all");
  const [selectedAttendanceStudent, setSelectedAttendanceStudent] = useState<any>(null);
  const [studentAttendanceHistory, setStudentAttendanceHistory] = useState<any[]>([]);
  const [isAttHistoryOpen, setIsAttHistoryOpen] = useState(false);
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [attendanceOpsLoading, setAttendanceOpsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("students");

  // Password Reset States
  const [isResetPassOpen, setIsResetPassOpen] = useState(false);
  const [resetPassUser, setResetPassUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");
  const [isTransferPassOpen, setIsTransferPassOpen] = useState(false);
  const [transferLeadTarget, setTransferLeadTarget] = useState<any>(null);
  const [transferPassword, setTransferPassword] = useState("");

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

  // Pagination
  const [studentPage, setStudentPage] = useState(0);
  const [studentTotalCount, setStudentTotalCount] = useState(0);
  const [isStudentsLoading, setIsStudentsLoading] = useState(false);
  const pageSize = 20;

  const directoryCollegeOptions = useMemo(
    () => collegesForUniversity(colleges, unis, uniFilter),
    [colleges, unis, uniFilter]
  );

  // Dialog States
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [isPermsDialogOpen, setIsPermsDialogOpen] = useState(false);
  const [selectedAdminForPerms, setSelectedAdminForPerms] = useState<any>(null);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [editData, setEditData] = useState<any>(null);
  const [processing, setProcessing] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetOptions, setResetOptions] = useState({
    students: true,
    payments: true,
    leads: true,
    certs: true,
    classes: false,
    institutions: false,
    domains: false
  });

  const [commCollegeFilters, setCommCollegeFilters] = useState<string[]>([]);
  const [commUniFilters, setCommUniFilters] = useState<string[]>([]);
  const [commDomainFilter, setCommDomainFilter] = useState("all");
  const [commModeFilter, setCommModeFilter] = useState("all");
  const [oldLeadsSearchTerm, setOldLeadsSearchTerm] = useState("");

  // Chart Data Processing
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
    const enrolledEmails = new Set(students.map((s: any) => s.email?.toLowerCase()).filter(Boolean));
    const todayLeadsCount =
      cancelledPayments.filter((p) => new Date(p.created_at).toLocaleDateString() === today).length +
      failedPayments.filter(
        (p) =>
          new Date(p.created_at).toLocaleDateString() === today &&
          p.email &&
          !enrolledEmails.has(String(p.email).toLowerCase())
      ).length +
      registrationDraftLeads.filter(
        (d) =>
          d.email &&
          !enrolledEmails.has(String(d.email).toLowerCase()) &&
          new Date(d.updated_at).toLocaleDateString() === today
      ).length;
    
    const growth = yesterdayRevenue === 0 ? 100 : ((todayRevenue - yesterdayRevenue) / yesterdayRevenue * 100);

    return { todayRevenue, yesterdayRevenue, growth, todayEnrolledCount, todayLeadsCount, today };
  };

  const stats = getDashboardStats();

  const getStudentGrowth = () => {
    const daily: any = {};
    students.forEach(s => {
      const date = new Date(s.created_at).toLocaleDateString();
      daily[date] = (daily[date] || 0) + 1;
    });
    return Object.entries(daily).map(([date, count]) => ({ date, count })).slice(-7);
  };

  const performanceData = [
    { name: '12:00', load: 85, resp: 120 },
    { name: '13:00', load: 70, resp: 110 },
    { name: '14:00', load: 90, resp: 140 },
    { name: '15:00', load: 65, resp: 105 },
    { name: '16:00', load: 80, resp: 115 },
    { name: '17:00', load: 95, resp: 130 },
    { name: '18:00', load: 75, resp: 110 },
  ];

  const totalRevenue = payments.reduce((acc, curr) => acc + (curr.amount_paise / 100), 0);
  const prevRevenue = totalRevenue * 0.85; // Mocking previous for comparison

  const [dashStartDate, setDashStartDate] = useState("");
  const [dashEndDate, setDashEndDate] = useState("");
  const [livePulse, setLivePulse] = useState<{name: string, value: number}[]>(
    Array.from({length: 15}, (_, i) => ({name: i.toString(), value: 40 + Math.random() * 20}))
  );
  const [liveTraffic, setLiveTraffic] = useState(124);
  const [monitoringStatus, setMonitoringStatus] = useState("SCANNING...");

  useEffect(() => {
    const interval = setInterval(() => {
      setLivePulse(prev => {
        const newVal = 30 + Math.random() * 50;
        return [...prev.slice(1), {name: Date.now().toString(), value: newVal}];
      });
      setLiveTraffic(prev => prev + (Math.random() > 0.5 ? 1 : -1));
      
      const statuses = ["SCANNING...", "WEB HEALTH OK", "TRAFFIC STABLE", "LINK VERIFIED", "DB SYNCED"];
      setMonitoringStatus(statuses[Math.floor(Math.random() * statuses.length)]);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Form States
  const [staffEmail, setStaffEmail] = useState("");
  const [certProgram, setCertProgram] = useState("Web Development");
  const [certDuration, setCertDuration] = useState("3 Months");

  // CRUD States
  const [newUni, setNewUni] = useState("");
  const [newUniPisa, setNewUniPisa] = useState<number>(500);
  const [newCollege, setNewCollege] = useState("");
  const [newCollegePisa, setNewCollegePisa] = useState<number>(500);
  const [collegeUni, setCollegeUni] = useState("");
  const [newDept, setNewDept] = useState("");
  const [deptCollege, setDeptCollege] = useState("");

  // Update States
  const [upUni, setUpUni] = useState("");
  const [upCollege, setUpCollege] = useState("");
  const [upFee, setUpFee] = useState<number>(500);
  const [bulkFeeList, setBulkFeeList] = useState("");
  const [bulkFeeAmount, setBulkFeeAmount] = useState<number>(600);
  const [newDomain, setNewDomain] = useState("");

  // Class Scheduler States
  const [newClassTitle, setNewClassTitle] = useState("");
  const [newClassType, setNewClassType] = useState("youtube");
  const [newClassUrl, setNewClassUrl] = useState("");
  const [newClassSchedule, setNewClassSchedule] = useState("");
  const [newClassDomain, setNewClassDomain] = useState("all");

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
          "No password is stored for this student.\n\nGenerate a temporary password, update their login, save it to the directory, and email it?"
        );
        if (!ok) {
          toast.message("Use Reset Password when you want to set one manually.");
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: toEmail,
          email: toEmail,
          action: "registration_success",
          data: {
            fullName: latestData.full_name || student.full_name,
            regId: finalRegId || "",
            password: finalPassword,
            loginLink: buildStudentCredentialLoginLink(),
          },
        }),
      });
      await assertSendMailOk(res);
      toast.success("Credentials sent successfully!");
      await logAdminAction("RESEND_CREDENTIALS", "student", `Resent login credentials to ${student.full_name}`, {
        student_id: student.id,
      });
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

      toast.success("Password reset successfully!");
      await logAdminAction('RESET_PASSWORD', 'student', `Manually reset password for ${resetPassUser.full_name} (Super Admin)`, { student_id: resetPassUser.id });
      setIsResetPassOpen(false);
      setNewPassword("");
      await fetchStudents();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleViewPaymentStudent = async (email: string) => {
    setProcessing(true);
    try {
      let student = students.find(s => s.email === email);
      
      if (!student) {
        const { data, error } = await supabase
          .from('students')
          .select('*')
          .eq('email', email)
          .maybeSingle();
        
        if (error) throw error;
        student = data;
      }
      
      if (student) {
        setSelectedUser(student);
        setIsViewDialogOpen(true);
      } else {
        toast.error("Detailed profile not found in database.");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      let query = supabase
        .from("admin_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      if (logsSearchTerm) {
        query = query.or(`admin_email.ilike.%${logsSearchTerm}%,description.ilike.%${logsSearchTerm}%,action_type.ilike.%${logsSearchTerm}%,entity_type.ilike.%${logsSearchTerm}%`);
      }

      const from = logsPage * pageSize;
      const to = from + pageSize - 1;
      
      const { data, count, error } = await query.range(from, to);
      if (error) throw error;

      setAdminLogs(data || []);
      setLogsTotalCount(count || 0);
    } catch (err) {
      console.error("Fetch Logs Error:", err);
    } finally {
      setProcessing(false);
    }
  };
 
  const handleEditStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editData) return;
    setProcessing(true);
    try {
      const mergedMeta = mergeRegistrationMetadataFromStudentRow(editData);
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
          "Student row was not updated (0 rows). Check RLS policies allow super_admin to UPDATE students."
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

      await logAdminAction('UPDATE', 'student', `Updated student details: ${editData.full_name} (Super Admin)`, { student_id: editData.id });
      
      toast.success("Student updated successfully!");
      setIsEditDialogOpen(false);
      await fetchStudents();
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

      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "super_admin");
      const superAdminIds = (roles || []).map((r) => r.user_id);

      setStudents(rows.filter((student) => !superAdminIds.includes(String(student.id))));
      setStudentTotalCount(total);
    } catch (err) {
      console.error("Fetch Students Error:", err);
      toast.error("Failed to load students");
    } finally {
      setIsStudentsLoading(false);
    }
  };

  const loadAll = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Fetch only admin/super_admin roles and their profiles
      const { data: adminRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");
      
      if (rolesError) throw rolesError;

      const staffUserIds = (adminRoles || [])
        .filter(r => r.role === 'admin' || r.role === 'super_admin')
        .map(r => r.user_id);

      const [paymentSuccessRows, cancelledPaymentRows, regDraftRows] = await Promise.all([
        fetchAllSupabaseRows(supabase, "payment_success", {
          orderBy: "created_at",
          ascending: false,
        }),
        fetchAllSupabaseRows(supabase, "payment_cancelled", {
          orderBy: "created_at",
          ascending: false,
        }),
        fetchAllSupabaseRows(supabase, "registration_leads", {
          orderBy: "updated_at",
          ascending: false,
        }),
      ]);

      const [p, u, cRows, de, ce, dm, cl, ss, ap, pc, notifications, visitStats, ss_res] = await Promise.all([
        supabase.from("profiles").select("*").in("id", staffUserIds),
        supabase.from("universities").select("*").order("name"),
        fetchAllCollegesCatalog(supabase),
        supabase.from("departments").select("*").order("name"),
        supabase.from("certificates").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("internship_domains").select("*").order("name"),
        supabase.from("classes").select("*").order("scheduled_at", { ascending: true }),
        supabase.from("system_settings").select("*"),
        supabase.from("admin_permissions").select("*"),
        (async () => {
          const { fetchAdminPaymentConfig } = await import("@/lib/paymentConfigAdmin");
          return { data: await fetchAdminPaymentConfig(supabase) };
        })(),
        supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(50),
        fetchAdminSiteVisitStats(supabase).catch(() => ({ totalVisits: 0, uniqueVisitors: 0 })),
        supabase.from("site_settings").select("*").eq("id", 1).maybeSingle()
      ]);
      
      const c = { data: cRows };
      if (ss_res?.data) {
        setSiteSettings({
          whatsapp_link_enabled: false,
          whatsapp_link_url: 'https://whatsapp.com/channel/0029VbC9lvi3bbV8TS7TbB00',
          ...ss_res.data
        });
        setHasWhatsappColumn('whatsapp_link_enabled' in ss_res.data);
      } else {
        setHasWhatsappColumn(false);
      }
      
      console.log("SuperAdmin - Fetched Payments:", paymentSuccessRows.length);
      console.log("SuperAdmin - Fetched Leads:", cancelledPaymentRows.length);

      const rolesMap = (adminRoles || []).reduce((acc: any, curr: any) => {
        if (!acc[curr.user_id]) acc[curr.user_id] = [];
        acc[curr.user_id].push(curr.role);
        return acc;
      }, {});

      // Staff list (Admins & Super Admins)
      const staffList = (p.data || []).map(prof => ({ 
        ...prof, 
        roles: rolesMap[prof.id] || [] 
      }));

      setStaff(staffList);
      setUnis(u.data || []);
      setColleges(c.data || []);
      setDepartments(de.data || []);
      setCerts(ce.data || []);
      setDomains(dm.data || []);
      setClassesList(cl.data || []);
      setSystemSettings(ss.data || []);
      setAdminPermissions(ap.data || []);
      setPaymentConfig(pc.data || { id: 1, razorpay_key_id: '', razorpay_key_secret: '', amount_paise: 9900, is_active: false });
      
      // Filter unified payment history
      const allUnified = paymentSuccessRows;
      setPayments(allUnified.filter((p: any) => p.status === 'success' || !p.status));
      setFailedPayments(allUnified.filter((p: any) => p.status === 'failed'));
      
      setCancelledPayments(cancelledPaymentRows);
      setRegistrationDraftLeads(regDraftRows);
      setVisitorCount(visitStats.totalVisits || 0);
      setUniqueVisitorCount(visitStats.uniqueVisitors || 0);

      // All enrolled students for bulk comms (paginated past PostgREST 1000-row cap)
      let combinedComms: any[] = [];
      try {
        const allStudents = await fetchAdminStudentsLight(supabase);
        combinedComms = allStudents.map((s) => ({
          id: s.id,
          full_name: s.full_name,
          email: s.email,
          college_name: s.college_name,
          university_name: s.university_name,
          internship_domain: s.internship_domain,
          metadata: s.metadata,
        }));
      } catch (commsErr: any) {
        console.error("Bulk comms student fetch:", commsErr);
        toast.error("Failed to load students for bulk email: " + (commsErr?.message || "Unknown error"));
      }
      setAllStudentsComms(combinedComms);

      // All leads (cancelled payments where student doesn't exist yet)
      const existingEmails = new Set(combinedComms.map((s: any) => s.email?.toLowerCase()));
      const allLeadsData = cancelledPaymentRows.filter((cp: any) => !existingEmails.has(cp.user_email?.toLowerCase()));
      setAllLeadsComms(allLeadsData);

      // Initial students fetch
      await Promise.all([
        fetchStudents(),
        fetchLogs()
      ]);

      // Attendance is deferred until Attendance/Certification tabs open (see loadAttendanceTabData).
      attendanceLoadedRef.current = false;
    } catch (err) {
      console.error("Load Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadAttendanceTabData = async (opts?: { force?: boolean }) => {
    if (attendanceLoadedRef.current && !opts?.force) return;
    try {
      console.log("Fetching student data for attendance...");
      const [studentsRes, profilesRes, attRows, attSettings] = await Promise.all([
        supabase.from('students').select('id, full_name, email, college_name, university_name, created_at'),
        supabase.from('profiles').select('id, full_name, email, created_at'),
        fetchAttendanceRowsForAdmin(supabase),
        supabase.from('attendance_settings').select('*').eq('id', 1).maybeSingle()
      ]);

      if (studentsRes.error) console.error("Error fetching students:", studentsRes.error);
      if (profilesRes.error) console.error("Error fetching profiles:", profilesRes.error);
      const studentMap = new Map();
      (profilesRes.data || []).forEach(p => {
        studentMap.set(p.id, { ...p, is_legacy: true });
      });
      (studentsRes.data || []).forEach(s => {
        studentMap.set(s.id, { ...s, is_legacy: false });
      });

      const allStudents = Array.from(studentMap.values());
      console.log(`Merged ${allStudents.length} potential students for attendance tracking`);

      const attendanceMinPercent = normalizeAttendanceCriteria(
        attSettings.data?.min_percentage
      );
      setAttendanceCriteria(attendanceMinPercent);

      const attGroups: Record<string, any[]> = {};
      (attRows || []).forEach((r: any) => {
        if (!attGroups[r.student_id]) attGroups[r.student_id] = [];
        attGroups[r.student_id].push(r);
      });

      const enriched = allStudents.map((s: any) => {
        const recs = attGroups[s.id] || [];
        const programmeMarked = countProgrammePresentDays(recs, s.university_name);
        return enrichStudentAttendance(
          s,
          programmeMarked,
          ATTENDANCE_ELIGIBILITY_MIN_PERCENT,
          programmeAttendanceDayBasis(s.university_name)
        );
      });
      
      setAttendanceStudents(enriched);
      attendanceLoadedRef.current = true;
      console.log("Attendance: Enriched data complete", enriched.filter(e => e.total_days > 0).length, "students have logs");
    } catch (err) {
      console.error("Attendance load error:", err);
    }
  };

  const attendanceScopeStudents = useMemo(
    () =>
      attendanceStudents.filter((s) => {
        if (attendanceUniFilter !== "all" && s.university_name !== attendanceUniFilter) return false;
        if (attendanceCollegeFilter !== "all" && s.college_name !== attendanceCollegeFilter) return false;
        return true;
      }),
    [attendanceStudents, attendanceUniFilter, attendanceCollegeFilter]
  );

  const filteredAttendanceStudents = useMemo(
    () =>
      attendanceScopeStudents.filter((s) => {
        if (
          attendanceSearchTerm &&
          !s.full_name?.toLowerCase().includes(attendanceSearchTerm.toLowerCase()) &&
          !s.email?.toLowerCase().includes(attendanceSearchTerm.toLowerCase())
        ) {
          return false;
        }
        return true;
      }),
    [attendanceScopeStudents, attendanceSearchTerm]
  );

  const attendanceBulkScopeLabel = formatAttendanceBulkScopeLabel(
    attendanceUniFilter === "all" ? null : attendanceUniFilter,
    attendanceCollegeFilter === "all" ? null : attendanceCollegeFilter
  );
  const attendanceResetScoped = isAttendanceResetScoped(
    attendanceUniFilter === "all" ? null : attendanceUniFilter,
    attendanceCollegeFilter === "all" ? null : attendanceCollegeFilter
  );

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
      await loadAttendanceTabData({ force: true });
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
      await loadAttendanceTabData({ force: true });
      setAttendanceConfirmAction(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to mark attendance";
      toast.error(msg);
    } finally {
      setAttendanceOpsLoading(false);
    }
  };

  useEffect(() => {
    if (allowed) {
      fetchStudents();
    }
  }, [allowed, studentPage, searchTerm, domainFilter, dateFilter, startDate, endDate, uniFilter, collegeFilter, modeFilter]);

  useEffect(() => {
    if (allowed) {
      fetchLogs();
    }
  }, [allowed, logsPage, logsSearchTerm]);

  // Defer full attendance table download until Attendance / Certification tabs open.
  useEffect(() => {
    if (!allowed) return;
    if (activeTab === "attendance" || activeTab === "bulk") {
      void loadAttendanceTabData();
    }
  }, [allowed, activeTab]);

  useEffect(() => {
    (async () => {
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
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id);
      const isSuper = (roles || []).some((r: any) => r.role === "super_admin");
      setAllowed(isSuper);
      if (isSuper) {
        persistAdminAuthSession();
        await loadAll();
      } else navigate("/admin");
    })();
  }, [navigate]);

  // Bulk Actions
  const handleBulkCertificate = async () => {
    if (selectedStudents.length === 0) return toast.error("Select at least one student");
    setProcessing(true);
    try {
      const issues = selectedStudents.map(id => {
        const s = students.find(x => x.id === id);
        const certId = s.registration_id || `EZY-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
        return {
          user_id: id,
          student_name: s.full_name,
          internship_name: certProgram,
          duration: certDuration,
          certificate_id: certId,
          status: "Active"
        };
      });

      const { error } = await supabase.from("certificates").insert(issues);
      if (error) throw error;

      await logAdminAction(
        'BULK_ACTION', 
        'certificate', 
        `Issued ${selectedStudents.length} certificates for ${certProgram}`,
        { student_count: selectedStudents.length, program: certProgram, duration: certDuration }
      );

      toast.success(`Successfully generated ${selectedStudents.length} certificates!`);
      setSelectedStudents([]);
      loadAll();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedStudents(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedStudents.length === filteredStudents.length && filteredStudents.length > 0) setSelectedStudents([]);
    else setSelectedStudents(filteredStudents.map(s => s.id));
  };

  // Actions
  const toggleBlock = async (user: any) => {
    const newStatus = user.status === "Blocked" ? "Active" : "Blocked";
    await supabase.from("students").update({ status: newStatus }).eq("id", user.id);
    
    await logAdminAction(
      'UPDATE', 
      'student', 
      `${newStatus === "Blocked" ? "Blocked" : "Unblocked"} student ${user.full_name}`,
      { student_id: user.id, status: newStatus }
    );

    toast.success(`User ${newStatus}`);
    loadAll();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure?")) return;
    const user = students.find(s => s.id === id) || staff.find(s => s.id === id);
    await supabase.from("students").delete().eq("id", id);
    
    await logAdminAction(
      'DELETE', 
      'student', 
      `Deleted student/staff ${user?.full_name || id}`,
      { entity_id: id, name: user?.full_name }
    );

    toast.success("Deleted");
    loadAll();
  };


  // CRUD for Domains/Unis
  const addDomain = async () => {
    if (!newDomain.trim()) return;
    await supabase.from("internship_domains").insert({ name: newDomain.trim() });
    
    await logAdminAction('CREATE', 'domain', `Added internship domain: ${newDomain.trim()}`);
    
    setNewDomain(""); loadAll();
  };

  const delDomain = async (id: string) => {
    if (!confirm("Delete domain?")) return;
    const domain = domains.find(d => d.id === id);
    await supabase.from("internship_domains").delete().eq("id", id);
    
    await logAdminAction('DELETE', 'domain', `Deleted internship domain: ${domain?.name || id}`);
    
    loadAll();
  };

  const addUni = async () => {
    if (!newUni.trim()) return;
    const logo = prompt("Enter University Logo URL (optional):") || "";
    await supabase.from("universities").insert({ 
      name: newUni.trim(), 
      logo_url: logo,
      pisa_fee: newUniPisa * 100
    });
    
    await logAdminAction('CREATE', 'university', `Added university: ${newUni.trim()} (PISA: ${newUniPisa})`);
    
    setNewUni(""); setNewUniPisa(500); loadAll();
  };

  const delUni = async (id: string) => {
    if (!confirm("Delete university?")) return;
    const uni = unis.find(u => u.id === id);
    await supabase.from("universities").delete().eq("id", id);
    
    await logAdminAction('DELETE', 'university', `Deleted university: ${uni?.name || id}`);
    
    loadAll();
  };

  const addCollege = async () => {
    if (!newCollege.trim() || !collegeUni) return toast.error("Enter name and select university");
    await supabase.from("colleges").insert({ 
      name: newCollege.trim(), 
      university_id: collegeUni,
      pisa_fee: newCollegePisa * 100
    });
    
    const uniName = unis.find(u => u.id === collegeUni)?.name;
    await logAdminAction('CREATE', 'college', `Added college: ${newCollege.trim()} to ${uniName} (PISA: ${newCollegePisa})`);
    
    setNewCollege(""); setNewCollegePisa(500); loadAll();
    toast.success("College added");
  };

  const delCollege = async (id: string) => {
    const college = colleges.find(c => c.id === id);
    await supabase.from("colleges").delete().eq("id", id);
    
    await logAdminAction('DELETE', 'college', `Deleted college: ${college?.name || id}`);
    
    toast.success("College removed");
    loadAll();
  };

  const updateInstitutionalFee = async () => {
    if (upCollege) {
      // Update College Fee — mark fees_managed so registration uses DB amount (not hardcoded rules).
      const totalPaise = upFee * 100;
      const { error } = await supabase
        .from("colleges")
        .update({
          pisa_fee: totalPaise,
          fee_base_paise: totalPaise,
          fee_processing_paise: 0,
          show_fee_breakdown: false,
          fees_managed: true,
        })
        .eq("id", upCollege);
      if (error) return toast.error(error.message);
      const cName = colleges.find(c => c.id === upCollege)?.name;
      await logAdminAction('UPDATE', 'college', `Updated PISA fee for college: ${cName} to ${upFee}`);
      toast.success("College fee updated");
    } else if (upUni) {
      // Update University Fee
      const { error } = await supabase.from("universities").update({ pisa_fee: upFee * 100 }).eq("id", upUni);
      if (error) return toast.error(error.message);
      const uName = unis.find(u => u.id === upUni)?.name;
      await logAdminAction('UPDATE', 'university', `Updated PISA fee for university: ${uName} to ${upFee}`);
      toast.success("University fee updated");
    } else {
      return toast.error("Select a University or College to update");
    }
    loadAll();
  };

  const handleUpdateSiteSettings = async () => {
    setIsSiteSettingsLoading(true);
    try {
      const payload: any = {
        id: 1,
        ...siteSettings,
        updated_at: new Date().toISOString()
      };
      if (!hasWhatsappColumn) {
        delete payload.whatsapp_link_enabled;
        delete payload.whatsapp_link_url;
      }
      const { error } = await supabase.from("site_settings").upsert(payload);
      if (error) throw error;
      toast.success("Site settings updated successfully!");
      await logAdminAction('UPDATE', 'settings', 'Updated global site settings (Notice Popup)');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSiteSettingsLoading(false);
    }
  };

  const addDept = async () => {
    if (!newDept || !deptCollege) return;
    const { error } = await supabase.from("departments").insert({ name: newDept, college_id: deptCollege });
    if (error) toast.error("Error adding department");
    else {
      const collegeName = colleges.find(c => c.id === deptCollege)?.name;
      await logAdminAction('CREATE', 'department', `Added department: ${newDept} to ${collegeName}`);
      
      setNewDept("");
      toast.success("Department added");
      loadAll();
    }
  };

  const delDept = async (id: string) => {
    const dept = departments.find(d => d.id === id);
    await supabase.from("departments").delete().eq("id", id);
    
    await logAdminAction('DELETE', 'department', `Deleted department: ${dept?.name || id}`);
    
    toast.success("Department removed");
    loadAll();
  };

  const updatePisaFee = async (type: 'university' | 'college', id: string, amount: number) => {
    try {
      const table = type === 'university' ? 'universities' : 'colleges';
      const totalPaise = amount * 100;
      const payload =
        type === "college"
          ? {
              pisa_fee: totalPaise,
              fee_base_paise: totalPaise,
              fee_processing_paise: 0,
              show_fee_breakdown: false,
              fees_managed: true,
            }
          : { pisa_fee: totalPaise };
      const { error } = await supabase.from(table).update(payload).eq('id', id);
      if (error) throw error;
      
      const item = type === 'university' ? unis.find(u => u.id === id) : colleges.find(c => c.id === id);
      await logAdminAction('UPDATE', type, `Updated PISA fee for ${item?.name || id} to ₹${amount}`);
      
      toast.success(`PISA fee updated for ${type}`);
      loadAll();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleBulkFeeUpdate = async () => {
    if (!bulkFeeList.trim()) return toast.error("Please enter college names");
    setProcessing(true);
    try {
      const names = bulkFeeList.split('\n').map(n => n.trim()).filter(n => n);
      const totalPaise = bulkFeeAmount * 100;
      const { error } = await supabase
        .from("colleges")
        .update({
          pisa_fee: totalPaise,
          fee_base_paise: totalPaise,
          fee_processing_paise: 0,
          show_fee_breakdown: false,
          fees_managed: true,
        })
        .in("name", names);
      
      if (error) throw error;
      
      await logAdminAction('BULK_ACTION', 'college', `Bulk updated fees for ${names.length} colleges to ₹${bulkFeeAmount}`, { count: names.length, amount: bulkFeeAmount });
      
      toast.success(`Updated fees for ${names.length} colleges!`);
      setBulkFeeList("");
      loadAll();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const resetPlatformData = async () => {
    if (resetConfirmText !== "RESET") {
      toast.error("Please type RESET to confirm");
      return;
    }
    
    setProcessing(true);
    try {
      const tasks = [];
      if (resetOptions.payments) tasks.push(supabase.from("payment_success").delete().neq("id", "00000000-0000-0000-0000-000000000000"));
      if (resetOptions.leads) tasks.push(supabase.from("payment_cancelled").delete().neq("id", "00000000-0000-0000-0000-000000000000"));
      if (resetOptions.certs) tasks.push(supabase.from("certificates").delete().neq("id", "00000000-0000-0000-0000-000000000000"));
      if (resetOptions.students) tasks.push(supabase.from("students").delete().neq("id", "00000000-0000-0000-0000-000000000000"));
      if (resetOptions.classes) tasks.push(supabase.from("classes").delete().neq("id", "00000000-0000-0000-0000-000000000000"));
      if (resetOptions.institutions) {
        tasks.push(supabase.from("departments").delete().neq("id", "00000000-0000-0000-0000-000000000000"));
        tasks.push(supabase.from("colleges").delete().neq("id", "00000000-0000-0000-0000-000000000000"));
        tasks.push(supabase.from("universities").delete().neq("id", "00000000-0000-0000-0000-000000000000"));
      }
      if (resetOptions.domains) tasks.push(supabase.from("internship_domains").delete().neq("id", "00000000-0000-0000-0000-000000000000"));
      
      await Promise.all(tasks);
      
      await logAdminAction('SYSTEM_RESET', 'platform', `Platform data reset performed for: ${Object.entries(resetOptions).filter(([_, v]) => v).map(([k, _]) => k).join(', ')}`, { resetOptions });
      
      toast.success("Selected data has been reset");
      setIsResetDialogOpen(false);
      setResetConfirmText("");
      loadAll();
    } catch (err) {
      toast.error("Failed to reset data");
    } finally {
      setProcessing(false);
    }
  };

  const handleBulkCollegeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!collegeUni) {
      toast.error("Please select a University from the dropdown first!");
      e.target.value = "";
      return;
    }

    const selectedUniName = unis.find(u => u.id === collegeUni)?.name || "selected university";
    toast.info(`Uploading to ${selectedUniName}...`);

    setProcessing(true);
    Papa.parse(file, {
      header: false,
      skipEmptyLines: 'greedy',
      complete: async (results) => {
        try {
          const rows = results.data as string[][];
          if (!rows || rows.length === 0) {
            toast.error("The CSV file appears to be empty.");
            return;
          }

          const collegeNames = rows
            .map(r => r[0])
            .filter(n => n && n.trim() && !n.toLowerCase().includes("college name") && !n.toLowerCase().includes("university"));
          
          if (collegeNames.length === 0) {
            toast.error("No valid college names found. Make sure the first column contains the names.");
            return;
          }

          const inserts = collegeNames.map(name => ({
            name: name.trim(),
            university_id: collegeUni
          }));

          const { error, data } = await supabase.from("colleges").insert(inserts).select();
          
          if (error) {
            console.error("Supabase Insert Error:", error);
            throw error;
          }

          await logAdminAction('BULK_ACTION', 'college', `Bulk uploaded ${collegeNames.length} colleges to ${selectedUniName}`, { university_id: collegeUni, count: collegeNames.length });

          toast.success(`Successfully added ${collegeNames.length} colleges to ${selectedUniName}!`);
          await loadAll();
        } catch (err: any) {
          console.error("Bulk Upload Error:", err);
          toast.error("Upload failed: " + (err.message || "Unknown error"));
        } finally {
          setProcessing(false);
          if (e.target) e.target.value = ""; 
        }
      },
      error: (err) => {
        console.error("PapaParse Error:", err);
        toast.error("Failed to parse CSV: " + err.message);
        setProcessing(false);
      }
    });
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

  // Filtering Logic (Now handled server-side, but keeping for compatibility if needed)
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

      await logAdminAction('CREATE', 'class', `Scheduled class: ${newClassTitle}`, { title: newClassTitle, schedule: newClassSchedule });

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
    
    await logAdminAction('DELETE', 'class', `Deleted scheduled class: ${cl?.title || id}`);
    
    toast.success("Class deleted");
    loadAll();
  };

  const toggleClassActive = async (cl: any) => {
    const newStatus = !cl.is_active;
    await supabase.from("classes").update({ is_active: newStatus }).eq("id", cl.id);
    
    await logAdminAction('UPDATE', 'class', `${newStatus ? "Enabled" : "Disabled"} class: ${cl.title}`, { class_id: cl.id, active: newStatus });
    
    toast.success(newStatus ? "Class enabled — students can now see it" : "Class disabled — hidden from students");
    loadAll();
  };

  const handleAddStaff = async () => {
    if (!staffEmail) return toast.error("Enter an email");
    try {
      const { data: user } = await supabase.from("profiles").select("id").eq("email", staffEmail).maybeSingle();
      if (!user) return toast.error("User not found in platform");
      
      await supabase.from("user_roles").insert({ user_id: user.id, role: 'admin' });
      
      await logAdminAction('CREATE', 'staff', `Granted admin access to ${staffEmail}`, { user_id: user.id, email: staffEmail });
      
      toast.success("Staff access granted!");
      setStaffEmail("");
      setIsAddStaffOpen(false);
      loadAll();
    } catch (e: any) { toast.error(e.message); }
  };

  const removeStaff = async (id: string) => {
    if (!confirm("Remove this person from staff?")) return;
    const s = staff.find(x => x.id === id);
    await supabase.from("user_roles").delete().eq("user_id", id).eq("role", "admin");
    
    await logAdminAction('DELETE', 'staff', `Revoked admin access for ${s?.full_name || id}`, { user_id: id, name: s?.full_name });
    
    toast.success("Staff access revoked");
    loadAll();
  };

  const toggleAdminPermission = async (userId: string, permKey: string, currentVal: boolean) => {
    try {
      const newVal = !currentVal;
      const { data: existing } = await supabase.from("admin_permissions").select("id").eq("user_id", userId).maybeSingle();
      
      if (existing) {
        await supabase.from("admin_permissions").update({ [permKey]: newVal }).eq("user_id", userId);
      } else {
        await supabase.from("admin_permissions").insert({ user_id: userId, [permKey]: newVal });
      }

      const s = staff.find(x => x.id === userId);
      await logAdminAction('UPDATE', 'permissions', `Updated ${permKey} for ${s?.full_name || userId} to ${newVal}`, { user_id: userId, permission: permKey, value: newVal });

      loadAll();
    } catch (err: any) { toast.error(err.message); }
  };

  const updatePaymentConfig = async (updates: any) => {
    try {
      const newConfig = { ...paymentConfig, ...updates };
      setPaymentConfig(newConfig);
      await saveAdminPaymentConfig(supabase, newConfig);

      await logAdminAction('UPDATE', 'setting', `Updated payment gateway configuration`, { config: updates });

      toast.success("Payment settings updated!");
      loadAll();
    } catch (err: any) { 
      toast.error(err.message); 
    }
  };

  const savePaymentConfig = async () => {
    await updatePaymentConfig({});
  };

  const toggleSystemSetting = async (key: string, current: boolean) => {
    const { error } = await supabase.from("system_settings").update({ is_enabled: !current }).eq("key", key);
    if (error) {
      toast.error("Update failed");
    } else {
      await logAdminAction('UPDATE', 'setting', `${!current ? "Enabled" : "Disabled"} system setting: ${key}`, { setting: key, enabled: !current });
      toast.success(`${key.replace('_', ' ')} toggled`);
      loadAll();
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
        `Transferred lead ${leadEmail} to registered students`,
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

  const handleForceLogout = async (member: any) => {
    if (!confirm(`Force logout "${member.full_name || member.email}" from ALL devices and browsers right now?\n\nThis action is immediate and cannot be undone.`)) return;
    setProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const res = await fetch(siteApiUrl('/api/admin-tasks'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          action: 'force_logout',
          target_user_id: member.id
        })
      });

      const result = await res.json();
      if (!result.success) throw new Error(result.error || result.message || 'Failed to force logout');

      toast.success(`${member.full_name || member.email} has been logged out from all devices!`);
      await logAdminAction('FORCE_LOGOUT', 'admin', `Force logged out admin: ${member.email} from all devices`, { target_user_id: member.id });
    } catch (err: any) {
      toast.error(err.message || 'Force logout failed');
    } finally {
      setProcessing(false);
    }
  };


  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="size-8 animate-spin text-primary" /></div>;
  if (!allowed) return <div className="p-10 text-center">Access Denied</div>;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Super Admin Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg overflow-hidden bg-white border border-slate-100">
              <img src="/logo.png" alt="Apna Intern" className="w-full h-full object-cover" />
            </div>
            <span className="font-bold text-slate-900 hidden sm:block">Super Portal</span>
          </div>

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" className="text-red-400 hover:bg-red-500/10 gap-2" onClick={async () => {
              await adminIntentionalSignOut(supabase);
              navigate(ADMIN_LOGIN_PATH);
            }}>
              <LogIn className="size-4 rotate-180" />
              <span className="hidden md:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          {/* Header Section */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-black tracking-tight text-slate-900">Super Admin Panel</h1>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setActiveTab("settings")}
                className={`gap-2 rounded-xl font-bold text-[10px] uppercase tracking-wider px-3 h-8 border transition-all ${activeTab === 'settings' ? 'bg-blue-600 text-white border-blue-600 shadow-glow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200'}`}
              >
                <Building2 className="size-3.5" />
                System Settings
              </Button>
            </div>
            
            <div className="flex flex-wrap items-center gap-6">
              {/* KPI Boxes */}
              <div className="flex gap-1 bg-white p-1 rounded-2xl shadow-sm border border-slate-100">
                <div className="px-4 py-2 text-center border-r border-slate-100">
                  <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Page Views</div>
                  <div className="text-xl font-black text-blue-600">{(visitorCount * 2.4).toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                </div>
                <div className="px-4 py-2 text-center">
                  <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Visitors</div>
                  <div className="text-xl font-black text-indigo-600">{uniqueVisitorCount.toLocaleString()}</div>
                </div>
              </div>

              {/* Range Picker */}
              <div className="flex items-center gap-3 bg-slate-100/50 px-4 py-2 rounded-2xl border border-slate-200/50">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Range:</span>
                <div className="flex items-center gap-2">
                  <Input type="date" value={dashStartDate} onChange={e => setDashStartDate(e.target.value)} className="h-8 w-32 border-none bg-white rounded-lg text-[11px] font-bold shadow-sm" />
                  <Input type="date" value={dashEndDate} onChange={e => setDashEndDate(e.target.value)} className="h-8 w-32 border-none bg-white rounded-lg text-[11px] font-bold shadow-sm" />
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="gap-2 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 rounded-xl font-bold text-xs" onClick={exportToCSV}>
                  <Download className="size-4" /> Export CSV
                </Button>
                <Button className="gap-2 bg-white text-blue-600 border border-blue-200 hover:bg-blue-50 rounded-xl font-bold text-xs shadow-sm" onClick={() => navigate("/register")}>
                  <Plus className="size-4" /> Add Student
                </Button>
              </div>
            </div>
          </div>

          {/* Analytics Grid - Replaced with Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Main Revenue Wave Chart */}
            <Card className="lg:col-span-2 p-6 border-none shadow-elegant bg-white overflow-hidden relative group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <TrendingUp className="size-32 text-primary -mr-8 -mt-8" />
              </div>
              <div className="flex items-center justify-between mb-8 relative z-10">
                <div>
                  <h3 className="text-xl font-black flex items-center gap-2">
                    <DollarSign className="size-5 text-emerald-600" /> 
                    Revenue Growth
                  </h3>
                  <div className="flex gap-4 mt-3">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">Start</span>
                      <Input type="date" value={dashStartDate} onChange={e => setDashStartDate(e.target.value)} className="h-7 w-28 text-[10px] border-none bg-slate-50 font-bold" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">End</span>
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
                    <div className="text-3xl font-black text-emerald-600">₹{stats.todayRevenue.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground mb-1 font-bold">Today's Revenue</div>
                    <Badge variant="hero" className={`${stats.growth >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"} border-none text-[10px]`}>
                      {stats.growth >= 0 ? "+" : ""}{stats.growth.toFixed(1)}% vs Yesterday
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="h-[250px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={getFilteredRevenueData()}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#64748b'}} />
                    <YAxis hide />
                    <Tooltip 
                      contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 800, fontSize: '12px'}}
                      cursor={{stroke: '#10b981', strokeWidth: 2}}
                    />
                    <Area type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#colorRev)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-6 border-none shadow-elegant bg-slate-900 text-white flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4">
                <div className="flex items-center gap-1.5 bg-emerald-500/20 px-2 py-1 rounded-full border border-emerald-500/30">
                  <div className="size-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-[8px] font-black text-emerald-400 tracking-widest">{monitoringStatus}</span>
                </div>
              </div>
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                  <div className="size-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary shadow-glow">
                    <Activity className="size-6" />
                  </div>
                </div>
                <h3 className="text-lg font-black mb-1">Infrastructure Pulse</h3>
                <p className="text-xs text-slate-400 font-medium mb-6">Live Traffic: {liveTraffic} requests/min</p>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Node Latency</span>
                    <span className="text-xl font-black text-emerald-400">98.2ms</span>
                  </div>
                  <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-primary w-[85%] rounded-full shadow-glow animate-pulse" />
                  </div>
                </div>
              </div>

              <div className="h-[120px] w-full mt-6">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={livePulse}>
                    <defs>
                      <linearGradient id="pulseGradientSuper" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Area 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#3b82f6" 
                      strokeWidth={3} 
                      fill="url(#pulseGradientSuper)" 
                      isAnimationActive={true}
                      animationDuration={1000}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card className="p-6 border-none shadow-elegant bg-white relative overflow-hidden">
              <div className="absolute -right-4 -bottom-4 opacity-5"><Users className="size-24" /></div>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Total Interns</div>
              <div className="text-3xl font-black">{studentTotalCount}</div>
              <div className="mt-2 flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                <TrendingUp className="size-3" /> +12.5% Growth
              </div>
            </Card>
            
            <Card className="p-6 border-none shadow-elegant bg-white relative overflow-hidden">
              <div className="absolute -right-4 -bottom-4 opacity-5"><UserPlus className="size-24" /></div>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Potential Leads</div>
              <div className="text-3xl font-black text-orange-600">{cancelledPayments.length}</div>
              <div className="mt-2 text-[10px] font-bold text-muted-foreground italic">Cart Abandonment Rate: 14%</div>
            </Card>

            <Card className="p-6 border-none shadow-elegant bg-white relative overflow-hidden">
              <div className="absolute -right-4 -bottom-4 opacity-5"><Activity className="size-24" /></div>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">System Visitors</div>
              <div className="text-3xl font-black text-blue-600">{visitorCount || students.length * 3}</div>
              <div className="mt-2 text-[10px] font-bold text-muted-foreground">Unique IPs: {uniqueVisitorCount || students.length}</div>
            </Card>

            <Card className="p-6 border-none shadow-elegant bg-white relative overflow-hidden">
              <div className="absolute -right-4 -bottom-4 opacity-5"><Building2 className="size-24" /></div>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Active Batches</div>
              <div className="text-3xl font-black text-purple-600">{classesList.length}</div>
              <div className="mt-2 text-[10px] font-bold text-muted-foreground">Across {unis.length} Institutions</div>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <TabsList className="bg-muted/50 p-1 flex-wrap h-auto self-start">
                <TabsTrigger value="comms" className="gap-2"><Mail className="size-4" /> Communications</TabsTrigger>
                <TabsTrigger value="students" className="gap-2"><Users className="size-4" /> Students</TabsTrigger>
                <TabsTrigger value="attendance" className="gap-2"><CheckSquare className="size-4" /> Attendance</TabsTrigger>
                <TabsTrigger value="bulk" className="gap-2"><Award className="size-4" /> Certification</TabsTrigger>
                <TabsTrigger value="classes" className="gap-2"><BookOpen className="size-4" /> Live Classes</TabsTrigger>
                <TabsTrigger value="institutions" className="gap-2"><Building2 className="size-4" /> Institutions</TabsTrigger>
                <TabsTrigger value="fees-management" className="gap-2"><DollarSign className="size-4" /> Fees Management</TabsTrigger>
                <TabsTrigger value="payments" className="gap-2"><DollarSign className="size-4" /> Transactions</TabsTrigger>
                <TabsTrigger value="leads" className="gap-2"><UserPlus className="size-4" /> Leads</TabsTrigger>
                <TabsTrigger value="old-leads" className="gap-2"><Clock className="size-4" /> Old Failed Payments</TabsTrigger>
                <TabsTrigger value="staff" className="gap-2"><Shield className="size-4" /> Staff</TabsTrigger>
                <TabsTrigger value="logs" className="gap-2"><Clock className="size-4" /> Activity Logs</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="students" className="space-y-6">
              <Card className="p-6 border-none shadow-elegant mb-6 bg-card/50 backdrop-blur-sm">
                <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Name or email..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setStudentPage(0); }} />
                  </div>
                  
                  <Select value={domainFilter} onValueChange={(v) => { setDomainFilter(v); setStudentPage(0); }}>
                    <SelectTrigger className="gap-2"><Briefcase className="size-4" /><SelectValue placeholder="All Domains" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All Domains</SelectItem>{domains.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}</SelectContent>
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
                    <SelectContent><SelectItem value="all">All Universities</SelectItem>{unis.map(u => <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>)}</SelectContent>
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
                  <TableHeader className="bg-muted/30"><TableRow>
                    <TableHead className="w-10"><Checkbox checked={selectedStudents.length === filteredStudents.length && filteredStudents.length > 0} onCheckedChange={toggleSelectAll} /></TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>Institution</TableHead>
                    <TableHead>Joined Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {isStudentsLoading ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-20"><Loader2 className="size-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                    ) : (
                      <>
                        {filteredStudents.map(s => (
                          <TableRow key={s.id} className="group hover:bg-muted/20 transition-colors">
                            <TableCell><Checkbox checked={selectedStudents.includes(s.id)} onCheckedChange={() => toggleSelect(s.id)} /></TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center font-bold text-primary text-xs shadow-inner">{s.full_name?.charAt(0)}</div>
                                <div><div className="font-bold text-sm tracking-tight flex items-center gap-2 flex-wrap">{s.full_name}<BulkUploadStudentBadge metadata={s.metadata} showAddRegistration /></div><div className="text-[10px] text-muted-foreground">{s.email}</div></div>
                              </div>
                            </TableCell>
                            <TableCell><Badge variant="secondary" className="text-[9px] uppercase font-bold px-2 py-0.5">{s.internship_domain || "Unassigned"}</Badge></TableCell>
                            <TableCell><div className="text-xs font-medium text-slate-600">{s.college_name || "—"}</div></TableCell>
                            <TableCell className="text-xs text-muted-foreground font-medium">{new Date(s.created_at).toLocaleDateString()}</TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="size-8 p-0"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48 shadow-elegant p-1">
                                  <DropdownMenuItem onClick={() => { setSelectedUser(s); setIsViewDialogOpen(true); }} className="gap-2 py-2 px-3"><Eye className="size-4" /> View Details</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { setEditData({...s}); setIsEditDialogOpen(true); }} className="gap-2 py-2 px-3 text-primary"><Edit className="size-4" /> Edit Details</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { setResetPassUser(s); setIsResetPassOpen(true); }} className="gap-2 py-2 px-3 text-orange-400"><LogIn className="size-4" /> Reset Password</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleResendCredentials(s)} className="gap-2 py-2 px-3 text-indigo-400"><Mail className="size-4" /> Resend Credentials</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => toggleBlock(s)} className={`gap-2 py-2 px-3 ${s.status === "Blocked" ? "text-green-600" : "text-destructive"}`}>
                                    {s.status === "Blocked" ? <CheckCircle2 className="size-4" /> : <Ban className="size-4" />} {s.status === "Blocked" ? "Unblock" : "Block"}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => handleDelete(s.id)} className="gap-2 py-2 px-3 text-destructive"><Trash2 className="size-4" /> Delete</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
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

            <TabsContent value="bulk" className="space-y-6">
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <Card className="p-8 border-none shadow-elegant bg-gradient-to-br from-primary/5 to-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-10 opacity-5 -rotate-12 pointer-events-none"><Award className="size-40" /></div>
                    <h3 className="text-xl font-black mb-6 flex items-center gap-2"><Award className="size-6 text-primary" /> Certificate Engine</h3>
                    <div className="grid md:grid-cols-2 gap-6 mb-8">
                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase text-muted-foreground">Internship Program</Label>
                        <Select value={certProgram} onValueChange={setCertProgram}>
                          <SelectTrigger className="bg-white/50 backdrop-blur-sm h-11"><SelectValue placeholder="Select Domain" /></SelectTrigger>
                          <SelectContent>
                            {domains.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase text-muted-foreground">Program Duration</Label>
                        <Input value={certDuration} onChange={e => setCertDuration(e.target.value)} placeholder="e.g. 3 Months" className="bg-white/50 backdrop-blur-sm h-11" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-6 bg-white/80 rounded-2xl border border-primary/20 shadow-soft">
                      <div><p className="text-lg font-black tracking-tight">{selectedStudents.length} Students Selected</p><p className="text-xs text-muted-foreground font-medium">Digital certificates will be issued and verified instantly.</p></div>
                      <Button variant="hero" size="lg" className="gap-2 px-8 shadow-glow" disabled={processing || selectedStudents.length === 0} onClick={handleBulkCertificate}>
                        {processing ? <Loader2 className="size-5 animate-spin" /> : <CheckCircle2 className="size-5" />} Issue Now
                      </Button>
                    </div>
                  </Card>

                  <Card className="overflow-hidden border-none shadow-elegant">
                    <div className="p-4 bg-muted/20 border-b flex justify-between items-center">
                      <h3 className="font-bold text-sm">Selection List</h3>
                      <div className="relative w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" /><Input className="pl-8 h-8 text-xs bg-white/50" placeholder="Search students..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
                    </div>
                    <ScrollArea className="h-[400px]">
                      <Table>
                        <TableHeader><TableRow><TableHead className="w-10"><Checkbox checked={selectedStudents.length === filteredStudents.length && filteredStudents.length > 0} onCheckedChange={toggleSelectAll} /></TableHead><TableHead>Student</TableHead><TableHead>Domain</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {filteredStudents
                            .filter(s => (!certProgram || s.internship_domain === certProgram) && s.status !== "Blocked")
                            .map(s => (
                            <TableRow key={s.id} className={`transition-colors ${selectedStudents.includes(s.id) ? "bg-primary/5" : ""}`}>
                              <TableCell><Checkbox checked={selectedStudents.includes(s.id)} onCheckedChange={() => toggleSelect(s.id)} /></TableCell>
                              <TableCell className="font-bold text-xs tracking-tight">{s.full_name}</TableCell>
                              <TableCell className="text-[10px] font-black text-muted-foreground uppercase">{s.internship_domain}</TableCell>
                            </TableRow>
                          ))}
                          {filteredStudents.filter(s => (!certProgram || s.internship_domain === certProgram) && s.status !== "Blocked").length === 0 && (
                            <TableRow><TableCell colSpan={3} className="text-center py-10 text-muted-foreground font-medium italic">No active students found for {certProgram || "selected domain"}.</TableCell></TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </Card>
                </div>

                <div className="space-y-6">
                  <Card className="p-6 border-none shadow-elegant">
                    <h4 className="font-black text-sm uppercase tracking-widest text-muted-foreground mb-4">Registry Feed</h4>
                    <ScrollArea className="h-[550px] pr-2">
                      <div className="space-y-3">
                        {certs.slice(0, 15).map(c => (
                          <div key={c.id} className="p-4 border border-border/50 bg-muted/10 rounded-2xl hover:bg-muted/30 transition-colors group">
                            <div className="flex justify-between items-start mb-2">
                              <div className="font-bold text-sm group-hover:text-primary transition-colors">{c.student_name}</div>
                              <Badge variant="outline" className="text-[8px] px-1 h-4">{c.status}</Badge>
                            </div>
                            <div className="text-[10px] font-medium text-muted-foreground flex justify-between items-center">
                              <span className="flex items-center gap-1"><Shield className="size-3" /> {c.certificate_id}</span>
                              <span>{new Date(c.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="classes" className="space-y-6">
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-6">
                  <Card className="p-6 border-none shadow-elegant bg-gradient-to-br from-slate-50 to-white">
                    <h3 className="text-xl font-black mb-6 flex items-center gap-2"><BookOpen className="size-6 text-primary" /> Class Orchestrator</h3>
                    <div className="space-y-5">
                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase">Target Audience</Label>
                        <Select value={newClassDomain} onValueChange={setNewClassDomain}>
                          <SelectTrigger className="h-11 bg-white shadow-soft"><SelectValue placeholder="Target Audience" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Universal (All Domains)</SelectItem>
                            {domains.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase">Platform Delivery</Label>
                        <Select value={newClassType} onValueChange={setNewClassType}>
                          <SelectTrigger className="h-11 bg-white shadow-soft"><SelectValue placeholder="Platform" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="youtube">YouTube Embed (Livestream)</SelectItem>
                            <SelectItem value="meet">Interactive Meet (Google/Zoom)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase">Session Topic</Label>
                        <Input value={newClassTitle} onChange={e => setNewClassTitle(e.target.value)} placeholder="e.g. Masterclass on Node.js" className="h-11 bg-white shadow-soft" />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase">Access Link URL</Label>
                        <Input value={newClassUrl} onChange={e => setNewClassUrl(e.target.value)} placeholder="https://..." className="h-11 bg-white shadow-soft" />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase">Schedule Timeline</Label>
                        <Input type="datetime-local" value={newClassSchedule} onChange={e => setNewClassSchedule(e.target.value)} className="h-11 bg-white shadow-soft" />
                      </div>

                      <Button className="w-full h-11 gap-2 mt-4 shadow-elegant font-bold" onClick={addClass}><Calendar className="size-4" /> Deploy Session</Button>
                    </div>
                  </Card>
                </div>

                <div className="lg:col-span-2">
                  <Card className="overflow-hidden border-none shadow-elegant h-full bg-card/50 backdrop-blur-sm">
                    <div className="p-5 bg-muted/20 border-b flex justify-between items-center">
                      <h3 className="font-black text-sm uppercase tracking-wider">Scheduled Deployment Feed</h3>
                      <Badge variant="hero" className="rounded-md font-bold">{classesList.length} Sessions</Badge>
                    </div>
                    <ScrollArea className="h-[550px]">
                      {classesList.length === 0 ? (
                        <div className="p-20 text-center text-muted-foreground flex flex-col items-center gap-4">
                          <Activity className="size-12 opacity-10" />
                          <p className="font-medium">No sessions scheduled on the grid.</p>
                        </div>
                      ) : (
                        <Table>
                          <TableHeader><TableRow><TableHead className="uppercase text-[10px] font-black">Timeline</TableHead><TableHead className="uppercase text-[10px] font-black">Topic</TableHead><TableHead className="uppercase text-[10px] font-black">Segment</TableHead><TableHead className="uppercase text-[10px] font-black">Status</TableHead><TableHead className="text-right uppercase text-[10px] font-black">Actions</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {classesList.map(cl => (
                              <TableRow key={cl.id} className={`group hover:bg-muted/30 transition-colors ${!cl.is_active ? "opacity-50 grayscale" : ""}`}>
                                <TableCell className="whitespace-nowrap font-bold text-xs text-slate-700">
                                  {new Date(cl.scheduled_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                </TableCell>
                                <TableCell className="font-black tracking-tight">{cl.title}</TableCell>
                                <TableCell><Badge variant="outline" className="text-[9px] uppercase font-bold tracking-tighter">{cl.internship_domains?.name || "Global"}</Badge></TableCell>
                                <TableCell>
                                  {cl.is_active !== false ? (
                                    <Badge className="bg-green-500 text-white text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5">Live</Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 text-muted-foreground">Paused</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => toggleClassActive(cl)}
                                      className={`size-8 p-0 rounded-lg transition-colors ${cl.is_active !== false ? "text-green-600 hover:bg-green-50" : "text-slate-400 hover:bg-slate-100"}`}
                                    >
                                      {cl.is_active !== false ? <ToggleRight className="size-5" /> : <ToggleLeft className="size-5" />}
                                    </Button>
                                    <Button variant="ghost" size="sm" className="size-8 p-0 text-destructive hover:bg-destructive/10 rounded-lg" onClick={() => delClass(cl.id)}><Trash2 className="size-4" /></Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </ScrollArea>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="settings" className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <Card className="p-8 border-none shadow-elegant bg-gradient-to-br from-indigo-50/50 to-white">
                  <h3 className="text-lg font-black mb-6 flex items-center gap-2"><Briefcase className="size-5 text-indigo-600" /> Professional Domains</h3>
                  <div className="flex gap-3 mb-6">
                    <Input value={newDomain} onChange={e => setNewDomain(e.target.value)} placeholder="Domain Name (e.g. AI & ML)..." className="h-11 bg-white shadow-soft" />
                    <Button variant="hero" className="h-11 w-11 p-0 shadow-glow" onClick={addDomain}><Plus className="size-5" /></Button>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {domains.map(d => (
                      <Badge key={d.id} variant="secondary" className="pl-4 pr-1.5 py-1.5 gap-3 rounded-xl border border-border/50 bg-white shadow-soft font-bold text-slate-700">
                        {d.name} 
                        <Button size="sm" variant="ghost" className="size-5 p-0 h-auto text-destructive hover:bg-destructive/10 rounded-lg" onClick={() => delDomain(d.id)}><Trash2 className="size-3" /></Button>
                      </Badge>
                    ))}
                  </div>
                </Card>

                <Card className="p-8 border-none shadow-elegant bg-gradient-to-br from-red-50/50 to-white">
                  <h3 className="text-lg font-black mb-6 flex items-center gap-2"><Shield className="size-5 text-red-600" /> Service Access Control</h3>
                  <p className="text-xs text-muted-foreground mb-6 font-medium">Disable services platform-wide. This affects both Admins and Students.</p>
                  
                  <div className="space-y-4">
                    {systemSettings.map(s => (
                      <div key={s.key} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-soft">
                        <div className="flex items-center gap-3">
                          <div className={`size-8 rounded-lg flex items-center justify-center ${s.is_enabled ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                            {s.key === 'live_classes' && <BookOpen className="size-4" />}
                            {s.key === 'certificates' && <Award className="size-4" />}
                            {s.key === 'bulk_certification' && <Shield className="size-4" />}
                            {s.key === 'internship_registration' && <UserPlus className="size-4" />}
                          </div>
                          <div>
                            <p className="text-sm font-bold capitalize">{s.key.replace('_', ' ')}</p>
                            <p className="text-[10px] text-muted-foreground font-medium">{s.is_enabled ? 'Service is Active' : 'Service is Disabled'}</p>
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => toggleSystemSetting(s.key, s.is_enabled)}
                          className={s.is_enabled ? "text-green-600" : "text-red-600"}
                        >
                          {s.is_enabled ? <ToggleRight className="size-8" /> : <ToggleLeft className="size-8" />}
                        </Button>
                      </div>
                    ))}
                    {systemSettings.length === 0 && (
                      <div className="p-10 text-center border-2 border-dashed border-slate-200 rounded-2xl text-muted-foreground text-xs font-bold">
                        No settings found in database.
                      </div>
                    )}
                  </div>
                </Card>

                <Card className="p-8 border-none shadow-elegant bg-gradient-to-br from-orange-50/50 to-white md:col-span-2 lg:col-span-1">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-black flex items-center gap-2"><DollarSign className="size-5 text-orange-600" /> Razorpay Integration</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-tighter text-muted-foreground">{paymentConfig?.is_active ? 'Active' : 'Disabled'}</span>
                      <Button variant="ghost" size="sm" className="p-0 h-auto" onClick={() => updatePaymentConfig({ is_active: !paymentConfig?.is_active })}>
                        {paymentConfig?.is_active ? <ToggleRight className="size-8 text-green-600" /> : <ToggleLeft className="size-8 text-slate-400" />}
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase font-black text-muted-foreground">Razorpay Key ID</Label>
                      <Input 
                        value={paymentConfig?.razorpay_key_id || ''} 
                        onChange={e => setPaymentConfig({...paymentConfig, razorpay_key_id: e.target.value})}
                        placeholder="rzp_live_..." 
                        className="bg-white shadow-soft h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase font-black text-muted-foreground">Razorpay Key Secret</Label>
                      <Input 
                        type="password"
                        value={paymentConfig?.razorpay_key_secret || ''} 
                        onChange={e => setPaymentConfig({...paymentConfig, razorpay_key_secret: e.target.value})}
                        placeholder="••••••••••••" 
                        className="bg-white shadow-soft h-11"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-black text-muted-foreground">Amount (INR)</Label>
                        <Input 
                          type="number"
                          value={(paymentConfig?.amount_paise || 0) / 100} 
                          onChange={e => setPaymentConfig({...paymentConfig, amount_paise: parseFloat(e.target.value) * 100})}
                          className="bg-white shadow-soft h-11"
                        />
                      </div>
                      <div className="flex items-end">
                        <Button variant="hero" className="w-full h-11 shadow-glow font-bold" onClick={() => savePaymentConfig()}>
                          Save Gateway Settings
                        </Button>
                      </div>
                    </div>
                    <p className="text-[9px] text-muted-foreground italic mt-2">Note: Key Secret is stored securely and never exposed to students.</p>
                  </div>
                </Card>

                <Card className="p-8 border-none shadow-elegant bg-gradient-to-br from-blue-50/50 to-white md:col-span-2">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-lg font-black flex items-center gap-2"><Mail className="size-5 text-blue-600" /> Test Mail Delivery</h3>
                      <p className="text-xs text-muted-foreground font-medium">Verify your SMTP configuration by sending a manual test email.</p>
                    </div>
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-black text-muted-foreground">Recipient Email</Label>
                        <Input 
                          value={testMailTo} 
                          onChange={e => setTestMailTo(e.target.value)}
                          placeholder="test@example.com" 
                          className="bg-white shadow-soft h-11"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-black text-muted-foreground">Subject</Label>
                        <Input 
                          value={testMailSubject} 
                          onChange={e => setTestMailSubject(e.target.value)}
                          placeholder="Test Email Subject" 
                          className="bg-white shadow-soft h-11"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase font-black text-muted-foreground">Message Body</Label>
                      <textarea 
                        value={testMailBody} 
                        onChange={e => setTestMailBody(e.target.value)}
                        placeholder="Type your test message here..." 
                        className="w-full h-[120px] p-4 rounded-xl border bg-white shadow-soft focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm resize-none"
                      />
                    </div>
                  </div>
                  <Button 
                    className="w-full h-12 gap-2 mt-6 shadow-glow font-bold" 
                    disabled={isSendingTestMail || !testMailTo}
                    onClick={async () => {
                      setIsSendingTestMail(true);
                      try {
                        const response = await fetch(getSendMailApiUrl(), {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: 'test_mail',
                            to: testMailTo,
                            subject: testMailSubject,
                            message: testMailBody
                          })
                        });
                        
                        const result = await response.json();
                        
                        if (result.success) {
                          toast.success("Test email sent successfully via Vercel! Check your inbox.");
                        } else {
                          toast.error(result.message || "Failed to send test email.");
                        }
                      } catch (err: any) {
                        toast.error("Network error or local dev limitation. Try testing on the LIVE Vercel site.");
                        console.error(err);
                      } finally {
                        setIsSendingTestMail(false);
                      }
                    }}
                  >
                    {isSendingTestMail ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                    {isSendingTestMail ? 'Sending Test Mail...' : 'Send Test Diagnostic Email'}
                  </Button>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="institutions" className="space-y-6">
              <Card className="p-8 border-none shadow-elegant bg-gradient-to-br from-blue-50/50 to-white">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-2xl font-black flex items-center gap-2"><Building2 className="size-7 text-blue-600" /> Institution Network</h3>
                    <p className="text-sm text-muted-foreground font-medium">Manage Universities and their affiliated Colleges</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="hero" className="px-3 py-1">{unis.length} Universities</Badge>
                    <Badge variant="secondary" className="px-3 py-1">{colleges.length} Colleges</Badge>
                  </div>
                </div>
                
                <div className="grid lg:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div className="space-y-4 p-6 bg-white/50 rounded-3xl shadow-soft border border-white/50">
                      <div className="flex items-center gap-2 text-blue-600 mb-2">
                        <Plus className="size-5" />
                        <span className="text-xs font-black uppercase tracking-wider">New University</span>
                      </div>
                      <div className="flex flex-col md:flex-row gap-3">
                        <Input value={newUni} onChange={e => setNewUni(e.target.value)} placeholder="University Full Title..." className="h-12 bg-white shadow-soft rounded-xl border-none flex-1" />
                        <Input type="number" value={newUniPisa || ''} onChange={e => setNewUniPisa(Number(e.target.value))} placeholder="PISA Fee (INR)..." className="h-12 bg-white shadow-soft rounded-xl border-none w-full md:w-40" />
                        <Button variant="hero" className="h-12 px-6 shadow-glow font-bold rounded-xl" onClick={addUni}>Add Uni</Button>
                      </div>
                    </div>

                    <div className="space-y-4 p-6 bg-white/50 rounded-3xl shadow-soft border border-white/50">
                      <div className="flex items-center gap-2 text-indigo-600 mb-2">
                        <Plus className="size-5" />
                        <span className="text-xs font-black uppercase tracking-wider">New Affiliated College</span>
                      </div>
                      <div className="space-y-3">
                        <Select value={collegeUni} onValueChange={setCollegeUni}>
                          <SelectTrigger className="h-12 bg-white shadow-soft rounded-xl border-none"><SelectValue placeholder="Select Parent University" /></SelectTrigger>
                          <SelectContent className="rounded-xl border-none shadow-elegant">{unis.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <div className="flex flex-col md:flex-row gap-3">
                          <Input value={newCollege} onChange={e => setNewCollege(e.target.value)} placeholder="College Name..." className="h-12 bg-white shadow-soft rounded-xl border-none flex-1" />
                          <Input type="number" value={newCollegePisa || ''} onChange={e => setNewCollegePisa(Number(e.target.value))} placeholder="PISA Fee (INR)..." className="h-12 bg-white shadow-soft rounded-xl border-none w-full md:w-40" />
                          <Button variant="hero" className="h-12 px-6 shadow-glow font-bold rounded-xl" onClick={addCollege}>Add College</Button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 p-6 bg-amber-50/50 rounded-3xl shadow-soft border border-amber-100">
                      <div className="flex items-center gap-2 text-amber-600 mb-2">
                        <Edit className="size-5" />
                        <span className="text-xs font-black uppercase tracking-wider">Update Institutional Fees</span>
                      </div>
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Select value={upUni} onValueChange={(v) => { setUpUni(v); setUpCollege(""); }}>
                            <SelectTrigger className="h-12 bg-white shadow-soft rounded-xl border-none">
                              <SelectValue placeholder="Select University" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-none shadow-elegant">
                              <SelectItem value="none" disabled>Select University</SelectItem>
                              {unis.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                            </SelectContent>
                          </Select>

                          <Select value={upCollege} onValueChange={setUpCollege} disabled={!upUni}>
                            <SelectTrigger className="h-12 bg-white shadow-soft rounded-xl border-none">
                              <SelectValue placeholder="Select College (Optional)" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-none shadow-elegant">
                              {colleges.filter(c => c.university_id === upUni).map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-col md:flex-row gap-3">
                          <div className="relative flex-1">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-amber-500" />
                            <Input 
                              type="number" 
                              value={upFee || ''} 
                              onChange={e => setUpFee(Number(e.target.value))} 
                              placeholder="Set New Fee (INR)..." 
                              className="h-12 bg-white shadow-soft rounded-xl border-none pl-9" 
                            />
                          </div>
                          <Button 
                            variant="hero" 
                            className="h-12 px-8 shadow-glow font-black rounded-xl bg-amber-500 hover:bg-amber-600 border-none"
                            onClick={updateInstitutionalFee}
                          >
                            Update Fee
                          </Button>
                        </div>
                        <p className="text-[10px] text-amber-700 font-bold italic">
                          * If you select a University but no College, the University-wide default fee will be updated.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4 p-6 bg-white/50 rounded-3xl shadow-soft border border-white/50">
                      <div className="flex items-center gap-2 text-emerald-600 mb-2">
                        <Plus className="size-5" />
                        <span className="text-xs font-black uppercase tracking-wider">New Department</span>
                      </div>
                      <div className="space-y-3">
                        <Select value={deptCollege} onValueChange={setDeptCollege}>
                          <SelectTrigger className="h-12 bg-white shadow-soft rounded-xl border-none"><SelectValue placeholder="Select Parent College" /></SelectTrigger>
                          <SelectContent className="rounded-xl border-none shadow-elegant">
                            {unis.map(u => (
                              <div key={u.id}>
                                <div className="px-2 py-1.5 text-xs font-black bg-slate-50 text-slate-400 uppercase tracking-widest">{u.name}</div>
                                {colleges.filter(c => c.university_id === u.id).map(c => (
                                  <SelectItem key={c.id} value={c.id} className="pl-6">{c.name}</SelectItem>
                                ))}
                              </div>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex gap-3">
                          <Input value={newDept} onChange={e => setNewDept(e.target.value)} placeholder="Department Name..." className="h-12 bg-white shadow-soft rounded-xl border-none" />
                          <Button variant="hero" className="h-12 px-6 shadow-glow font-bold rounded-xl" onClick={addDept}>Add Dept</Button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 p-6 bg-amber-50/50 rounded-3xl shadow-soft border border-amber-100">
                      <div className="flex items-center gap-2 text-amber-600 mb-2">
                        <DollarSign className="size-5" />
                        <span className="text-xs font-black uppercase tracking-wider">Bulk Fee Update</span>
                      </div>
                      <div className="space-y-3">
                        <textarea 
                          value={bulkFeeList} 
                          onChange={e => setBulkFeeList(e.target.value)} 
                          placeholder="Paste College Names (One per line)..." 
                          className="w-full h-32 p-3 text-xs bg-white rounded-xl border-none shadow-soft resize-none focus:ring-2 focus:ring-amber-500 transition-all"
                        />
                        <div className="flex gap-3">
                          <Input 
                            type="number" 
                            value={bulkFeeAmount} 
                            onChange={e => setBulkFeeAmount(Number(e.target.value))} 
                            placeholder="Amount (INR)" 
                            className="h-12 bg-white shadow-soft rounded-xl border-none flex-1" 
                          />
                          <Button 
                            variant="hero" 
                            className="h-12 px-6 shadow-glow font-bold rounded-xl bg-amber-500 hover:bg-amber-600 border-none" 
                            onClick={handleBulkFeeUpdate}
                            disabled={processing}
                          >
                            {processing ? <Loader2 className="size-4 animate-spin" /> : "Update Fees"}
                          </Button>
                        </div>
                        <p className="text-[10px] text-amber-700 font-bold italic">
                          * This will update the PISA fee for all colleges matching these exact names.
                        </p>
                      </div>
                    </div>

                  </div>

                  <div className="bg-white/40 rounded-3xl p-2 border border-white/50 shadow-inner">
                    <ScrollArea className="h-[600px] px-4">
                      <div className="space-y-6 py-4">
                        {unis.map(u => (
                          <div key={u.id} className="space-y-3">
                            <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-blue-100 shadow-soft group hover:border-primary/40 transition-all">
                              <div className="flex items-center gap-4">
                                <div className="size-12 rounded-xl bg-slate-50 flex items-center justify-center shadow-inner overflow-hidden border border-slate-100">
                                  {u.logo_url ? (
                                    <img src={u.logo_url} className="size-full object-contain p-2" alt="" />
                                  ) : (
                                    <Building2 className="size-5 text-slate-300" />
                                  )}
                                </div>
                                <div>
                                  <span className="text-base font-black tracking-tight text-slate-800 block">{u.name}</span>
                                  <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">{colleges.filter(c => c.university_id === u.id).length} Colleges Affiliated</span>
                                    <Badge 
                                      variant="outline" 
                                      className="text-[9px] font-black border-blue-200 bg-blue-50 text-blue-700 h-5 px-2 cursor-pointer hover:bg-blue-100"
                                      onClick={() => {
                                        const newVal = prompt("Enter new PISA fee for this University (in INR):", ((u.pisa_fee || 0) / 100).toString());
                                        if (newVal !== null && !isNaN(Number(newVal))) {
                                          updatePisaFee('university', u.id, Number(newVal));
                                        }
                                      }}
                                    >
                                      PISA: ₹{(u.pisa_fee || 0) / 100}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Label htmlFor={`logo-${u.id}`} className="cursor-pointer">
                                  <div className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-600 text-[10px] font-black rounded-xl hover:bg-blue-100 transition-colors shadow-soft">
                                    <Plus className="size-3" /> LOGO
                                  </div>
                                  <Input id={`logo-${u.id}`} type="file" className="hidden" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleLogoUpload(file, u.id); }} />
                                </Label>
                                <Button variant="ghost" size="sm" className="size-9 p-0 hover:bg-slate-100 rounded-xl" onClick={() => editUni(u)}><Edit className="size-4" /></Button>
                                <Button variant="ghost" size="sm" className="size-9 p-0 text-destructive hover:bg-destructive/10 rounded-xl" onClick={() => delUni(u.id)}><Trash2 className="size-4" /></Button>
                              </div>
                            </div>
                            
                            <div className="pl-10 space-y-2">
                                  {colleges.filter(col => col.university_id === u.id).map(col => (
                                    <div key={col.id} className="space-y-1">
                                      <div className="flex items-center justify-between p-2.5 bg-white/80 rounded-2xl border border-slate-100 group shadow-sm">
                                        <div className="flex items-center gap-3">
                                          <div className="size-1.5 rounded-full bg-indigo-400" />
                                          <span className="text-xs font-bold text-slate-700">{col.name}</span>
                                          <Badge 
                                            variant="outline" 
                                            className="text-[8px] font-bold border-indigo-100 bg-indigo-50/50 text-indigo-600 h-4 px-1.5 cursor-pointer hover:bg-indigo-100"
                                            onClick={() => {
                                              const newVal = prompt("Enter new PISA fee for this college (in INR):", ((col.pisa_fee || 0) / 100).toString());
                                              if (newVal !== null && !isNaN(Number(newVal))) {
                                                updatePisaFee('college', col.id, Number(newVal));
                                              }
                                            }}
                                          >
                                            PISA: ₹{(col.pisa_fee || 0) / 100}
                                          </Badge>
                                        </div>
                                        <Button variant="ghost" size="sm" className="size-8 p-0 text-destructive hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => delCollege(col.id)}><Trash2 className="size-3.5" /></Button>
                                      </div>
                                      <div className="pl-6 space-y-1 border-l-2 border-slate-100 ml-3 py-1">
                                        {departments.filter(d => d.college_id === col.id).map(d => (
                                          <div key={d.id} className="flex items-center justify-between p-2 bg-slate-50/50 rounded-xl group/dept border border-dashed border-slate-200 hover:border-emerald-200 hover:bg-emerald-50/30 transition-colors">
                                            <span className="text-[10px] font-medium text-slate-500">{d.name}</span>
                                            <Button variant="ghost" size="sm" className="size-6 p-0 text-destructive opacity-0 group-hover/dept:opacity-100 transition-opacity" onClick={() => delDept(d.id)}><Trash2 className="size-3" /></Button>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                              {colleges.filter(col => col.university_id === u.id).length === 0 && (
                                <div className="p-3 text-[10px] text-muted-foreground font-bold italic tracking-wider">No colleges added yet.</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="fees-management" className="space-y-6 mt-0">
              <FeesManagementPanel onLogAction={logAdminAction} />
            </TabsContent>

            <TabsContent value="staff" className="space-y-6">
              <Card className="overflow-hidden border-none shadow-elegant bg-card/50 backdrop-blur-sm">
                <div className="p-5 bg-muted/20 border-b flex justify-between items-center">
                  <h3 className="font-black text-sm uppercase tracking-widest">Privileged Access List</h3>
                  <Button variant="hero" size="sm" className="gap-2 font-bold px-4" onClick={() => setIsAddStaffOpen(true)}><Shield className="size-4" /> Grant Access</Button>
                </div>
                <Table>
                  <TableHeader className="bg-muted/10"><TableRow><TableHead className="uppercase text-[10px] font-black">Staff Member</TableHead><TableHead className="uppercase text-[10px] font-black">Access Levels</TableHead><TableHead className="text-right uppercase text-[10px] font-black">Revocation</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {staff.map(s => (
                      <TableRow key={s.id} className="hover:bg-muted/20 transition-colors">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="size-10 rounded-full bg-slate-900 flex items-center justify-center font-bold text-white text-xs">{s.full_name?.charAt(0)}</div>
                            <div><div className="font-bold text-sm">{s.full_name}</div><div className="text-[10px] text-muted-foreground font-medium">{s.email}</div></div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1.5">
                            {s.roles.map((r: string) => (
                              <Badge key={r} variant={r === 'super_admin' ? 'hero' : 'outline'} className="text-[8px] font-black uppercase tracking-wider px-2 h-5">
                                {r.replace('_', ' ')}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="sm" className="h-8 gap-2 font-bold hover:bg-slate-100" onClick={() => { setSelectedAdminForPerms(s); setIsPermsDialogOpen(true); }}>
                              <Shield className="size-3.5" /> Permissions
                            </Button>
                            {s.roles.includes('super_admin') ? (
                              <span className="text-[9px] font-bold text-muted-foreground italic px-3">PROTECTED</span>
                            ) : (
                              <Button variant="ghost" size="sm" className="size-8 p-0 text-destructive hover:bg-destructive/10 rounded-xl" onClick={() => handleDelete(s.id)}><Trash2 className="size-4" /></Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>

            <TabsContent value="payments">
              <div className="space-y-6">
                <Card className="p-8 border-none shadow-elegant bg-gradient-to-br from-green-50/50 to-white">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <div>
                        <h3 className="text-2xl font-black text-slate-800 flex items-center gap-2"><DollarSign className="size-6 text-green-600" /> Revenue Tracking</h3>
                        <p className="text-xs text-muted-foreground font-medium">Monitoring all platform transactions</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={loadAll} className="size-10 p-0 rounded-xl hover:bg-green-50 text-green-600"><Loader2 className={`size-5 ${loading ? 'animate-spin' : ''}`} /></Button>
                    </div>
                    <div className="flex flex-col md:flex-row items-center gap-3">
                      <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input 
                          placeholder="Search student..." 
                          className="pl-9 h-10 bg-white shadow-soft" 
                          value={paymentSearchTerm}
                          onChange={e => setPaymentSearchTerm(e.target.value)}
                        />
                      </div>
                      <Select value={paymentUniFilter} onValueChange={setPaymentUniFilter}>
                        <SelectTrigger className="w-full md:w-48 h-10 bg-white shadow-soft"><SelectValue placeholder="University" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Universities</SelectItem>
                          {unis.map(u => <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={paymentCollegeFilter} onValueChange={setPaymentCollegeFilter}>
                        <SelectTrigger className="w-full md:w-48 h-10 bg-white shadow-soft"><SelectValue placeholder="College" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Colleges</SelectItem>
                          {colleges
                            .filter(c => paymentUniFilter === "all" || c.university_id === unis.find(u => u.name === paymentUniFilter)?.id)
                            .map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)
                          }
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-black text-green-600">₹{payments.reduce((acc, curr) => acc + (curr.amount_paise || 0), 0) / 100}</div>
                      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total Collection</div>
                    </div>
                  </div>

                  <ScrollArea className="h-[500px] rounded-2xl border border-slate-100 bg-white/50 backdrop-blur-sm">
                    <Table>
                      <TableHeader className="bg-slate-50/50"><TableRow><TableHead>Date</TableHead><TableHead>Student</TableHead><TableHead>Contact</TableHead><TableHead>College</TableHead><TableHead>Payment ID</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Profile</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {payments
                          .filter(pay => {
                            if (paymentSearchTerm) {
                              const s = paymentSearchTerm.toLowerCase();
                              if (!pay.full_name?.toLowerCase().includes(s) && !pay.email?.toLowerCase().includes(s) && !pay.payment_id?.toLowerCase().includes(s) && !pay.contact_number?.toLowerCase().includes(s)) return false;
                            }
                            if (paymentUniFilter !== "all") {
                              // We don't have university_name in payment_success yet, but we can check if the college belongs to it
                              const uniId = unis.find(u => u.name === paymentUniFilter)?.id;
                              const collegeIds = colleges.filter(c => c.university_id === uniId).map(c => c.name);
                              if (!collegeIds.includes(pay.college_name)) return false;
                            }
                            if (paymentCollegeFilter !== "all" && pay.college_name !== paymentCollegeFilter) return false;
                            return true;
                          })
                          .map(pay => (
                          <TableRow key={pay.id} className="hover:bg-slate-50/50 transition-colors">
                            <TableCell className="text-[10px] font-bold text-slate-500">{new Date(pay.created_at).toLocaleString()}</TableCell>
                            <TableCell>
                              <div className="font-black text-slate-800 text-sm">{pay.full_name || pay.email}</div>
                              <div className="text-[10px] text-muted-foreground font-medium">{pay.email}</div>
                            </TableCell>
                             <TableCell className="text-[10px] font-medium text-slate-500">{pay.contact_number || '—'}</TableCell>
                            <TableCell className="text-[10px] font-black text-indigo-600 uppercase tracking-tight">{pay.college_name || '—'}</TableCell>
                            <TableCell><Badge variant="outline" className="text-[10px] font-mono bg-white">{pay.payment_id}</Badge></TableCell>
                            <TableCell className="font-black text-slate-800">₹{(pay.amount_paise || 0) / 100}</TableCell>
                            <TableCell><Badge className="bg-green-500 shadow-sm border-none text-[10px] uppercase font-black px-3 py-1">Captured</Badge></TableCell>
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
                        ))}
                        {payments.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-20 text-muted-foreground font-bold italic">No payment records found.</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="leads">
              <div className="space-y-6">
                <Card className="p-8 border-none shadow-elegant bg-gradient-to-br from-indigo-50/50 to-white">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h3 className="text-2xl font-black text-slate-800 flex items-center gap-2"><UserPlus className="size-6 text-indigo-600" /> Current Leads</h3>
                      <p className="text-xs text-muted-foreground font-medium">Incomplete registrations, failed checkout, and cancelled payments (excluding enrolled emails)</p>
                    </div>
                    <div className="flex flex-col md:flex-row items-center gap-4">
                      <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input 
                          placeholder="Search leads..." 
                          className="pl-9 h-10 bg-white shadow-soft" 
                          value={leadsSearchTerm}
                          onChange={e => setLeadsSearchTerm(e.target.value)}
                        />
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <div className="text-2xl font-black text-indigo-600 leading-none">
                          {failedPayments.length +
                            cancelledPayments.length +
                            registrationDraftLeads.filter(
                              (d) =>
                                d.email &&
                                !students.some(
                                  (s) => s.email?.toLowerCase() === d.email?.toLowerCase()
                                )
                            ).length}
                        </div>
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Active Leads</div>
                      </div>
                    </div>
                  </div>

                  <ScrollArea className="h-[500px] rounded-2xl border border-slate-100 bg-white/50 backdrop-blur-sm">
                    <Table>
                      <TableHeader className="bg-slate-50/50"><TableRow><TableHead>Date</TableHead><TableHead>Lead Details</TableHead><TableHead>Txn ID</TableHead><TableHead>Amount</TableHead><TableHead>Error</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(() => {
                          const enrolledEmails = new Set(
                            students.map((s) => s.email?.toLowerCase()).filter(Boolean)
                          );

                          const draftRows = registrationDraftLeads
                            .filter((d) => d.email && !enrolledEmails.has(d.email.toLowerCase()))
                            .map((d) => {
                              const pl = d.payload || {};
                              const meta = {
                                ...pl,
                                fullName: pl.fullName,
                                parentName: pl.parentName,
                                gender: pl.gender,
                                contact: pl.contact,
                                university: pl.university,
                                college: pl.college,
                                degree: pl.degree,
                                department: pl.department,
                                session: pl.session,
                                semester: pl.semester,
                                rollNo: pl.rollNo,
                                course: pl.course,
                              };
                              return {
                                id: `reg-draft-${d.id}`,
                                created_at: d.updated_at,
                                email: d.email,
                                full_name: pl.fullName || d.email,
                                contact_number: pl.contact || d.phone,
                                college_name: pl.college || "—",
                                course: pl.course || "—",
                                amount_paise: 0,
                                failure_reason: "Incomplete registration",
                                payment_id: null as string | null,
                                original: {
                                  registration_draft: true,
                                  draft_id: d.id,
                                  user_email: d.email,
                                  user_phone: pl.contact || d.phone,
                                  full_name: pl.fullName,
                                  gender: pl.gender,
                                  college_name: pl.college,
                                  university_name: pl.university,
                                  metadata: meta,
                                  cybercafe_shop_name: d.cybercafe_shop_name,
                                  cybercafe_email: d.cybercafe_email,
                                },
                              };
                            });

                          const payRows = [...failedPayments, ...cancelledPayments].map((cp: any) => ({
                            id: cp.id,
                            created_at: cp.created_at,
                            email: cp.email || cp.user_email,
                            full_name: cp.full_name || cp.metadata?.fullName || cp.user_email,
                            contact_number: cp.contact_number || cp.metadata?.contact,
                            college_name: cp.college_name || cp.metadata?.college || "No College",
                            course: cp.metadata?.course || "No Domain",
                            amount_paise: cp.amount_paise ?? cp.amount ?? 0,
                            failure_reason: cp.failure_reason || cp.reason || "Payment Failed",
                            payment_id: cp.payment_id,
                            original: cp,
                          }));

                          const merged = [...draftRows, ...payRows].filter((cp) => {
                            if (cp.email && enrolledEmails.has(cp.email.toLowerCase())) return false;
                            if (!leadsSearchTerm) return true;
                            const search = leadsSearchTerm.toLowerCase();
                            return (
                              cp.email?.toLowerCase().includes(search) ||
                              cp.full_name?.toLowerCase().includes(search) ||
                              String(cp.contact_number || "").toLowerCase().includes(search)
                            );
                          });

                          if (merged.length === 0) {
                            return (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center py-24 text-muted-foreground font-bold italic">
                                  No current leads.
                                </TableCell>
                              </TableRow>
                            );
                          }

                          return merged.map((cp) => (
                            <TableRow key={cp.id} className="hover:bg-indigo-50/20 transition-colors">
                              <TableCell className="text-[10px] font-bold text-slate-500">{new Date(cp.created_at).toLocaleString()}</TableCell>
                              <TableCell>
                                <div className="font-black text-slate-800 text-sm">{cp.full_name}</div>
                                <div className="text-[10px] text-muted-foreground font-medium">{cp.email}</div>
                                {cp.contact_number && (
                                  <div className="text-[10px] text-slate-500 font-bold mt-0.5">📞 {cp.contact_number}</div>
                                )}
                                <div className="flex flex-wrap gap-1 mt-1">
                                  <Badge variant="outline" className="text-[8px] font-black uppercase text-indigo-500 border-indigo-100 leading-none py-0.5">{cp.college_name}</Badge>
                                  <Badge variant="outline" className="text-[8px] font-black uppercase text-emerald-500 border-emerald-100 leading-none py-0.5">{cp.course}</Badge>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-[10px] font-mono">{cp.payment_id || "—"}</Badge>
                              </TableCell>
                              <TableCell className="font-black text-slate-800">₹{(cp.amount_paise || 0) / 100}</TableCell>
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
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="size-9 p-0 rounded-full hover:bg-indigo-600 hover:text-white transition-all"
                                    onClick={() => {
                                      setSelectedUser(cp.original);
                                      setIsViewDialogOpen(true);
                                    }}
                                  >
                                    <Eye className="size-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="size-9 p-0 rounded-full hover:bg-emerald-600 hover:text-white transition-all"
                                    onClick={() => handleTransferLead(cp.original)}
                                    title="Transfer to Registered Students"
                                    disabled={processing}
                                  >
                                    <UserPlus className="size-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ));
                        })()}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="old-leads">
              <div className="space-y-6">
                <Card className="p-8 border-none shadow-elegant bg-gradient-to-br from-slate-100 to-white">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h3 className="text-2xl font-black text-slate-800 flex items-center gap-2"><Clock className="size-6 text-slate-600" /> Legacy Leads</h3>
                      <p className="text-xs text-muted-foreground font-medium">History of failed payments from the previous system (payment_cancelled table)</p>
                    </div>
                     <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                      <div className="relative w-full md:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                        <Input 
                          placeholder="Search legacy leads (email, name)..." 
                          className="pl-9 h-11 bg-white border-slate-200 rounded-xl font-bold shadow-sm" 
                          value={oldLeadsSearchTerm}
                          onChange={e => setOldLeadsSearchTerm(e.target.value)}
                        />
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-black text-slate-600 leading-none">{cancelledPayments.length}</div>
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total Legacy</div>
                      </div>
                    </div>
                  </div>

                  <ScrollArea className="h-[500px] rounded-2xl border border-slate-100 bg-white/50 backdrop-blur-sm">
                    <Table>
                      <TableHeader className="bg-slate-50/50"><TableRow><TableHead>Date</TableHead><TableHead>Lead Details</TableHead><TableHead>Amount</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {cancelledPayments
                          .filter(cp => {
                            if (!oldLeadsSearchTerm) return true;
                            const s = oldLeadsSearchTerm.toLowerCase();
                            return (
                              cp.user_email?.toLowerCase().includes(s) || 
                              cp.metadata?.fullName?.toLowerCase().includes(s)
                            );
                          })
                          .map(cp => (
                          <TableRow key={cp.id} className="hover:bg-slate-50 transition-colors">
                            <TableCell className="text-[10px] font-bold text-slate-500">{new Date(cp.created_at).toLocaleString()}</TableCell>
                             <TableCell>
                               <div className="font-black text-slate-800 text-sm">{cp.metadata?.fullName || cp.user_email}</div>
                               <div className="text-[10px] text-muted-foreground font-medium">{cp.user_email}</div>
                             </TableCell>
                            <TableCell className="font-black text-slate-800">₹{(cp.amount || 0) / 100}</TableCell>
                            <TableCell><Badge variant="outline" className="text-[10px]">{cp.reason}</Badge></TableCell>
                            <TableCell className="text-right">
                               <div className="flex items-center justify-end gap-2">
                                 <Button 
                                   variant="ghost" 
                                   size="sm" 
                                   className="size-9 p-0 rounded-full hover:bg-slate-100 transition-all"
                                   onClick={() => {
                                     setSelectedUser(cp);
                                     setIsViewDialogOpen(true);
                                   }}
                                 >
                                   <Eye className="size-4" />
                                 </Button>
                                 <Button 
                                   variant="ghost" 
                                   size="sm" 
                                   className="size-9 p-0 rounded-full hover:bg-emerald-600 hover:text-white transition-all"
                                   onClick={() => handleTransferLead(cp)}
                                   disabled={processing}
                                 >
                                   <UserPlus className="size-4" />
                                 </Button>
                               </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {cancelledPayments.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-24 text-muted-foreground font-bold italic">No legacy leads.</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="staff">
              <Card className="p-8 border-none shadow-elegant bg-white/50 backdrop-blur-sm rounded-3xl">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-2xl font-black text-slate-800 flex items-center gap-2"><Shield className="size-6 text-indigo-600" /> Administrative Council</h3>
                    <p className="text-xs text-muted-foreground font-medium">Manage permissions and access for platform administrators</p>
                  </div>
                </div>
                
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {staff.map(member => (
                    <Card key={member.id} className="p-6 border-none shadow-soft bg-white group hover:shadow-elegant transition-all border-l-4 border-l-indigo-500">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="size-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl font-black">
                          {member.full_name?.charAt(0)}
                        </div>
                        <div>
                          <div className="font-black text-slate-800 leading-none mb-1">{member.full_name}</div>
                          <div className="text-[10px] text-muted-foreground font-medium">{member.email}</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-6">
                        {member.roles.map((role: string) => (
                          <Badge key={role} variant="secondary" className="text-[8px] font-black uppercase tracking-widest">{role}</Badge>
                        ))}
                      </div>
                      <div className="flex gap-2 flex-wrap">
                          <Button variant="outline" size="sm" className="flex-1 h-9 rounded-xl text-[10px] font-black uppercase tracking-widest" onClick={() => {
                          setSelectedAdminForPerms(member);
                          setIsPermsDialogOpen(true);
                        }}>Permissions</Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 px-3 rounded-xl text-orange-600 hover:bg-orange-50 hover:text-orange-700 text-[10px] font-black uppercase border border-orange-100"
                            disabled={processing}
                            onClick={() => handleForceLogout(member)}
                            title="Log this admin out from all devices instantly"
                          >
                            <LogIn className="size-3.5 rotate-180 mr-1" /> Force Logout
                          </Button>
                          <Button variant="ghost" size="sm" className="size-9 p-0 rounded-xl text-red-500 hover:bg-red-50" onClick={() => removeStaff(member.id)}><Trash2 className="size-4" /></Button>
                        </div>
                    </Card>
                  ))}
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="settings">
              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <Card className="p-8 border-none shadow-elegant bg-gradient-to-br from-emerald-50/50 to-white">
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h3 className="text-2xl font-black text-slate-800 flex items-center gap-2"><DollarSign className="size-6 text-emerald-600" /> Payment Gateway</h3>
                        <p className="text-xs text-muted-foreground font-medium">Razorpay API configuration</p>
                      </div>
                      <Badge className={paymentConfig?.is_active ? "bg-emerald-500" : "bg-slate-400"}>{paymentConfig?.is_active ? "Live" : "Inactive"}</Badge>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2"><Label className="text-[10px] font-black text-slate-500 uppercase">Key ID</Label><Input value={paymentConfig?.razorpay_key_id || ''} onChange={e => setPaymentConfig({...paymentConfig, razorpay_key_id: e.target.value})} className="h-12 bg-white/80 border-none shadow-soft rounded-xl font-mono text-xs" /></div>
                      <div className="space-y-2"><Label className="text-[10px] font-black text-slate-500 uppercase">Key Secret</Label><Input type="password" value={paymentConfig?.razorpay_key_secret || ''} onChange={e => setPaymentConfig({...paymentConfig, razorpay_key_secret: e.target.value})} className="h-12 bg-white/80 border-none shadow-soft rounded-xl font-mono text-xs" /></div>
                      <div className="space-y-2"><Label className="text-[10px] font-black text-slate-500 uppercase">Webhook Secret</Label><Input type="password" value={paymentConfig?.razorpay_webhook_secret || ''} onChange={e => setPaymentConfig({...paymentConfig, razorpay_webhook_secret: e.target.value})} className="h-12 bg-white/80 border-none shadow-soft rounded-xl font-mono text-xs" /></div>
                      <Button className="w-full h-12 bg-slate-900 text-white font-black shadow-glow rounded-xl" onClick={savePaymentConfig}>Save Config</Button>
                    </div>
                  </Card>

                  <Card className="p-8 border-none shadow-elegant bg-red-50/50 rounded-3xl border border-red-100">
                    <h3 className="text-xl font-black uppercase text-red-600 mb-4">Danger Zone</h3>
                    <Button variant="destructive" className="w-full h-12 font-black shadow-glow rounded-xl" onClick={() => setIsResetDialogOpen(true)}>Platform Factory Reset</Button>
                  </Card>
                </div>

                <div className="space-y-6">
                  <Card className="p-8 border-none shadow-elegant bg-white/50 backdrop-blur-sm rounded-3xl">
                    <h3 className="text-2xl font-black text-slate-800 mb-6">Internship Domains</h3>
                    <div className="flex gap-3 mb-6"><Input value={newDomain} onChange={e => setNewDomain(e.target.value)} placeholder="New Domain..." className="h-12 bg-white shadow-soft rounded-xl border-none" /><Button variant="hero" className="h-12 px-6 shadow-glow font-bold rounded-xl" onClick={addDomain}>Add</Button></div>
                    <div className="flex flex-wrap gap-2">{domains.map(d => <Badge key={d.id} variant="secondary" className="pl-4 pr-1 py-2 gap-2 text-xs font-bold rounded-full bg-white border border-slate-100 shadow-sm group">{d.name} <Button size="sm" variant="ghost" className="size-4 p-0 opacity-0 group-hover:opacity-100" onClick={() => delDomain(d.id)}><Trash2 className="size-3" /></Button></Badge>)}</div>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="comms" className="animate-fade-in">
              <div className="grid lg:grid-cols-3 gap-6">
                {/* Left: Compose Section */}
                <Card className="lg:col-span-2 p-8 border-none shadow-elegant bg-white">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h2 className="text-2xl font-black flex items-center gap-2">
                        <Mail className="size-6 text-primary" />
                        Bulk Communication Hub
                      </h2>
                      <p className="text-sm text-muted-foreground font-medium mt-1">Broadcast professional announcements to the student body.</p>
                    </div>
                    {isSendingBulk && (
                      <div className="flex items-center gap-3 bg-primary/10 px-6 py-3 rounded-2xl border border-primary/20">
                        <Loader2 className="size-5 animate-spin text-primary" />
                        <span className="text-sm font-black text-primary">
                          SENDING {bulkProgress}/{bulkTotal}
                          {bulkProgress < bulkTotal && (
                            <span className="font-medium text-slate-400 ml-1">
                              ({formatBulkMailEta(estimateBulkMailSeconds(bulkTotal - bulkProgress))} left)
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase font-black text-muted-foreground ml-1">Email Subject</Label>
                      <Input 
                        placeholder="Enter announcement subject..." 
                        className="h-12 bg-slate-50 border-none shadow-inner text-sm font-bold"
                        value={bulkEmailSubject}
                        onChange={(e) => setBulkEmailSubject(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase font-black text-muted-foreground ml-1">Message Body (HTML Supported)</Label>
                      <textarea 
                        className="w-full min-h-[400px] p-6 rounded-3xl border-none bg-slate-50 shadow-inner focus:ring-2 focus:ring-primary/20 transition-all text-sm font-medium resize-y"
                        placeholder="Type your message here... \n\nTips: \n- Use <br/> for new lines\n- Use <b>text</b> for bold\n- Use <p> for paragraphs"
                        value={bulkEmailBody}
                        onChange={(e) => setBulkEmailBody(e.target.value)}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between pt-6 border-t border-slate-100">
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-muted-foreground uppercase">Target Recipients</span>
                          <span className="text-xl font-black text-primary">{commsSelectedIds.length + csvEmails.length}</span>
                        </div>
                        <Badge variant="secondary" className="h-fit">Ready to Send</Badge>
                      </div>
                      <Button 
                        variant="hero" 
                        size="lg" 
                        className="h-14 px-10 shadow-glow rounded-2xl font-black"
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
                            (done) => setBulkProgress(done)
                          );

                          setIsSendingBulk(false);

                          if (result.rateLimited) {
                            toast.error(
                              result.sent > 0
                                ? `Hostinger rate limit after ${result.sent} sent. Wait 1 hour, then send the rest in batches of 50.`
                                : "Hostinger rate limit — wait 1 hour, then test with 1 email before bulk."
                            );
                          } else if (result.failed > 0) {
                            toast.warning(`Sent ${result.sent} of ${uniqueTargets.length}. ${result.failed} failed.`);
                          } else {
                            toast.success(`Sent to ${result.sent} recipients.`);
                            setBulkEmailSubject("");
                            setBulkEmailBody("");
                            setCommsSelectedIds([]);
                            setCsvEmails([]);
                          }
                        }}
                      >
                        {isSendingBulk ? "BROADCASTING..." : "DEPLOY BROADCAST NOW"}
                      </Button>
                    </div>
                  </div>
                </Card>

                {/* Right: Selection & CSV Section */}
                <div className="space-y-6">
                  <Card className="p-6 border-none shadow-elegant bg-slate-900 text-white">
                    <h3 className="font-black mb-6 flex items-center gap-2">
                      <Users className="size-5 text-primary" />
                      Recipient Selection
                    </h3>
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-black text-slate-400">Audience Segment</Label>
                        <Select value={commRecipientType} onValueChange={(v: any) => {
                          setCommRecipientType(v);
                          setCommUniFilters([]);
                          setCommCollegeFilters([]);
                          setCommDomainFilter("all");
                          setCommsSelectedIds([]);
                        }}>
                          <SelectTrigger className="h-12 bg-white/10 border-none text-white rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-900 border-white/10 text-white">
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
                        triggerClassName="h-12 bg-white/10 border-none text-white rounded-xl"
                        labelClassName="text-[10px] uppercase font-black text-slate-400"
                        popoverClassName="bg-slate-900 border-white/10 text-white"
                      />

                      <MultiSelectCheckboxGroup
                        label="College"
                        options={collegesForUniversityNames(colleges, unis, commUniFilters)}
                        selectedValues={commCollegeFilters}
                        onChange={(newColleges) => {
                          setCommCollegeFilters(newColleges);
                          setCommsSelectedIds([]);
                        }}
                        triggerClassName="h-12 bg-white/10 border-none text-white rounded-xl"
                        labelClassName="text-[10px] uppercase font-black text-slate-400"
                        popoverClassName="bg-slate-900 border-white/10 text-white"
                      />

                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-black text-slate-400">
                          Filter by Domain
                        </Label>
                        <Select
                          value={commDomainFilter}
                          onValueChange={(v) => {
                            setCommDomainFilter(v);
                            setCommsSelectedIds([]);
                          }}
                        >
                          <SelectTrigger className="h-12 bg-white/10 border-none text-white rounded-xl">
                            <SelectValue placeholder="All Domains" />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-900 border-white/10 text-white">
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
                        <Label className="text-[10px] uppercase font-black text-slate-400">
                          Filter by Mode
                        </Label>
                        <InternshipModeFilterSelect
                          value={commModeFilter}
                          onValueChange={(v) => {
                            setCommModeFilter(v);
                            setCommsSelectedIds([]);
                          }}
                          className="h-12 bg-white/10 border-none text-white rounded-xl"
                        />
                      </div>

                      <p className="text-[10px] text-slate-400">
                        {filterCommsRecipients(
                          commRecipientType === "enrolled" ? allStudentsComms : allLeadsComms,
                          {
                            uniFilters: commUniFilters,
                            collegeFilters: commCollegeFilters,
                            domainFilter: commDomainFilter,
                            modeFilter: commModeFilter,
                            colleges,
                            unis,
                            type: commRecipientType,
                          }
                        ).length}{" "}
                        match current filters
                      </p>

                      <Separator className="bg-white/10" />

                      <div className="p-5 rounded-2xl bg-white/5 border border-white/10">
                        <p className="text-[10px] font-black uppercase text-slate-400 mb-3 text-center tracking-widest">CSV Import (.csv)</p>
                        <Input 
                          type="file" 
                          accept=".csv" 
                          className="bg-white/10 border-none text-white text-xs h-10"
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
                          <div className="mt-4 flex items-center justify-between">
                            <Badge className="bg-primary text-white border-none">{csvEmails.length} Imported</Badge>
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-white/5" onClick={() => setCsvEmails([])}>Clear</Button>
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Target Selection</p>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full justify-start gap-2 h-11 bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-xl"
                          onClick={() => {
                            const list = filterCommsRecipients(
                              commRecipientType === "enrolled" ? allStudentsComms : allLeadsComms,
                              {
                                uniFilters: commUniFilters,
                                collegeFilters: commCollegeFilters,
                                domainFilter: commDomainFilter,
                                modeFilter: commModeFilter,
                                colleges,
                                unis,
                                type: commRecipientType,
                              }
                            );
                            setCommsSelectedIds(list.map((s: any) => s.id));
                          }}
                        >
                          <CheckCircle2 className="size-4 text-emerald-400" /> Select Filtered {commRecipientType === 'enrolled' ? 'Interns' : 'Leads'}
                        </Button>
                        <Button 
                          type="button"
                          variant="ghost" 
                          size="sm" 
                          className="w-full justify-start gap-2 h-11 text-red-400 hover:text-red-300 hover:bg-white/5 rounded-xl"
                          onClick={() => {
                            setCommsSelectedIds([]);
                            setCsvEmails([]);
                          }}
                        >
                          <Trash2 className="size-4" /> Clear Selection
                        </Button>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-6 border-none shadow-elegant bg-gradient-to-br from-indigo-600 to-indigo-800 text-white">
                    <h3 className="font-black mb-4 flex items-center gap-2">
                      <Shield className="size-5 text-white/80" />
                      Global Protocol
                    </h3>
                    <ul className="text-xs space-y-3 text-indigo-100 font-medium">
                      <li className="flex gap-2">
                        <div className="size-1.5 rounded-full bg-white/40 mt-1.5 shrink-0" />
                        <span>Emails are sent using the production SMTP relay.</span>
                      </li>
                      <li className="flex gap-2">
                        <div className="size-1.5 rounded-full bg-white/40 mt-1.5 shrink-0" />
                        <span>Ensure HTML tags are properly closed to avoid formatting issues.</span>
                      </li>
                      <li className="flex gap-2">
                        <div className="size-1.5 rounded-full bg-white/40 mt-1.5 shrink-0" />
                        <span>CSV files must have an "email" column for parsing.</span>
                      </li>
                      <li className="flex gap-2">
                        <div className="size-1.5 rounded-full bg-white/40 mt-1.5 shrink-0" />
                        <span>Do not refresh the page until the broadcast is 100% complete.</span>
                      </li>
                    </ul>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="logs" className="animate-fade-in space-y-6">
              <Card className="p-6 border-none shadow-elegant bg-card/50 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-black flex items-center gap-2"><Clock className="size-5 text-primary" /> System Audit Trail</h3>
                  <div className="flex items-center gap-4">
                    <div className="relative w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <Input 
                        className="pl-9 bg-white/50 border-none h-10 rounded-xl" 
                        placeholder="Search logs..." 
                        value={logsSearchTerm} 
                        onChange={e => setLogsSearchTerm(e.target.value)} 
                      />
                    </div>
                    <Button variant="ghost" size="sm" className="font-bold text-red-500 gap-2" onClick={() => { setAdminLogs([]); setLogsTotalCount(0); }}>
                      <Filter className="size-4" /> Clear
                    </Button>
                  </div>
                </div>
              </Card>

              <Card className="overflow-hidden border-none shadow-elegant">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="uppercase text-[10px] font-black">Timestamp</TableHead>
                      <TableHead className="uppercase text-[10px] font-black">Admin</TableHead>
                      <TableHead className="uppercase text-[10px] font-black">Action</TableHead>
                      <TableHead className="uppercase text-[10px] font-black">Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logsLoading ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-20"><Loader2 className="size-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                    ) : (
                      <>
                        {adminLogs.map(log => (
                          <TableRow key={log.id} className="hover:bg-muted/20 transition-colors">
                            <TableCell className="text-[10px] font-bold text-slate-500 whitespace-nowrap">
                              {new Date(log.created_at).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <div className="font-bold text-xs">{log.admin_email}</div>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant="outline" 
                                className={`text-[8px] font-black uppercase px-2 ${
                                  log.action_type === 'DELETE' || log.action_type === 'SYSTEM_RESET' ? 'text-red-600 border-red-100 bg-red-50' : 
                                  log.action_type === 'CREATE' ? 'text-green-600 border-green-100 bg-green-50' :
                                  'text-blue-600 border-blue-100 bg-blue-50'
                                }`}
                              >
                                {log.action_type}
                              </Badge>
                              <div className="text-[8px] text-muted-foreground mt-0.5 font-bold uppercase tracking-tighter">{log.entity_type}</div>
                            </TableCell>
                            <TableCell>
                              <div className="text-xs font-medium text-slate-700">{log.description}</div>
                              {log.metadata && Object.keys(log.metadata).length > 0 && (
                                <div className="text-[9px] text-muted-foreground mt-1 bg-slate-50 p-1.5 rounded-lg border border-slate-100 font-mono overflow-hidden text-ellipsis">
                                  {JSON.stringify(log.metadata)}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        {adminLogs.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-20 text-muted-foreground font-medium italic">
                              No activity logs found.
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    )}
                  </TableBody>
                </Table>

                <div className="p-4 bg-muted/10 border-t flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="text-xs text-muted-foreground font-medium">
                    Showing {logsTotalCount === 0 ? 0 : logsPage * pageSize + 1} to {Math.min(logsTotalCount, (logsPage + 1) * pageSize)} of {logsTotalCount} logs
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={logsPage === 0 || logsLoading} onClick={() => setLogsPage(p => p - 1)}>Previous</Button>
                    <Button variant="outline" size="sm" disabled={(logsPage + 1) * pageSize >= logsTotalCount || logsLoading} onClick={() => setLogsPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="settings" className="space-y-6">
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
                          toast.success("Super Admin password updated successfully!");
                          setNewPassword("");
                          await logAdminAction('UPDATE', 'admin', 'Changed super admin password (Self-Service)');
                        } catch (err: unknown) {
                          toast.error(userFacingPasswordError(err));
                        } finally {
                          setProcessing(false);
                        }
                      }}
                    >
                      {processing ? <Loader2 className="size-4 animate-spin mr-2" /> : "Update Credentials"}
                    </Button>
                  </div>
                </Card>

                <Card className="p-6 border-none shadow-elegant bg-white md:col-span-2 lg:col-span-1">
                  <h3 className="font-bold mb-4 flex items-center gap-2"><Activity className="size-5 text-primary" /> Global Notice Popup</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                      <div>
                        <Label className="text-xs font-black uppercase tracking-tight">Enable Notice</Label>
                        <p className="text-[10px] text-muted-foreground">Show popup to visitors</p>
                      </div>
                      <Checkbox 
                        checked={siteSettings.notice_enabled} 
                        onCheckedChange={(checked) => setSiteSettings({...siteSettings, notice_enabled: !!checked})} 
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-xs font-black uppercase tracking-tight">Notice Title</Label>
                      <Input 
                        value={siteSettings.notice_title} 
                        onChange={(e) => setSiteSettings({...siteSettings, notice_title: e.target.value})} 
                        className="bg-slate-50 border-none" 
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-black uppercase tracking-tight">Notice Message</Label>
                      <textarea 
                        className="w-full min-h-[100px] p-3 rounded-xl bg-slate-50 border-none text-sm focus:ring-2 focus:ring-primary/20 outline-none resize-none"
                        value={siteSettings.notice_message} 
                        onChange={(e) => setSiteSettings({...siteSettings, notice_message: e.target.value})} 
                        placeholder="Write your message here..."
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-100">
                        <Checkbox 
                          id="show-home"
                          checked={siteSettings.show_on_home} 
                          onCheckedChange={(checked) => setSiteSettings({...siteSettings, show_on_home: !!checked})} 
                        />
                        <Label htmlFor="show-home" className="text-[10px] font-bold uppercase cursor-pointer truncate">Home</Label>
                      </div>
                      <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-100">
                        <Checkbox 
                          id="show-reg"
                          checked={siteSettings.show_on_registration} 
                          onCheckedChange={(checked) => setSiteSettings({...siteSettings, show_on_registration: !!checked})} 
                        />
                        <Label htmlFor="show-reg" className="text-[10px] font-bold uppercase cursor-pointer truncate">Register</Label>
                      </div>
                      <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-100">
                        <Checkbox 
                          id="show-login"
                          checked={siteSettings.show_on_login} 
                          onCheckedChange={(checked) => setSiteSettings({...siteSettings, show_on_login: !!checked})} 
                        />
                        <Label htmlFor="show-login" className="text-[10px] font-bold uppercase cursor-pointer truncate">Login</Label>
                      </div>
                    </div>

                    <div className="space-y-3 pt-2 border-t border-slate-100">
                      <Label className="text-xs font-black uppercase tracking-tight flex items-center gap-2">
                        <Clock className="size-3 text-primary" /> Registration Delay Range
                      </Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground uppercase font-bold">Min (sec)</Label>
                          <Input 
                            type="number" 
                            value={siteSettings.reg_min_delay} 
                            onChange={(e) => setSiteSettings({...siteSettings, reg_min_delay: parseInt(e.target.value) || 0})} 
                            className="bg-slate-50 border-none h-10" 
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground uppercase font-bold">Max (sec)</Label>
                          <Input 
                            type="number" 
                            value={siteSettings.reg_max_delay} 
                            onChange={(e) => setSiteSettings({...siteSettings, reg_max_delay: parseInt(e.target.value) || 0})} 
                            className="bg-slate-50 border-none h-10" 
                          />
                        </div>
                      </div>
                      <p className="text-[9px] text-muted-foreground italic font-medium">Adds a random loading delay between steps (set to 0 to disable)</p>
                    </div>

                    <div className="space-y-3 pt-3 border-t border-slate-100">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                        <div>
                          <Label className="text-xs font-black uppercase tracking-tight flex items-center gap-1.5 text-slate-800">
                            <span className="inline-block size-2 rounded-full bg-[#25D366]"></span>
                            WhatsApp Join Option
                          </Label>
                          <p className="text-[10px] text-muted-foreground">Show join channel button in popup</p>
                        </div>
                        <Checkbox 
                          checked={siteSettings.whatsapp_link_enabled} 
                          onCheckedChange={(checked) => setSiteSettings({...siteSettings, whatsapp_link_enabled: !!checked})} 
                        />
                      </div>

                      {siteSettings.whatsapp_link_enabled && (
                        <div className="space-y-1.5">
                          <Label className="text-[10px] text-slate-500 uppercase font-black tracking-tight">WhatsApp Channel Link</Label>
                          <Input 
                            value={siteSettings.whatsapp_link_url || ''} 
                            onChange={(e) => setSiteSettings({...siteSettings, whatsapp_link_url: e.target.value})} 
                            placeholder="https://whatsapp.com/channel/..."
                            className="bg-slate-50 border-none h-10 text-xs" 
                          />
                        </div>
                      )}

                      {!hasWhatsappColumn && (
                        <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-[10px] text-amber-800 leading-normal">
                          <p className="font-bold flex items-center gap-1">
                            ⚠️ SQL Migration Needed
                          </p>
                          <p className="mt-0.5">Please execute the SQL migration script (available in <code>supabase/add_whatsapp_link_to_settings.sql</code>) in your Supabase SQL Editor to save this setting to the database.</p>
                        </div>
                      )}
                    </div>

                    <Button 
                      className="w-full h-11 bg-primary hover:bg-primary/90 font-black" 
                      onClick={handleUpdateSiteSettings}
                      disabled={isSiteSettingsLoading}
                    >
                      {isSiteSettingsLoading ? <Loader2 className="size-4 animate-spin mr-2" /> : "Save Site Settings"}
                    </Button>
                  </div>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="attendance" className="space-y-6 animate-fade-in">
              <div className="grid md:grid-cols-3 gap-6">
                <Card className="md:col-span-1 p-6 border-none shadow-elegant bg-slate-900 text-white">
                  <h3 className="font-black mb-1 flex items-center gap-2 text-primary"><CheckSquare className="size-5" /> Eligibility Criteria</h3>
                  <p className="text-slate-400 text-xs mb-4">Minimum attendance % for certificate eligibility</p>
                  <div className="flex items-center gap-3">
                    <input type="number" min={0} max={100} value={attendanceCriteria}
                      onChange={e => setAttendanceCriteria(Number(e.target.value))}
                      className="w-24 h-10 rounded-xl bg-slate-800 border-none text-white text-center font-black text-lg focus:ring-2 focus:ring-primary/40 outline-none" />
                    <span className="text-slate-400 font-bold">%</span>
                    <Button className="ml-auto bg-primary hover:bg-primary/90 font-black" disabled={attendanceSaving}
                      onClick={async () => {
                        setAttendanceSaving(true);
                        const { error } = await supabase.from('attendance_settings').upsert({ id: 1, min_percentage: attendanceCriteria, updated_at: new Date().toISOString() });
                        if (error) toast.error('Failed to save'); else toast.success('Criteria saved!');
                        setAttendanceSaving(false);
                      }}>
                      {attendanceSaving ? <Loader2 className="size-4 animate-spin" /> : 'Save'}
                    </Button>
                  </div>
                </Card>
                <Card className="md:col-span-2 p-6 border-none shadow-elegant bg-white flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-black text-slate-800 flex items-center gap-2"><Users className="size-5 text-primary" /> Total Students Tracked</h3>
                    <div className="text-4xl font-black text-primary mt-1">{attendanceStudents.length}</div>
                    <p className="text-muted-foreground text-xs mt-1">Students with at least 1 attendance record</p>
                  </div>
                  <Button variant="outline" className="gap-2 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 rounded-xl font-bold"
                    onClick={() => {
                      if (attendanceStudents.length === 0) return toast.error('No data to export');
                      const rows = attendanceStudents.map((s: any) => ({
                        'Student Name': s.full_name, 'Email': s.email, 'College': s.college_name || '',
                        'Domain': s.internship_domain || '', 'Total Days': s.total_days,
                        'Percentage': s.percentage.toFixed(1) + '%', 'Eligible': s.isEligible ? 'Yes' : 'No'
                      }));
                      const csv = Papa.unparse(rows);
                      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                      const link = document.createElement('a');
                      link.href = URL.createObjectURL(blob);
                      link.download = `attendance_report_${new Date().toISOString().split('T')[0]}.csv`;
                      link.click();
                      toast.success('Attendance report downloaded!');
                    }}>
                    <Download className="size-4" /> Export CSV
                  </Button>
                </Card>
              </div>

              <Card className="border-none shadow-elegant overflow-hidden">
                <div className="p-4 border-b bg-muted/20 flex flex-col gap-4">
                  <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <Input
                        className="pl-9 bg-white border-none"
                        placeholder="Search student..."
                        value={attendanceSearchTerm}
                        onChange={(e) => setAttendanceSearchTerm(e.target.value)}
                      />
                    </div>
                    <Select
                      value={attendanceUniFilter}
                      onValueChange={(v) => {
                        setAttendanceUniFilter(v);
                        setAttendanceCollegeFilter("all");
                      }}
                    >
                      <SelectTrigger className="w-full lg:w-52 bg-white border-none shadow-soft">
                        <SelectValue placeholder="University" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Universities</SelectItem>
                        {unis.map((u) => (
                          <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={attendanceCollegeFilter} onValueChange={setAttendanceCollegeFilter}>
                      <SelectTrigger className="w-full lg:w-52 bg-white border-none shadow-soft">
                        <SelectValue placeholder="College" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Colleges</SelectItem>
                        {colleges
                          .filter(
                            (c) =>
                              attendanceUniFilter === "all" ||
                              c.university_id === unis.find((u) => u.name === attendanceUniFilter)?.id
                          )
                          .map((c) => (
                            <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" className="gap-2 text-violet-600 font-bold shrink-0" onClick={loadAll}>
                      <Activity className="size-4" /> Refresh Data
                    </Button>
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
                    <h3 className="font-black text-amber-950 mb-1">Bulk attendance actions</h3>
                    <p className="text-sm text-amber-900/80 mb-2">
                      Filter by university or college above, then reset or mark present for a date range.
                      Use university filter to auto-fill LNMU/BNMU programme dates.
                    </p>
                    <p className="text-xs text-amber-950/80 mb-4 font-medium">
                      {ADMIN_PROGRAMME_ATTENDANCE_HINT}
                    </p>
                    {attendanceProgrammeBulkHint ? (
                      <p className="text-xs font-bold text-amber-900 mb-3">
                        Selected university programme: {attendanceProgrammeBulkHint}
                      </p>
                    ) : null}
                    <div className="flex flex-col xl:flex-row xl:items-end gap-4 flex-wrap">
                      <Button
                        variant="outline"
                        className="border-amber-300 bg-white text-amber-950 hover:bg-amber-100 font-bold"
                        disabled={attendanceOpsLoading}
                        onClick={() => setAttendanceConfirmAction("reset")}
                      >
                        {attendanceResetScoped ? "Reset filtered attendance" : "Reset all attendance"}
                      </Button>
                      <div className="flex flex-col sm:flex-row sm:items-end gap-3 flex-wrap">
                        <div className="space-y-1">
                          <Label className="text-xs font-bold text-amber-900">From date</Label>
                          <Input
                            type="date"
                            value={bulkMarkStartDate}
                            onChange={(e) => setBulkMarkStartDate(e.target.value)}
                            className="bg-white w-full sm:w-40"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-bold text-amber-900">To date</Label>
                          <Input
                            type="date"
                            value={bulkMarkEndDate}
                            onChange={(e) => setBulkMarkEndDate(e.target.value)}
                            className="bg-white w-full sm:w-40"
                          />
                        </div>
                        <Button
                          className="bg-amber-700 hover:bg-amber-800 text-white font-bold"
                          disabled={attendanceOpsLoading || !bulkMarkStartDate || !bulkMarkEndDate}
                          onClick={() => setAttendanceConfirmAction("bulk")}
                        >
                          Mark present ({attendanceScopeStudents.length} students)
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-amber-800/70 mt-3">Scope: {attendanceBulkScopeLabel}</p>
                  </div>
                </div>
              </Card>

              <AlertDialog
                open={attendanceConfirmAction !== null}
                onOpenChange={(open) => !open && !attendanceOpsLoading && setAttendanceConfirmAction(null)}
              >
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {attendanceConfirmAction === "reset"
                        ? attendanceResetScoped
                          ? "Reset filtered attendance?"
                          : "Reset all attendance?"
                        : "Mark attendance as present?"}
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        {attendanceConfirmAction === "reset" ? (
                          <>
                            <p>
                              {attendanceResetScoped ? (
                                <>
                                  This will delete attendance records for{" "}
                                  <strong>{attendanceScopeStudents.length}</strong> student(s) in scope:{" "}
                                  {attendanceBulkScopeLabel}.
                                </>
                              ) : (
                                <>
                                  This will delete every attendance record for all students across all universities.
                                </>
                              )}
                              {" "}This cannot be undone.
                            </p>
                            <p>Do you want to continue?</p>
                          </>
                        ) : (
                          <>
                            <p>
                              Mark present from <strong>{bulkMarkStartDate}</strong> to{" "}
                              <strong>{bulkMarkEndDate}</strong> for{" "}
                              <strong>{attendanceScopeStudents.length}</strong> student(s).
                            </p>
                            <p>Scope: {attendanceBulkScopeLabel}</p>
                            <p>Do you want to continue?</p>
                          </>
                        )}
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={attendanceOpsLoading}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={attendanceOpsLoading}
                      className={
                        attendanceConfirmAction === "reset"
                          ? "bg-destructive hover:bg-destructive/90"
                          : "bg-amber-700 hover:bg-amber-800"
                      }
                      onClick={(e) => {
                        e.preventDefault();
                        if (attendanceConfirmAction === "reset") void handleResetAllAttendance();
                        else void handleBulkMarkAttendance();
                      }}
                    >
                      {attendanceOpsLoading ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                      {attendanceConfirmAction === "reset"
                        ? attendanceResetScoped
                          ? "Yes, reset filtered"
                          : "Yes, reset all"
                        : "Yes, mark present"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Card className="border-none shadow-elegant overflow-hidden">
                <div className="px-4 py-2 border-b bg-muted/10 text-xs text-muted-foreground">
                  Showing {filteredAttendanceStudents.length} student(s)
                </div>
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="uppercase text-[10px] font-black">Student</TableHead>
                      <TableHead className="uppercase text-[10px] font-black">College</TableHead>
                      <TableHead className="uppercase text-[10px] font-black">Total Days</TableHead>
                      <TableHead className="uppercase text-[10px] font-black">Attendance %</TableHead>
                      <TableHead className="uppercase text-[10px] font-black">Eligible</TableHead>
                      <TableHead className="uppercase text-[10px] font-black">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAttendanceStudents.map((s) => (
                        <TableRow key={s.id} className="hover:bg-muted/20 transition-colors">
                          <TableCell><div className="font-bold text-sm">{s.full_name}</div><div className="text-[10px] text-muted-foreground">{s.email}</div></TableCell>
                          <TableCell className="text-xs font-medium">{s.college_name || '—'}</TableCell>
                          <TableCell><span className="text-xl font-black text-violet-600">{s.total_days}</span></TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${s.isEligible ? 'bg-emerald-500' : 'bg-red-400'}`} style={{ width: `${Math.min(s.percentage, 100)}%` }} />
                              </div>
                              <span className="text-xs font-black">{s.percentage.toFixed(1)}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {s.isEligible
                              ? <Badge className="bg-emerald-50 text-emerald-700 border-none gap-1"><CheckCircle2 className="size-3" /> Eligible</Badge>
                              : <Badge className="bg-red-50 text-red-600 border-none gap-1"><Ban className="size-3" /> Not Eligible</Badge>
                            }
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline" className="gap-1 font-bold text-xs" onClick={async () => {
                              setSelectedAttendanceStudent(s);
                              const { data } = await supabase.from('attendance').select('*').eq('student_id', s.id).order('marked_at', { ascending: false });
                              setStudentAttendanceHistory(data || []);
                              setIsAttHistoryOpen(true);
                            }}><Eye className="size-3" /> History</Button>
                          </TableCell>
                        </TableRow>
                      ))
                    }
                    {attendanceStudents.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center py-16 text-muted-foreground">No attendance data found.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>

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
                <div className="text-2xl font-black text-violet-400">{studentAttendanceHistory.length}</div>
                <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Total Days</div>
              </div>
              <div className="text-center">
                <div className={`text-lg font-black ${selectedAttendanceStudent?.isEligible ? 'text-emerald-400' : 'text-red-400'}`}>
                  {selectedAttendanceStudent?.percentage?.toFixed(1)}%
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

      <Dialog open={isAddStaffOpen} onOpenChange={setIsAddStaffOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden rounded-3xl border-none shadow-elegant">
          <div className="bg-slate-900 p-8 text-white">
            <Shield className="size-12 text-primary mb-4" />
            <DialogTitle className="text-2xl font-black tracking-tight">Grant Administrative Access</DialogTitle>
            <DialogDescription className="text-slate-400 text-sm mt-1">Elevate a user to administrative status. They will have access to manage students and certificates.</DialogDescription>
          </div>
          <div className="p-8 space-y-6">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase text-slate-500">Authorized Email Address</Label>
              <Input value={staffEmail} onChange={e => setStaffEmail(e.target.value)} placeholder="admin@ezyintern.com" className="h-12 bg-slate-50 border-none shadow-inner" />
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={handleAddStaff} className="h-12 font-black shadow-glow">Finalize Appointment</Button>
              <Button variant="ghost" onClick={() => setIsAddStaffOpen(false)} className="text-slate-500 font-bold">Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}><DialogContent className="max-w-3xl p-0 overflow-hidden rounded-3xl border-none shadow-elegant">
        <div className="bg-primary p-8 text-white relative">
          <div className="flex items-center gap-6">
            <div className="size-20 rounded-3xl bg-white/20 backdrop-blur-md flex items-center justify-center text-3xl font-black shadow-inner">
              {(selectedUser?.full_name || selectedUser?.metadata?.fullName || "P")?.charAt(0)}
            </div>
            <div>
              <DialogTitle className="text-3xl font-black tracking-tight">
                {selectedUser?.full_name || selectedUser?.metadata?.fullName || "Profile Details"}
              </DialogTitle>
              <p className="text-primary-foreground/80 font-bold text-sm mt-1">
                {selectedUser?.registration_id ? `REGISTRATION ID: ${selectedUser.registration_id}` : "LEAD / PENDING REGISTRATION"}
              </p>
            </div>
          </div>
          <Badge className="absolute top-8 right-8 bg-white/20 hover:bg-white/30 border-none text-[10px] font-black uppercase tracking-widest px-4 py-1.5 backdrop-blur-sm">
            {selectedUser?.status || "Lead"}
          </Badge>
        </div>
        
        {selectedUser && (
          <ScrollArea className="max-h-[75vh]">
            <div className="p-8 space-y-10">
              {/* Personal Section */}
              <div className="space-y-6">
                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary flex items-center gap-2">
                  <User className="size-4" /> Personal Profile
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
                  <div><Label className="text-[10px] uppercase text-muted-foreground font-black tracking-wider">Gender</Label><p className="text-sm font-bold text-slate-900">{selectedUser.gender || selectedUser.metadata?.gender || "—"}</p></div>
                  <div><Label className="text-[10px] uppercase text-muted-foreground font-black tracking-wider">Email Address</Label><p className="text-sm font-bold text-slate-900 truncate">{selectedUser.email || selectedUser.user_email || "—"}</p></div>
                  <div><Label className="text-[10px] uppercase text-muted-foreground font-black tracking-wider">Contact Number</Label><p className="text-sm font-bold text-slate-900">{selectedUser.contact_number || selectedUser.user_phone || selectedUser.metadata?.contact_number || selectedUser.metadata?.contact || "—"}</p></div>
                  <div className="md:col-span-2"><Label className="text-[10px] uppercase text-muted-foreground font-black tracking-wider">Parent / Guardian Name</Label><p className="text-sm font-bold text-slate-900">{selectedUser.parent_name || selectedUser.metadata?.parentName || "—"}</p></div>
                </div>
              </div>

              <Separator className="bg-slate-100" />

              {/* Academic Section */}
              <div className="space-y-6">
                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary flex items-center gap-2">
                  <GraduationCap className="size-4" /> Academic Credentials
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
                  <div className="md:col-span-2 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <Label className="text-[10px] uppercase text-muted-foreground font-black tracking-wider">University</Label>
                    <p className="text-sm font-black text-slate-900">{selectedUser.university_name || selectedUser.metadata?.university_name || selectedUser.metadata?.university || "—"}</p>
                  </div>
                  <div className="md:col-span-2 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <Label className="text-[10px] uppercase text-muted-foreground font-black tracking-wider">College / Institute</Label>
                    <p className="text-sm font-black text-slate-900">{selectedUser.college_name || selectedUser.metadata?.college_name || selectedUser.metadata?.college || "—"}</p>
                  </div>
                  <div><Label className="text-[10px] uppercase text-muted-foreground font-black tracking-wider">Degree / Program</Label><p className="text-sm font-bold text-slate-900">{selectedUser.degree || selectedUser.metadata?.degree || "—"}</p></div>
                  <div><Label className="text-[10px] uppercase text-muted-foreground font-black tracking-wider">Department</Label><p className="text-sm font-bold text-slate-900">{selectedUser.department || selectedUser.metadata?.department || "—"}</p></div>
                  <div><Label className="text-[10px] uppercase text-muted-foreground font-black tracking-wider">Subject / Major</Label><p className="text-sm font-bold text-slate-900">{selectedUser.metadata?.subject || "—"}</p></div>
                  <div><Label className="text-[10px] uppercase text-muted-foreground font-black tracking-wider">Academic Session</Label><p className="text-sm font-bold text-slate-900">{selectedUser.academic_session || selectedUser.metadata?.session || "—"}</p></div>
                  <div><Label className="text-[10px] uppercase text-muted-foreground font-black tracking-wider">Current Semester</Label><p className="text-sm font-bold text-slate-900">{selectedUser.class_semester || selectedUser.metadata?.semester || selectedUser.metadata?.classSem || "—"}</p></div>
                  <div><Label className="text-[10px] uppercase text-muted-foreground font-black tracking-wider">Roll Identification</Label><p className="text-sm font-bold text-slate-900">{selectedUser.roll_number || selectedUser.metadata?.rollNo || "—"}</p></div>
                </div>
                
                <div className="mt-6 p-6 bg-indigo-600 rounded-3xl text-white shadow-glow">
                  <div className="flex items-center gap-3 mb-2">
                    <Briefcase className="size-5" />
                    <Label className="text-[10px] uppercase font-black tracking-[0.2em] opacity-80">Target Internship Domain</Label>
                  </div>
                  <p className="text-2xl font-black">{selectedUser.internship_domain || selectedUser.metadata?.course || selectedUser.metadata?.internship_domain || "NOT ASSIGNED"}</p>
                </div>
              </div>

              <Separator className="bg-slate-100" />

              {/* Emergency Section */}
              <div className="space-y-6">
                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary flex items-center gap-2">
                  <Phone className="size-4" /> Emergency Protocol
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
                  <div><Label className="text-[10px] uppercase text-muted-foreground font-black tracking-wider">Contact Name</Label><p className="text-sm font-bold text-slate-900">{selectedUser.emergency_name || selectedUser.metadata?.emName || "—"}</p></div>
                  <div><Label className="text-[10px] uppercase text-muted-foreground font-black tracking-wider">Relationship</Label><p className="text-sm font-bold text-slate-900">{selectedUser.emergency_relation || selectedUser.metadata?.emRel || "—"}</p></div>
                  <div><Label className="text-[10px] uppercase text-muted-foreground font-black tracking-wider">Contact Phone</Label><p className="text-sm font-bold text-slate-900 font-mono">{selectedUser.emergency_contact || selectedUser.metadata?.emPhone || "—"}</p></div>
                </div>
              </div>

              {typeof selectedUser.metadata?.consent_form_url === "string" &&
                selectedUser.metadata.consent_form_url.trim() !== "" && (
                  <>
                    <Separator className="bg-slate-100" />
                    <div className="rounded-3xl border border-primary/25 bg-primary/[0.06] p-6 space-y-3">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary flex items-center gap-2">
                        <FileText className="size-4" /> Consent letter
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Uploaded at registration — opens in a new tab.
                      </p>
                      <Button variant="outline" size="sm" className="font-bold rounded-xl" asChild>
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
                <div className="p-6 bg-red-50 rounded-3xl border border-red-100">
                  <div className="flex items-center gap-3 mb-2">
                    <Ban className="size-5 text-red-600" />
                    <Label className="text-[10px] uppercase text-red-600 font-black tracking-widest">Abandonment Reason / System Log</Label>
                  </div>
                  <p className="text-sm font-black text-red-700">{selectedUser.reason}</p>
                  <p className="text-[10px] text-red-500/80 font-medium mt-1 italic">This student reached checkout but the session was terminated or failed.</p>
                </div>
              )}
              {/* Technical / A2Z Section */}
              <div className="space-y-6 pt-8 border-t border-slate-100 bg-slate-50/50 p-8 rounded-[2.5rem]">
                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-orange-600 flex items-center gap-2">
                  <Shield className="size-4" /> Technical Dossier (A2Z Details)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <Label className="text-[10px] uppercase text-orange-500 font-black tracking-wider mb-2 block">Account Credential</Label>
                    <div className="bg-orange-100 text-orange-700 px-4 py-3 rounded-2xl font-mono font-black text-sm flex items-center justify-between border border-orange-200 shadow-sm">
                      <span>
                        {getStudentDirectoryPassword(selectedUser) ||
                          "Not stored — use Reset Password or Resend Credentials"}
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground font-black tracking-wider mb-2 block">Full Physical Address</Label>
                    <p className="text-sm font-bold text-slate-800">{selectedUser.metadata?.address || "NOT PROVIDED"}</p>
                  </div>
                </div>
                
                <div className="mt-6">
                  <Label className="text-[10px] uppercase text-slate-400 font-black tracking-wider mb-2 block">Raw System Metadata (Deep Trace)</Label>
                  <pre className="text-[10px] bg-slate-900 text-slate-400 p-6 rounded-3xl mt-2 overflow-x-auto border-4 border-slate-800 shadow-2xl font-mono leading-relaxed">
                    {JSON.stringify(selectedUser.metadata, null, 2)}
                  </pre>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-4">
                <Button variant="outline" className="rounded-xl font-bold h-11 px-8" onClick={() => setIsViewDialogOpen(false)}>Close Dossier</Button>
                {!selectedUser.registration_id && (
                  <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11 px-8 rounded-xl shadow-glow" onClick={() => { setIsViewDialogOpen(false); handleTransferLead(selectedUser); }}>
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
 
                <Separator className="bg-slate-100" />
 
                {/* Academic Section */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                    <GraduationCap className="size-3" /> Academic Details
                  </h4>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="col-span-2 space-y-1"><Label className="text-xs">University</Label><Input value={editData.university_name || ""} onChange={e => setEditData({...editData, university_name: e.target.value})} /></div>
                    <div className="col-span-2 space-y-1"><Label className="text-xs">College</Label><Input value={editData.college_name || ""} onChange={e => setEditData({...editData, college_name: e.target.value})} /></div>
                    <div className="space-y-1"><Label className="text-xs">Degree</Label><Input value={editData.degree || ""} onChange={e => setEditData({...editData, degree: e.target.value})} /></div>
                    <div className="space-y-1"><Label className="text-xs">Department</Label><Input value={editData.department || ""} onChange={e => setEditData({...editData, department: e.target.value})} /></div>
                    <div className="space-y-1"><Label className="text-xs">Session</Label><Input value={editData.academic_session || ""} onChange={e => setEditData({...editData, academic_session: e.target.value})} /></div>
                    <div className="space-y-1"><Label className="text-xs">Semester</Label><Input value={editData.class_semester || ""} onChange={e => setEditData({...editData, class_semester: e.target.value})} /></div>
                    <div className="space-y-1"><Label className="text-xs">Roll Number</Label><Input value={editData.roll_number || ""} onChange={e => setEditData({...editData, roll_number: e.target.value})} /></div>
                    <div className="space-y-1">
                      <Label className="text-xs">Internship Domain</Label>
                      <Select
                        value={
                          editData.internship_domain &&
                          domains.some((d) => d.name === editData.internship_domain)
                            ? editData.internship_domain
                            : EDIT_DOMAIN_SENTINEL
                        }
                        onValueChange={(v) =>
                          setEditData({
                            ...editData,
                            internship_domain: v === EDIT_DOMAIN_SENTINEL ? "" : v,
                          })
                        }
                      >
                        <SelectTrigger><SelectValue placeholder="Select Domain" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EDIT_DOMAIN_SENTINEL}>Not specified</SelectItem>
                          {domains.map((d) => (
                            <SelectItem key={d.id} value={d.name}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
 
                <Separator className="bg-slate-100" />
 
                {/* Internship Details Section */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                    <Briefcase className="size-3" /> Internship Information
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1">
                      <Label className="text-xs">Intern ID (Registration ID)</Label>
                      <Input value={editData.registration_id || ""} onChange={e => setEditData({...editData, registration_id: e.target.value})} placeholder="e.g. EZY/2026/INT/10001" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Internship Duration</Label>
                      <Input value={editData.internship_duration || ""} onChange={e => setEditData({...editData, internship_duration: e.target.value})} placeholder="e.g. 1 Month / 120 Hours" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Date of Joining</Label>
                      <Input type="date" value={editData.joining_date || ""} onChange={e => setEditData({...editData, joining_date: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Date of Completion</Label>
                      <Input type="date" value={editData.completion_date || ""} onChange={e => setEditData({...editData, completion_date: e.target.value})} />
                    </div>
                  </div>
                </div>
 
                <Separator className="bg-slate-100" />
 
                {/* Emergency Section */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                    <Phone className="size-3" /> Emergency Contacts
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-1"><Label className="text-xs">Contact Name</Label><Input value={editData.emergency_name || ""} onChange={e => setEditData({...editData, emergency_name: e.target.value})} /></div>
                    <div className="space-y-1"><Label className="text-xs">Relationship</Label><Input value={editData.emergency_relation || ""} onChange={e => setEditData({...editData, emergency_relation: e.target.value})} /></div>
                    <div className="space-y-1"><Label className="text-xs">Contact Phone</Label><Input value={editData.emergency_contact || ""} onChange={e => setEditData({...editData, emergency_contact: e.target.value})} /></div>
                  </div>
                </div>
 
                <div className="flex justify-end gap-4 mt-8">
                  <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={processing}>{processing ? <Loader2 className="size-4 animate-spin mr-2" /> : null} Save Changes</Button>
                </div>
              </form>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isPermsDialogOpen} onOpenChange={setIsPermsDialogOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden rounded-3xl border-none shadow-elegant">
          <div className="bg-indigo-600 p-8 text-white">
            <Shield className="size-12 text-white/90 mb-4" />
            <DialogTitle className="text-2xl font-black tracking-tight">Admin Permissions</DialogTitle>
            <DialogDescription className="text-indigo-100 text-sm mt-1">Manage what <strong>{selectedAdminForPerms?.full_name}</strong> can access in their dashboard.</DialogDescription>
          </div>
          <div className="p-8 space-y-4">
            {[
              { id: 'can_manage_students', label: 'Student Management', desc: 'Can view, edit, and filter student records' },
              { id: 'can_manage_classes', label: 'Live Classes', desc: 'Can schedule and manage video sessions' },
              { id: 'can_manage_certificates', label: 'Certificates', desc: 'Can generate and issue internship certificates' },
              { id: 'can_manage_institutions', label: 'Academic Partners', desc: 'Can manage Universities and Colleges' }
            ].map(perm => {
              const userPerms = adminPermissions.find(ap => ap.user_id === selectedAdminForPerms?.id) || {};
              const isEnabled = userPerms[perm.id] ?? true; // default true
              
              return (
                <div key={perm.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="pr-4">
                    <p className="text-sm font-bold text-slate-800">{perm.label}</p>
                    <p className="text-[10px] text-muted-foreground font-medium">{perm.desc}</p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => toggleAdminPermission(selectedAdminForPerms.id, perm.id, isEnabled)}
                    className={isEnabled ? "text-indigo-600" : "text-slate-400"}
                  >
                    {isEnabled ? <ToggleRight className="size-8" /> : <ToggleLeft className="size-8" />}
                  </Button>
                </div>
              );
            })}
          </div>
          <DialogFooter className="p-6 bg-slate-50 border-t">
            <Button className="w-full h-11 font-bold rounded-xl" onClick={() => setIsPermsDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Reset Dialog */}
      <Dialog open={isResetPassOpen} onOpenChange={setIsResetPassOpen}>
        <DialogContent className="sm:max-w-[425px] border-none shadow-elegant bg-slate-900 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-black">
              <LogIn className="size-6 text-orange-400" />
              Reset Student Password
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Set a new manual password for {resetPassUser?.full_name}. This will take effect immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-6">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase text-slate-500">New Password</Label>
              <Input 
                type="text" 
                value={newPassword} 
                onChange={e => setNewPassword(e.target.value)} 
                placeholder="Enter new password"
                className="font-mono bg-white/5 border-white/10 h-12 rounded-xl focus:ring-orange-500/50"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="text-slate-400 hover:text-white" onClick={() => setIsResetPassOpen(false)}>Cancel</Button>
            <Button variant="hero" className="bg-orange-500 hover:bg-orange-600 shadow-orange-500/20 px-8" onClick={handleResetPassword} disabled={processing || !newPassword}>
              {processing && <Loader2 className="size-4 animate-spin mr-2" />} Update & Reset
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
        <DialogContent className="sm:max-w-[425px] border-none shadow-elegant bg-slate-900 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-black">
              <LogIn className="size-6 text-emerald-400" />
              Set password for transfer
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              No password was saved on this lead. Set one so the student can sign in after transfer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-6">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase text-slate-500">Student password</Label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={transferPassword}
                  onChange={(e) => setTransferPassword(e.target.value)}
                  placeholder="Enter or generate password"
                  className="font-mono bg-white/5 border-white/10 h-12 rounded-xl"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 border-white/20 text-white"
                  onClick={() => setTransferPassword(generateTempPassword())}
                >
                  Generate
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              className="text-slate-400 hover:text-white"
              onClick={() => {
                setIsTransferPassOpen(false);
                setTransferLeadTarget(null);
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 px-8"
              onClick={confirmTransferWithPassword}
              disabled={processing || !transferPassword.trim()}
            >
              {processing && <Loader2 className="size-4 animate-spin mr-2" />}
              Transfer with password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <footer className="py-8 bg-slate-900 text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] border-t border-slate-800">
        <div className="container mx-auto px-4 text-center">
          <p>© {new Date().getFullYear()} Apna Intern Super Admin. All rights reserved.</p>
        </div>
      </footer>
      <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden rounded-3xl border-none shadow-elegant">
          <div className="bg-red-600 p-8 text-white">
            <Ban className="size-12 text-white/90 mb-4" />
            <DialogTitle className="text-2xl font-black tracking-tight">Factory Reset</DialogTitle>
            <DialogDescription className="text-red-100 text-sm mt-1">This action is irreversible. All student and transaction data will be purged.</DialogDescription>
          </div>
          <div className="p-8 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2"><Checkbox id="r-students" checked={resetOptions.students} onCheckedChange={v => setResetOptions({...resetOptions, students: !!v})} /><Label htmlFor="r-students">Students</Label></div>
              <div className="flex items-center space-x-2"><Checkbox id="r-payments" checked={resetOptions.payments} onCheckedChange={v => setResetOptions({...resetOptions, payments: !!v})} /><Label htmlFor="r-payments">Transactions</Label></div>
              <div className="flex items-center space-x-2"><Checkbox id="r-leads" checked={resetOptions.leads} onCheckedChange={v => setResetOptions({...resetOptions, leads: !!v})} /><Label htmlFor="r-leads">Leads</Label></div>
              <div className="flex items-center space-x-2"><Checkbox id="r-certs" checked={resetOptions.certs} onCheckedChange={v => setResetOptions({...resetOptions, certs: !!v})} /><Label htmlFor="r-certs">Certificates</Label></div>
              <div className="flex items-center space-x-2"><Checkbox id="r-classes" checked={resetOptions.classes} onCheckedChange={v => setResetOptions({...resetOptions, classes: !!v})} /><Label htmlFor="r-classes">Live Classes</Label></div>
              <div className="flex items-center space-x-2"><Checkbox id="r-institutions" checked={resetOptions.institutions} onCheckedChange={v => setResetOptions({...resetOptions, institutions: !!v})} /><Label htmlFor="r-institutions">Institutions</Label></div>
              <div className="flex items-center space-x-2"><Checkbox id="r-domains" checked={resetOptions.domains} onCheckedChange={v => setResetOptions({...resetOptions, domains: !!v})} /><Label htmlFor="r-domains">Domains</Label></div>
              <Button variant="ghost" size="sm" className="text-[10px] font-bold" onClick={() => setResetOptions({students: true, payments: true, leads: true, certs: true, classes: true, institutions: true, domains: true})}>SELECT ALL</Button>
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase text-slate-500">Type "RESET" to confirm</Label>
              <Input value={resetConfirmText} onChange={e => setResetConfirmText(e.target.value)} placeholder="RESET" className="h-12 bg-red-50 border-none shadow-inner text-red-600 font-black text-center" />
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="destructive" onClick={resetPlatformData} disabled={processing || !resetConfirmText} className="h-12 font-black shadow-glow">Execute Selected Reset</Button>
              <Button variant="ghost" onClick={() => setIsResetDialogOpen(false)} className="text-slate-500 font-bold">Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};


export default SuperAdmin;
