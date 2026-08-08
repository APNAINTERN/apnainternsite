import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Award,
  BookOpen,
  CheckSquare,
  ClipboardList,
  Download,
  Eye,
  FileCheck,
  FileText,
  Loader2,
  Lock,
  ScrollText,
  Upload,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { LearningPanelTab } from "@/components/student/StudentLearningPanel";
import { StudentMyCoursesPanel } from "@/components/student/StudentMyCoursesPanel";
import type { StudentDocumentId, StudentDocumentMeta } from "@/hooks/useStudentDocumentActions";
type Accent = {
  border: string;
  iconBg: string;
  iconColor: string;
  status: string;
  button: string;
  buttonHover: string;
  viewBtn: string;
};

type LearningModule = {
  id: LearningPanelTab;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: Accent;
  statusLabel: string;
};

type DocumentVisual = {
  id: StudentDocumentId;
  icon: LucideIcon;
  accent: Accent;
};

const LEARNING_ACCENTS = {
  blue: {
    border: "border-t-blue-500",
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    status: "text-blue-600",
    button: "bg-blue-600",
    buttonHover: "hover:bg-blue-700",
    viewBtn: "text-blue-600 hover:bg-blue-50",
  },
  purple: {
    border: "border-t-violet-500",
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
    status: "text-violet-600",
    button: "bg-violet-600",
    buttonHover: "hover:bg-violet-700",
    viewBtn: "text-violet-600 hover:bg-violet-50",
  },
  amber: {
    border: "border-t-amber-500",
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    status: "text-amber-600",
    button: "bg-amber-500",
    buttonHover: "hover:bg-amber-600",
    viewBtn: "text-amber-600 hover:bg-amber-50",
  },
  green: {
    border: "border-t-emerald-500",
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    status: "text-emerald-600",
    button: "bg-emerald-600",
    buttonHover: "hover:bg-emerald-700",
    viewBtn: "text-emerald-600 hover:bg-emerald-50",
  },
} as const;

const DOCUMENT_ACCENTS: Record<StudentDocumentId, Accent> = {
  consent: {
    border: "border-t-violet-500",
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
    status: "text-violet-600",
    button: "bg-violet-600",
    buttonHover: "hover:bg-violet-700",
    viewBtn: "text-violet-600 hover:bg-violet-50",
  },
  acceptance: {
    border: "border-t-teal-500",
    iconBg: "bg-teal-50",
    iconColor: "text-teal-600",
    status: "text-teal-600",
    button: "bg-teal-600",
    buttonHover: "hover:bg-teal-700",
    viewBtn: "text-teal-600 hover:bg-teal-50",
  },
  logbook: {
    border: "border-t-orange-500",
    iconBg: "bg-orange-50",
    iconColor: "text-orange-600",
    status: "text-orange-600",
    button: "bg-orange-500",
    buttonHover: "hover:bg-orange-600",
    viewBtn: "text-orange-600 hover:bg-orange-50",
  },
  certificate: {
    border: "border-t-rose-500",
    iconBg: "bg-rose-50",
    iconColor: "text-rose-600",
    status: "text-rose-600",
    button: "bg-rose-600",
    buttonHover: "hover:bg-rose-700",
    viewBtn: "text-rose-600 hover:bg-rose-50",
  },
  attendance: {
    border: "border-t-emerald-500",
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    status: "text-emerald-600",
    button: "bg-emerald-600",
    buttonHover: "hover:bg-emerald-700",
    viewBtn: "text-emerald-600 hover:bg-emerald-50",
  },
  project: {
    border: "border-t-indigo-500",
    iconBg: "bg-indigo-50",
    iconColor: "text-indigo-600",
    status: "text-indigo-600",
    button: "bg-indigo-600",
    buttonHover: "hover:bg-indigo-700",
    viewBtn: "text-indigo-600 hover:bg-indigo-50",
  },
};

