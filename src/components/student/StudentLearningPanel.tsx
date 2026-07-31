import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Award,
  BookOpen,
  Calendar,
  CheckSquare,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Video,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { scrollableDialogShellClass } from "@/components/ui/scrollable-dialog";
import { assignmentTypeLabel } from "@/lib/assignmentApi";
import {
  classJoinUrl,
  inferLinkTypeFromUrl,
  youtubeEmbedUrl,
} from "@/lib/classLinkTargeting";
import type { LearningMaterialRow } from "@/lib/learningMaterialsApi";
import {
  attendancePresentDaySet,
  attendanceReportSummary,
  internshipProgrammeDayKeys,
} from "@/lib/studentPortalDocuments";
import { calcAttendancePercentage } from "@/lib/attendanceStats";
import { resolveInternshipProgrammeConfig } from "@/lib/internshipProgramme";

type LiveClass = {
  id: string;
  title?: string | null;
  description?: string | null;
  url?: string | null;
  link_type?: string | null;
  scheduled_at?: string | null;
  internship_domains?: { name?: string | null } | null;
};

type AssignmentRow = {
  id: string;
  title: string;
  description?: string | null;
  assignment_type: string;
  duration_minutes?: number | null;
  total_marks?: number | null;
  due_at?: string | null;
  submission?: {
    grading_status?: string | null;
    is_passed?: boolean | null;
    score?: number | null;
  } | null;
};

type AttendanceRecord = { marked_at?: string | null; is_present?: boolean | null; is_leave?: boolean | null };

export type LearningPanelTab = "classes" | "assignments" | "notes" | "attendance";

const MODULE_META: Record<
  LearningPanelTab,
  { title: string; description: string; icon: LucideIcon }
> = {
  classes: {
    title: "Classes",
    description: "Join live sessions or watch recordings — Day 1, Day 2, and so on.",
    icon: Video,
  },
  assignments: {
    title: "Assignments",
    description: "Active tasks and your submitted work.",
    icon: FileText,
  },
  notes: {
    title: "Notes",
    description: "Study notes shared day-wise by the team.",
    icon: BookOpen,
  },
  attendance: {
    title: "Attendance",
    description: "Your programme attendance overview.",
    icon: CheckSquare,
  },
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  liveClasses: LiveClass[];
  assignments: AssignmentRow[];
  notes: LearningMaterialRow[];
  attendanceRecords: AttendanceRecord[];
  universityName?: string;
  liveClassesEnabled?: boolean;
  defaultTab?: LearningPanelTab;
  /** When true, only the selected module is shown — no tab bar. */
  singleModule?: boolean;
};

function noteDayLabel(title: string, index: number): string {
  const match = title.match(/day\s*(\d+)/i);
  if (match) return `Day ${match[1]}`;
  return `Day ${index + 1}`;
}

/** Scroll region inside fixed-height learning modals. */
function TabPanelScroll({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex-1 min-h-0">
      <div className="absolute inset-0 overflow-y-auto overscroll-y-contain">
        <div className="p-6 pb-8">{children}</div>
      </div>
    </div>
  );
}

const tabPanelClass =
  "relative mt-0 flex flex-col flex-1 min-h-0 overflow-hidden h-full data-[state=inactive]:hidden";

