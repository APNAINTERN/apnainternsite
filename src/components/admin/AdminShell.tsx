import type { ReactNode } from "react";
import {
  ClipboardList,
  Award,
  Bell,
  BookOpen,
  CheckSquare,
  ChevronLeft,
  Cog,
  DollarSign,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Image,
  IdCard,
  IndianRupee,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Settings,
  Share2,
  Store,
  UploadCloud,
  UserPlus,
  Users,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const navItemClass =
  "justify-start gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-semibold transition-all data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-sm hover:bg-slate-50";

const sectionClass =
  "px-3 pt-4 pb-1 text-[10px] font-black uppercase tracking-widest text-slate-400 first:pt-0";

export const ADMIN_TAB_LABELS: Record<string, string> = {
  dashboard: "Dashboard Overview",
  students: "Students Directory",
  "engineering-directory": "Engineering Directory",
  attendance: "Attendance Tracking",
  "employee-attendance": "Employee Attendance",
  "staff-management": "Staff Management",
  bulk: "Certificates",
  "id-cards": "ID Card Generation",
  uploads: "Uploads",
  classes: "Live Classes",
  payments: "Transactions & Revenue",
  leads: "Leads Hub",
  "lead-assignment": "Lead Assignment",
  notifications: "Notifications",
  assignments: "Assignments Portal",
  comms: "Communications Center",
  cybercafe: "Cyber Cafes",
  referrals: "Referrals",
  "college-rosters": "College Rosters",
  "fees-management": "Fees Management",
  "course-management": "Course Management",
  "add-registration": "Add Registration",
  "student-data-upload": "Student Data Upload",
  gallery: "Gallery Management",
  "home-cms": "Home Page Content",
  "consult-letter": "Consent Form Template",
  settings: "System Settings",
};

type AdminNavProps = {
  isServiceEnabled: (key: string) => boolean;
  onNavigateEngineering: () => void;
  onNavigateNonEngineering: () => void;
};

function AdminNavItems({
  isServiceEnabled,
  onNavigateEngineering,
  onNavigateNonEngineering,
}: AdminNavProps) {
  return (
    <>
      <div className={sectionClass}>Overview</div>
      <TabsTrigger value="dashboard" className={navItemClass}>
        <LayoutDashboard className="size-4 shrink-0" /> Dashboard
      </TabsTrigger>

      {isServiceEnabled("students") && (
        <>
          <div className={sectionClass}>Students</div>
          <TabsTrigger value="students" className={navItemClass}>
            <Users className="size-4 shrink-0" /> Directory
          </TabsTrigger>
          <TabsTrigger value="engineering-directory" className={navItemClass}>
            <Wrench className="size-4 shrink-0" /> Engineering
          </TabsTrigger>
          <button
            type="button"
            onClick={onNavigateEngineering}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50"
          >
            <Cog className="size-4 shrink-0" /> Eng. Management
          </button>
          <button
            type="button"
            onClick={onNavigateNonEngineering}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50"
          >
            <BookOpen className="size-4 shrink-0" /> Non-Tech Management
          </button>
          <TabsTrigger
            value="add-registration"
            className={cn(navItemClass, "data-[state=active]:bg-emerald-600")}
          >
            <UserPlus className="size-4 shrink-0" /> Add Registration
          </TabsTrigger>
          <TabsTrigger
            value="student-data-upload"
            className={cn(navItemClass, "data-[state=active]:bg-teal-600")}
          >
            <FileSpreadsheet className="size-4 shrink-0" /> Student Data Upload
          </TabsTrigger>
        </>
      )}

      <div className={sectionClass}>Academics</div>
      {/* Always show Student Attendance — do not gate/remove (false permission defaults hid this). */}
      <TabsTrigger value="attendance" className={navItemClass}>
        <CheckSquare className="size-4 shrink-0" /> Attendance
      </TabsTrigger>
      <TabsTrigger value="staff-management" className={navItemClass}>
        <Users className="size-4 shrink-0" /> Staff Management
      </TabsTrigger>
      {isServiceEnabled("bulk") && (
        <TabsTrigger value="bulk" className={navItemClass}>
          <Award className="size-4 shrink-0" /> Certificates
        </TabsTrigger>
      )}
      {isServiceEnabled("bulk") && (
        <TabsTrigger value="id-cards" className={navItemClass}>
          <IdCard className="size-4 shrink-0" /> ID Cards
        </TabsTrigger>
      )}
      {isServiceEnabled("classes") && (
        <>
          <TabsTrigger value="uploads" className={navItemClass}>
            <UploadCloud className="size-4 shrink-0" /> Uploads
          </TabsTrigger>
          <TabsTrigger value="classes" className={navItemClass}>
            <BookOpen className="size-4 shrink-0" /> Live Classes
          </TabsTrigger>
        </>
      )}
      <TabsTrigger value="course-management" className={navItemClass}>
        <GraduationCap className="size-4 shrink-0" /> Course Management
      </TabsTrigger>

      {(isServiceEnabled("payments") || isServiceEnabled("leads")) && (
        <div className={sectionClass}>Revenue</div>
      )}
      {isServiceEnabled("payments") && (
        <TabsTrigger value="payments" className={navItemClass}>
          <DollarSign className="size-4 shrink-0" /> Payments
        </TabsTrigger>
      )}
      {isServiceEnabled("leads") && (
        <TabsTrigger value="leads" className={navItemClass}>
          <UserPlus className="size-4 shrink-0" /> Leads
        </TabsTrigger>
      )}
      {isServiceEnabled("leads") && (
        <TabsTrigger value="lead-assignment" className={navItemClass}>
          <ClipboardList className="size-4 shrink-0" /> Lead Assignment
        </TabsTrigger>
      )}
      <TabsTrigger value="fees-management" className={navItemClass}>
        <IndianRupee className="size-4 shrink-0" /> Fees
      </TabsTrigger>

      {(isServiceEnabled("notifications") ||
        isServiceEnabled("assignments") ||
        isServiceEnabled("comms")) && <div className={sectionClass}>Communications</div>}
      {isServiceEnabled("notifications") && (
        <TabsTrigger value="notifications" className={navItemClass}>
          <Bell className="size-4 shrink-0" /> Notifications
        </TabsTrigger>
      )}
      {isServiceEnabled("assignments") && (
        <TabsTrigger value="assignments" className={navItemClass}>
          <FileText className="size-4 shrink-0" /> Assignments
        </TabsTrigger>
      )}
      {isServiceEnabled("comms") && (
        <TabsTrigger value="comms" className={navItemClass}>
          <Mail className="size-4 shrink-0" /> Comms Center
        </TabsTrigger>
      )}

      <div className={sectionClass}>Partners</div>
      <TabsTrigger value="cybercafe" className={navItemClass}>
        <Store className="size-4 shrink-0" /> Cyber Cafes
      </TabsTrigger>
      <TabsTrigger value="referrals" className={navItemClass}>
        <Share2 className="size-4 shrink-0" /> Referrals
      </TabsTrigger>
      <TabsTrigger value="college-rosters" className={navItemClass}>
        <FileSpreadsheet className="size-4 shrink-0" /> Rosters
      </TabsTrigger>

      <div className={sectionClass}>Website</div>
      <TabsTrigger value="gallery" className={navItemClass}>
        <Image className="size-4 shrink-0" /> Gallery
      </TabsTrigger>
      <TabsTrigger value="home-cms" className={navItemClass}>
        <LayoutDashboard className="size-4 shrink-0" /> Home Content
      </TabsTrigger>
      <TabsTrigger value="consult-letter" className={navItemClass}>
        <FileText className="size-4 shrink-0" /> Consent Form
      </TabsTrigger>

      <div className={sectionClass}>System</div>
      <TabsTrigger value="settings" className={cn(navItemClass, "data-[state=active]:bg-blue-600")}>
        <Settings className="size-4 shrink-0" /> Settings
      </TabsTrigger>
    </>
  );
}

type AdminSidebarFooterProps = {
  onLogout: () => void;
};

function AdminSidebarFooter({ onLogout }: AdminSidebarFooterProps) {
  return (
    <div className="mt-auto shrink-0 border-t border-slate-100 bg-slate-50/80 p-4">
      <Button
        variant="ghost"
        size="sm"
        className="w-full text-xs font-bold text-destructive hover:bg-destructive/10"
        onClick={onLogout}
      >
        <LogOut className="size-3.5 mr-1" />
        Logout
      </Button>
    </div>
  );
}

type AdminSidebarProps = AdminNavProps &
  AdminSidebarFooterProps & {
    onCollapse: () => void;
    className?: string;
  };

export function AdminSidebar({
  isServiceEnabled,
  onNavigateEngineering,
  onNavigateNonEngineering,
  onCollapse,
  className,
  ...footer
}: AdminSidebarProps) {
  return (
    <aside
      className={cn(
        "hidden lg:flex w-[17rem] shrink-0 flex-col border-r border-slate-200 bg-white shadow-sm sticky top-0 h-screen",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-9 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-white">
            <img src="/logo-icon.png" alt="Apna Intern" className="h-full w-full object-contain p-0.5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-900">Admin Portal</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Apna Intern
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 text-slate-500"
          onClick={onCollapse}
          title="Hide menu"
        >
          <ChevronLeft className="size-4" />
        </Button>
      </div>

      <TabsList className="flex h-auto min-h-0 flex-1 flex-col items-stretch justify-start gap-0 overflow-y-auto rounded-none border-0 bg-transparent p-3 shadow-none">
        <AdminNavItems
          isServiceEnabled={isServiceEnabled}
          onNavigateEngineering={onNavigateEngineering}
          onNavigateNonEngineering={onNavigateNonEngineering}
        />
      </TabsList>

      <AdminSidebarFooter {...footer} />
    </aside>
  );
}

type AdminMobileNavProps = AdminNavProps &
  AdminSidebarFooterProps & {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  };

export function AdminMobileNav({
  open,
  onOpenChange,
  isServiceEnabled,
  onNavigateEngineering,
  onNavigateNonEngineering,
  ...footer
}: AdminMobileNavProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="flex w-[18rem] flex-col p-0 sm:max-w-[18rem]">
        <SheetHeader className="border-b border-slate-100 px-5 py-4 text-left">
          <SheetTitle className="text-sm font-black">Admin Menu</SheetTitle>
        </SheetHeader>
        <TabsList className="flex h-auto min-h-0 flex-1 flex-col items-stretch justify-start gap-0 overflow-y-auto rounded-none border-0 bg-transparent p-3 shadow-none">
          <AdminNavItems
            isServiceEnabled={isServiceEnabled}
            onNavigateEngineering={() => {
              onNavigateEngineering();
              onOpenChange(false);
            }}
            onNavigateNonEngineering={() => {
              onNavigateNonEngineering();
              onOpenChange(false);
            }}
          />
        </TabsList>
        <AdminSidebarFooter {...footer} />
      </SheetContent>
    </Sheet>
  );
}

type AdminTopBarProps = {
  activeTab: string;
  showSidebar: boolean;
  onOpenMenu: () => void;
  onShowSidebar: () => void;
  visitorCount: number;
  uniqueVisitorCount: number;
  toolbar?: ReactNode;
};

export function AdminTopBar({
  activeTab,
  showSidebar,
  onOpenMenu,
  onShowSidebar,
  visitorCount,
  uniqueVisitorCount,
  toolbar,
}: AdminTopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-4 backdrop-blur-md md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9 shrink-0 lg:hidden"
          onClick={onOpenMenu}
        >
          <Menu className="size-4" />
        </Button>
        {!showSidebar && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="hidden gap-2 lg:inline-flex"
            onClick={onShowSidebar}
          >
            <Menu className="size-4" />
            Show menu
          </Button>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-black tracking-tight text-slate-900 md:text-xl">
            {ADMIN_TAB_LABELS[activeTab] || "Admin Panel"}
          </h1>
          <p className="hidden text-[10px] font-bold uppercase tracking-widest text-slate-400 sm:block">
            Unified management
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <div className="hidden items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-1.5 sm:flex">
          <div className="text-center">
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">
              Views
            </div>
            <div className="text-sm font-black text-blue-600">{visitorCount.toLocaleString()}</div>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <div className="text-center">
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">
              Visitors
            </div>
            <div className="text-sm font-black text-indigo-600">
              {uniqueVisitorCount.toLocaleString()}
            </div>
          </div>
        </div>
        {toolbar}
      </div>
    </header>
  );
}