const DOCUMENT_ICONS: Record<StudentDocumentId, LucideIcon> = {
  consent: FileCheck,
  acceptance: ScrollText,
  logbook: ClipboardList,
  certificate: Award,
  attendance: CheckSquare,
  project: FileText,
};

function SectionHeader({
  title,
  subtitle,
  countLabel,
}: {
  title: string;
  subtitle: string;
  countLabel: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <span className="w-1 h-7 rounded-full bg-orange-500 shrink-0" />
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">{title}</h2>
        </div>
        <p className="text-sm text-slate-500 max-w-2xl ml-4">{subtitle}</p>
      </div>
      <Badge variant="secondary" className="self-start sm:self-auto font-bold text-[10px] tracking-wider uppercase">
        {countLabel}
      </Badge>
    </div>
  );
}

function LearningCard({
  module,
  onOpen,
  locked,
}: {
  module: LearningModule;
  onOpen: () => void;
  locked?: boolean;
}) {
  const Icon = module.icon;
  const a = module.accent;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group text-left bg-white rounded-2xl border border-slate-100 border-t-4 ${a.border} shadow-sm hover:shadow-md transition-all p-5 flex flex-col min-h-[220px] ${
        locked ? "opacity-90" : ""
      }`}
    >
      <div className={`size-11 rounded-xl ${a.iconBg} ${a.iconColor} flex items-center justify-center mb-4 relative`}>
        <Icon className="size-5" />
        {locked ? (
          <span className="absolute -right-1 -top-1 size-5 rounded-full bg-amber-500 text-white flex items-center justify-center">
            <Lock className="size-3" />
          </span>
        ) : null}
      </div>
      <h3 className="font-bold text-slate-900 text-base mb-2">{module.title}</h3>
      <p className="text-sm text-slate-500 leading-relaxed flex-1">{module.description}</p>
      <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
        <span className={`text-[10px] font-black uppercase tracking-wider ${locked ? "text-amber-600" : a.status}`}>
          {locked ? "Locked · Pay to unlock" : module.statusLabel}
        </span>
        <span className={`size-8 rounded-full ${a.button} ${a.buttonHover} text-white flex items-center justify-center shrink-0 transition-colors`}>
          {locked ? <Lock className="size-3.5" /> : <ArrowRight className="size-4" />}
        </span>
      </div>
    </button>
  );
}

function DocumentCard({
  doc,
  accent,
  icon: Icon,
  downloading,
  uploading,
  onView,
  onDownload,
  onUpload,
}: {
  doc: StudentDocumentMeta;
  accent: Accent;
  icon: LucideIcon;
  downloading: boolean;
  uploading?: boolean;
  onView: () => void;
  onDownload: () => void;
  onUpload?: () => void;
}) {
  const busy = downloading || uploading;

  return (
    <div
      className={`bg-white rounded-2xl border border-slate-100 border-t-4 ${accent.border} shadow-sm p-5 flex flex-col min-h-[260px] ${!doc.ready && !doc.canUpload ? "opacity-90" : ""}`}
    >
      <div className={`size-11 rounded-xl ${accent.iconBg} ${accent.iconColor} flex items-center justify-center mb-4`}>
        <Icon className="size-5" />
      </div>
      <h3 className="font-bold text-slate-900 text-base mb-2">{doc.title}</h3>
      <p className="text-sm text-slate-500 leading-relaxed flex-1">{doc.description}</p>
      <p className={`text-[10px] font-black uppercase tracking-wider mt-4 mb-3 ${accent.status}`}>
        {doc.statusLabel}
      </p>
      {doc.canUpload ? (
        <div className="grid grid-cols-3 gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!doc.ready || busy}
            className={`gap-1 font-bold text-[10px] px-1 ${accent.viewBtn}`}
            onClick={onView}
          >
            <Eye className="size-3.5 shrink-0" />
            View
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!doc.ready || busy}
            className={`gap-1 font-bold text-[10px] px-1 text-white ${accent.button} ${accent.buttonHover}`}
            onClick={onDownload}
          >
            {downloading ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin" />
            ) : (
              <Download className="size-3.5 shrink-0" />
            )}
            Download
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            className="gap-1 font-bold text-[10px] px-1"
            onClick={onUpload}
          >
            {uploading ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin" />
            ) : (
              <Upload className="size-3.5 shrink-0" />
            )}
            Upload
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!doc.ready || busy}
            className={`gap-1.5 font-bold text-xs ${accent.viewBtn}`}
            onClick={onView}
          >
            <Eye className="size-3.5" />
            View
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!doc.ready || busy}
            className={`gap-1.5 font-bold text-xs text-white ${accent.button} ${accent.buttonHover}`}
            onClick={onDownload}
          >
            {downloading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            Download
          </Button>
        </div>
      )}
    </div>
  );
}

type Props = {
  profile: Record<string, unknown> | null;
  registrationLabel: string;
  onOfferLetter: () => void;
  onOpenLearning: (tab: LearningPanelTab) => void;
  liveClassCount: number;
  notesCount: number;
  activeAssignments: number;
  attendanceMarked: number;
  attendancePercentage: number;
  attendanceProgrammeDays: number;
  attendanceMarkedToday: boolean;
  documents: StudentDocumentMeta[];
  downloadingDoc: StudentDocumentId | null;
  uploadingConsent?: boolean;
  onViewDocument: (id: StudentDocumentId) => void;
  onDownloadDocument: (id: StudentDocumentId) => void;
  onUploadDocument?: (id: StudentDocumentId) => void;
  studentId?: string | null;
  onOpenMyCourses?: () => void;
  /** When false, internship learning/docs stay locked and clicks go to payment. */
  internshipUnlocked?: boolean;
  onLockedInternshipClick?: () => void;
};

export function StudentHomeView({
  profile,
  registrationLabel,
  onOfferLetter,
  onOpenLearning,
  liveClassCount,
  notesCount,
  activeAssignments,
  attendanceMarked,
  attendancePercentage,
  attendanceProgrammeDays,
  attendanceMarkedToday,
  documents,
  downloadingDoc,
  uploadingConsent = false,
  onViewDocument,
  onDownloadDocument,
  onUploadDocument,
  studentId,
  onOpenMyCourses,
  internshipUnlocked = true,
  onLockedInternshipClick,
}: Props) {
  const firstName = String(profile?.full_name || "Student").split(" ")[0];
  const initial = String(profile?.full_name || "S").charAt(0).toUpperCase();
  const learningModules: LearningModule[] = [
    {
      id: "classes",
      title: "Classes",
      description:
        "Watch every live class in order — Day 1, Day 2, and so on. Join live or replay the recording.",
      icon: Video,
      accent: LEARNING_ACCENTS.blue,
      statusLabel: `${liveClassCount} SCHEDULED`,
    },
    {
      id: "notes",
      title: "Notes",
      description:
        "Download study notes arranged day-wise — Day 1 Notes, Day 2 Notes, and so on.",
      icon: BookOpen,
      accent: LEARNING_ACCENTS.purple,
      statusLabel:
        notesCount > 0
          ? `${notesCount} note${notesCount === 1 ? "" : "s"} available`
          : "No notes yet",
    },
    {
      id: "assignments",
      title: "Assignments",
      description:
        "Complete your active assignments and review marks on submitted work.",
      icon: FileText,
      accent: LEARNING_ACCENTS.amber,
      statusLabel:
        activeAssignments > 0
          ? `${activeAssignments} active`
          : "All submitted",
    },
    {
      id: "attendance",
      title: "Attendance",
      description:
        "See how regular you are — total days marked, programme days, and attendance percentage.",
      icon: CheckSquare,
      accent: LEARNING_ACCENTS.green,
      statusLabel: `${attendanceMarked} / ${attendanceProgrammeDays} days · ${attendancePercentage.toFixed(0)}%${
        attendanceMarkedToday ? " · marked today" : ""
      }`,
    },
  ];

  return (
    <div className="space-y-10">
      <section className="rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-6 md:p-8 shadow-elegant">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-center gap-5 min-w-0">
            <div className="size-16 md:size-[4.5rem] rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-2xl md:text-3xl font-black shrink-0">
              {initial}
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl md:text-4xl font-black tracking-tight truncate">
                Howdy, {firstName}!
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm text-white/60">
                <span>Student Dashboard</span>
                {registrationLabel ? (
                  <>
                    <span className="size-1 rounded-full bg-white/30 hidden sm:inline" />
                    <span className="font-mono text-xs text-white/50">{registrationLabel}</span>
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <Button
            size="lg"
            variant="outline"
            className="border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white font-semibold gap-2 shrink-0 self-start lg:self-center"
            onClick={() => {
              if (!internshipUnlocked) {
                onLockedInternshipClick?.();
                return;
              }
              onOfferLetter();
            }}
          >
            {internshipUnlocked ? <FileText className="size-4" /> : <Lock className="size-4" />}
            Offer Letter
          </Button>
        </div>
      </section>

      {!internshipUnlocked ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 flex gap-3 items-start">
          <Lock className="size-4 shrink-0 mt-0.5 text-amber-700" />
          <p>
            You have course access only. Internship modules stay locked until you complete the
            internship registration payment.
          </p>
        </div>
      ) : null}

      {studentId ? (
        <StudentMyCoursesPanel
          studentId={studentId}
          compact
          onViewAll={onOpenMyCourses}
        />
      ) : null}

      <section>
        <SectionHeader
          title="Learning"
          subtitle={
            internshipUnlocked
              ? "Daily study activities — classes, notes, assignments and attendance."
              : "Internship learning modules — unlock with college registration payment."
          }
          countLabel="4 modules"
        />
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {learningModules.map((module) => (
            <LearningCard
              key={module.id}
              module={module}
              locked={!internshipUnlocked}
              onOpen={() => {
                if (!internshipUnlocked) {
                  onLockedInternshipClick?.();
                  return;
                }
                onOpenLearning(module.id);
              }}
            />
          ))}
        </div>
      </section>

      <section>
        <SectionHeader
          title="Documents"
          subtitle={
            internshipUnlocked
              ? "Official internship papers — pre-filled with your registration details. View in browser or download as PDF."
              : "Internship documents unlock after the internship registration payment."
          }
          countLabel={`${documents.length} documents`}
        />
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {documents.map((doc) => (
            <div key={doc.id} className="relative">
              <DocumentCard
                doc={doc}
                accent={DOCUMENT_ACCENTS[doc.id]}
                icon={DOCUMENT_ICONS[doc.id]}
                downloading={downloadingDoc === doc.id}
                uploading={doc.id === "consent" && uploadingConsent}
                onView={() => {
                  if (!internshipUnlocked) {
                    onLockedInternshipClick?.();
                    return;
                  }
                  onViewDocument(doc.id);
                }}
                onDownload={() => {
                  if (!internshipUnlocked) {
                    onLockedInternshipClick?.();
                    return;
                  }
                  onDownloadDocument(doc.id);
                }}
                onUpload={
                  onUploadDocument
                    ? () => {
                        if (!internshipUnlocked) {
                          onLockedInternshipClick?.();
                          return;
                        }
                        onUploadDocument(doc.id);
                      }
                    : undefined
                }
              />
              {!internshipUnlocked ? (
                <button
                  type="button"
                  className="absolute inset-0 rounded-2xl bg-white/55 backdrop-blur-[1px] flex items-center justify-center"
                  onClick={() => onLockedInternshipClick?.()}
                >
                  <span className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-black text-white">
                    <Lock className="size-3.5" /> Pay to unlock
                  </span>
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <footer className="text-center text-[11px] text-slate-400 pb-4">
        Apna Intern · Patna, Bihar · CIN U85500BR2024PTC072653
      </footer>
    </div>
  );
}