export function StudentLearningPanel({
  open,
  onOpenChange,
  liveClasses,
  assignments,
  notes,
  attendanceRecords,
  universityName = "",
  liveClassesEnabled = true,
  defaultTab = "classes",
  singleModule = false,
}: Props) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<LearningPanelTab>(defaultTab);

  useEffect(() => {
    if (open) setTab(defaultTab);
  }, [open, defaultTab]);

  const activeAssignments = useMemo(
    () => assignments.filter((a) => !a.submission),
    [assignments]
  );
  const submittedAssignments = useMemo(
    () => assignments.filter((a) => !!a.submission),
    [assignments]
  );

  const attendanceSummary = useMemo(
    () => attendanceReportSummary(attendanceRecords, universityName),
    [attendanceRecords, universityName]
  );
  const presentDays = useMemo(
    () => attendancePresentDaySet(attendanceRecords),
    [attendanceRecords]
  );
  const programmeDays = useMemo(
    () => internshipProgrammeDayKeys(universityName),
    [universityName]
  );
  const programmeConfig = useMemo(
    () => resolveInternshipProgrammeConfig(universityName),
    [universityName]
  );
  const moduleMeta = MODULE_META[tab];
  const ModuleIcon = moduleMeta.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`max-w-5xl border-none shadow-2xl ${scrollableDialogShellClass}`}
        closeClassName={
          singleModule
            ? "text-white hover:text-white opacity-90 hover:opacity-100"
            : undefined
        }
      >
        <DialogHeader
          className={
            singleModule
              ? "p-6 pr-14 bg-slate-900 text-white border-b border-white/10 shrink-0"
              : "p-6 pr-14 bg-muted/30 border-b shrink-0"
          }
        >
          {singleModule ? (
            <>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                <ModuleIcon className="size-6 text-white/90" />
                {moduleMeta.title}
              </DialogTitle>
              <DialogDescription className="text-white/70">{moduleMeta.description}</DialogDescription>
            </>
          ) : (
            <>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                <BookOpen className="size-6 text-primary" /> Learning
              </DialogTitle>
              <DialogDescription>
                Classes, assignments, study notes, and your attendance overview.
              </DialogDescription>
            </>
          )}
        </DialogHeader>

        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <Tabs
          value={tab}
          onValueChange={singleModule ? undefined : (v) => setTab(v as LearningPanelTab)}
          className="flex flex-col flex-1 min-h-0 overflow-hidden"
        >
          {!singleModule ? (
            <div className="px-6 pt-4 border-b bg-white shrink-0">
              <TabsList className="grid w-full grid-cols-4 h-auto">
                <TabsTrigger value="classes" className="text-xs sm:text-sm">Classes</TabsTrigger>
                <TabsTrigger value="assignments" className="text-xs sm:text-sm">Assignments</TabsTrigger>
                <TabsTrigger value="notes" className="text-xs sm:text-sm">Notes</TabsTrigger>
                <TabsTrigger value="attendance" className="text-xs sm:text-sm">Attendance</TabsTrigger>
              </TabsList>
            </div>
          ) : null}

            <TabsContent value="classes" className={tabPanelClass}>
              <TabPanelScroll>
                <div className="space-y-4">
              {!liveClassesEnabled ? (
                <p className="text-center text-muted-foreground py-10">Live classes are currently disabled.</p>
              ) : liveClasses.length === 0 ? (
                <Card className="p-10 text-center border-none shadow-sm">
                  <BookOpen className="size-10 text-slate-300 mx-auto mb-4" />
                  <p className="font-bold text-slate-800">No classes scheduled yet</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Classes appear here in order — Day 1, Day 2, and so on.
                  </p>
                </Card>
              ) : (
                liveClasses.map((c, idx) => {
                  const sessionType =
                    c.link_type === "youtube" || inferLinkTypeFromUrl(c.url || "") === "youtube"
                      ? "youtube"
                      : c.link_type;
                  const joinUrl = classJoinUrl(c.url || "", sessionType);
                  const embedUrl = sessionType === "youtube" ? youtubeEmbedUrl(c.url || "") : null;
                  const scheduled = c.scheduled_at ? new Date(c.scheduled_at) : null;
                  const isPast = scheduled ? scheduled.getTime() < Date.now() : false;

                  return (
                    <Card key={c.id} className="overflow-hidden border-none shadow-sm">
                      <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <Badge className="bg-primary/10 text-primary border-none text-[10px]">
                              Day {idx + 1}
                            </Badge>
                            {scheduled ? (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Calendar className="size-3" />
                                {scheduled.toLocaleDateString([], { dateStyle: "medium" })}
                                {" · "}
                                {scheduled.toLocaleTimeString([], { timeStyle: "short" })}
                              </span>
                            ) : null}
                          </div>
                          <h4 className="font-bold text-lg">{c.title || `Class ${idx + 1}`}</h4>
                          {!singleModule && c.description ? (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{c.description}</p>
                          ) : null}
                        </div>
                        <div className="flex flex-col gap-2 shrink-0">
                          <a href={joinUrl} target="_blank" rel="noopener noreferrer">
                            <Button className="w-full sm:w-auto gap-2">
                              <ExternalLink className="size-4" />
                              {isPast ? "Watch Recording" : "Join Class"}
                            </Button>
                          </a>
                          {!singleModule && !isPast && scheduled ? (
                            <p className="text-[10px] text-center text-violet-600 font-bold uppercase">
                              Scheduled {scheduled.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      {!singleModule && sessionType === "youtube" && embedUrl ? (
                        <div className="relative w-full aspect-video bg-black">
                          <iframe
                            src={embedUrl}
                            title={c.title || "Class recording"}
                            className="absolute inset-0 w-full h-full border-0"
                            allowFullScreen
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          />
                        </div>
                      ) : null}
                    </Card>
                  );
                })
              )}
                </div>
              </TabPanelScroll>
            </TabsContent>

            <TabsContent value="assignments" className={tabPanelClass}>
              <Tabs defaultValue="active" className="relative flex flex-col flex-1 min-h-0 h-full">
                <div className="px-6 pt-4 shrink-0 border-b bg-white/80 z-10">
                  <TabsList className="mb-0">
                    <TabsTrigger value="active">Active ({activeAssignments.length})</TabsTrigger>
                    <TabsTrigger value="submitted">Submitted ({submittedAssignments.length})</TabsTrigger>
                  </TabsList>
                </div>

                <div className="relative flex-1 min-h-0">
                <TabsContent value="active" className={`${tabPanelClass} absolute inset-0 top-0`}>
                  <TabPanelScroll>
                    <div className="space-y-4">
                  {activeAssignments.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No active assignments right now.</p>
                  ) : (
                    activeAssignments.map((a) => {
                      const overdue = a.due_at && new Date(a.due_at).getTime() < Date.now();
                      return (
                        <Card key={a.id} className="p-5 border-none shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div>
                            <h4 className="font-bold flex flex-wrap items-center gap-2">
                              {a.title}
                              <Badge variant="outline" className="text-[10px] uppercase">
                                {assignmentTypeLabel(a.assignment_type)}
                              </Badge>
                            </h4>
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {a.description || "Open to view instructions and submit your work."}
                            </p>
                            <div className="flex flex-wrap gap-3 text-xs font-bold text-slate-500 uppercase mt-2">
                              {a.assignment_type === "mcq" ? (
                                <span className="flex items-center gap-1"><Clock className="size-3" /> {a.duration_minutes} Mins</span>
                              ) : (
                                <span className="flex items-center gap-1 text-emerald-600"><Clock className="size-3" /> No timer</span>
                              )}
                              <span className="flex items-center gap-1"><Award className="size-3" /> {a.total_marks} Marks</span>
                              {a.due_at ? (
                                <span className={overdue ? "text-destructive" : ""}>
                                  Due {new Date(a.due_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          {overdue ? (
                            <Button variant="outline" disabled>Deadline passed</Button>
                          ) : (
                            <Button onClick={() => { onOpenChange(false); navigate(`/assignment/${a.id}`); }}>
                              Open assignment
                            </Button>
                          )}
                        </Card>
                      );
                    })
                  )}
                    </div>
                  </TabPanelScroll>
                </TabsContent>

                <TabsContent value="submitted" className={`${tabPanelClass} absolute inset-0 top-0`}>
                  <TabPanelScroll>
                    <div className="space-y-4">
                  {submittedAssignments.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No submitted assignments yet.</p>
                  ) : (
                    submittedAssignments.map((a) => (
                        <Card key={a.id} className="p-5 border-none shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div>
                            <h4 className="font-bold">{a.title}</h4>
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              <Badge>Submitted</Badge>
                            </div>
                          </div>
                          <Button
                            onClick={() => { onOpenChange(false); navigate(`/assignment/${a.id}`); }}
                          >
                            Resubmit
                          </Button>
                        </Card>
                    ))
                  )}
                    </div>
                  </TabPanelScroll>
                </TabsContent>
                </div>
              </Tabs>
            </TabsContent>

            <TabsContent value="notes" className={tabPanelClass}>
              <TabPanelScroll>
                <div className="space-y-4">
              {notes.length === 0 ? (
                <Card className="p-10 text-center border-none shadow-sm">
                  <FileText className="size-10 text-slate-300 mx-auto mb-4" />
                  <p className="font-bold">No study notes uploaded yet</p>
                  <p className="text-sm text-muted-foreground mt-2">Notes appear day-wise as they are shared by the team.</p>
                </Card>
              ) : (
                notes.map((note, idx) => (
                  <Card key={note.id} className="p-5 border-none shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <Badge variant="secondary" className="mb-2 text-[10px]">
                        {noteDayLabel(note.title, idx)}
                      </Badge>
                      <h4 className="font-bold text-lg">{note.title}</h4>
                      {note.description ? (
                        <p className="text-sm text-muted-foreground mt-1">{note.description}</p>
                      ) : null}
                    </div>
                    {note.file_url ? (
                      <a href={note.file_url} target="_blank" rel="noopener noreferrer" download={note.file_name || undefined}>
                        <Button variant="outline" className="gap-2">
                          <Download className="size-4" /> Download
                        </Button>
                      </a>
                    ) : (
                      <Button variant="outline" disabled>Unavailable</Button>
                    )}
                  </Card>
                ))
              )}
                </div>
              </TabPanelScroll>
            </TabsContent>

            <TabsContent value="attendance" className={tabPanelClass}>
              <TabPanelScroll>
                <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <Card className="p-4 text-center border-none shadow-sm bg-violet-50">
                  <p className="text-[10px] font-black uppercase text-violet-700">Days Marked</p>
                  <p className="text-3xl font-black text-violet-900">{attendanceSummary.totalMarked}</p>
                </Card>
                <Card className="p-4 text-center border-none shadow-sm bg-slate-50">
                  <p className="text-[10px] font-black uppercase text-slate-600">Programme Days</p>
                  <p className="text-3xl font-black text-slate-900">{attendanceSummary.programmeDays}</p>
                </Card>
                <Card className="p-4 text-center border-none shadow-sm bg-emerald-50">
                  <p className="text-[10px] font-black uppercase text-emerald-700">Attendance %</p>
                  <p className="text-3xl font-black text-emerald-900">
                    {calcAttendancePercentage(
                      attendanceSummary.totalMarked,
                      attendanceSummary.programmeDays
                    ).toFixed(1)}%
                  </p>
                </Card>
              </div>

              <div>
                <h4 className="font-bold flex items-center gap-2 mb-4">
                  <CheckSquare className="size-4 text-violet-600" /> Programme Calendar
                </h4>
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                  {programmeDays.map((dateKey, i) => {
                    const present = presentDays.has(dateKey);
                    const d = new Date(programmeConfig.programmeStartDate);
                    d.setDate(programmeConfig.programmeStartDate.getDate() + i);
                    return (
                      <div
                        key={dateKey}
                        title={`Day ${i + 1} — ${d.toLocaleDateString()}`}
                        className={`rounded-lg p-2 text-center text-[10px] font-bold border ${
                          present
                            ? "bg-emerald-100 border-emerald-300 text-emerald-800"
                            : "bg-red-50 border-red-200 text-red-600"
                        }`}
                      >
                        <div>D{i + 1}</div>
                        <div className="mt-1">{present ? "P" : "A"}</div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Mark attendance from the dashboard section below. Present (P) and Absent (A) are shown for each programme day.
                </p>
              </div>
                </div>
              </TabPanelScroll>
            </TabsContent>
        </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
