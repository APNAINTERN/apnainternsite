import { useMemo, useRef, useState } from "react";
import {
  BookOpen,
  CheckSquare,
  Download,
  ExternalLink,
  FileCheck,
  FileText,
  Loader2,
  ScrollText,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollableDialogBody, scrollableDialogShellClass } from "@/components/ui/scrollable-dialog";
import { toast } from "sonner";
import { getStudentConsentLetterUrl } from "@/lib/studentDocuments";
import { resolveStudentDocumentFields } from "@/lib/studentPortalDocuments";
import { downloadHtmlDocumentPdf } from "@/lib/studentDocumentPdf";
import type { LearningMaterialRow } from "@/lib/learningMaterialsApi";
import { StudentLogbookDocument } from "@/components/student/StudentLogbookDocument";
import { StudentAttendanceReportDocument } from "@/components/student/StudentAttendanceReportDocument";

type AttendanceRecord = { marked_at?: string | null };

type DocumentItem = {
  id: string;
  title: string;
  description: string;
  icon: typeof FileText;
  available: boolean;
  badge?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Record<string, unknown> | null;
  attendanceRecords: AttendanceRecord[];
  projectReports: LearningMaterialRow[];
  onOpenAcceptanceLetter: () => void;
};

export function StudentDocumentsPanel({
  open,
  onOpenChange,
  profile,
  attendanceRecords,
  projectReports,
  onOpenAcceptanceLetter,
}: Props) {
  const logbookRef = useRef<HTMLDivElement>(null);
  const attendanceRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const fields = useMemo(() => resolveStudentDocumentFields(profile), [profile]);
  const consentUrl = useMemo(
    () => getStudentConsentLetterUrl({ metadata: (profile?.metadata as Record<string, unknown>) || null }),
    [profile]
  );
  const projectReport = projectReports[0] ?? null;

  const documents: DocumentItem[] = useMemo(
    () => [
      {
        id: "consent",
        title: "Consent Letter",
        description: "Permission letter with your registration details pre-filled.",
        icon: FileCheck,
        available: !!consentUrl,
        badge: consentUrl ? "Ready" : "Not uploaded",
      },
      {
        id: "acceptance",
        title: "Acceptance Letter",
        description: "Official confirmation of your internship acceptance.",
        icon: ScrollText,
        available: true,
      },
      {
        id: "logbook",
        title: "Logbook",
        description: "Day-wise internship record generated from your profile.",
        icon: BookOpen,
        available: true,
      },
      {
        id: "attendance",
        title: "Attendance Report",
        description: "Detailed day-wise attendance PDF for the full programme.",
        icon: CheckSquare,
        available: true,
      },
      {
        id: "project",
        title: "Project Report",
        description: "Domain-specific report shared for your university and college.",
        icon: FileText,
        available: !!projectReport?.file_url,
        badge: projectReport ? "Available" : "Not shared yet",
      },
    ],
    [consentUrl, projectReport]
  );

  const downloadLogbook = async () => {
    if (!logbookRef.current) return;
    setDownloading("logbook");
    try {
      await downloadHtmlDocumentPdf(
        logbookRef.current,
        `Logbook_${fields.studentName.replace(/\s+/g, "_")}.pdf`
      );
      toast.success("Logbook downloaded.");
    } catch {
      toast.error("Could not generate logbook PDF.");
    } finally {
      setDownloading(null);
    }
  };

  const downloadAttendanceReport = async () => {
    if (!attendanceRef.current) return;
    setDownloading("attendance");
    try {
      await downloadHtmlDocumentPdf(
        attendanceRef.current,
        `Attendance_Report_${fields.studentName.replace(/\s+/g, "_")}.pdf`
      );
      toast.success("Attendance report downloaded.");
    } catch {
      toast.error("Could not generate attendance report PDF.");
    } finally {
      setDownloading(null);
    }
  };

  const handleAction = async (id: string) => {
    switch (id) {
      case "consent":
        if (consentUrl) window.open(consentUrl, "_blank", "noopener,noreferrer");
        else toast.error("Consent letter is not available yet.");
        break;
      case "acceptance":
        onOpenChange(false);
        onOpenAcceptanceLetter();
        break;
      case "logbook":
        await downloadLogbook();
        break;
      case "attendance":
        await downloadAttendanceReport();
        break;
      case "project":
        if (projectReport?.file_url) {
          window.open(projectReport.file_url, "_blank", "noopener,noreferrer");
        } else {
          toast.info("Project report has not been shared for your profile yet.");
        }
        break;
      default:
        break;
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={`max-w-3xl border-none shadow-2xl ${scrollableDialogShellClass}`}>
          <DialogHeader className="p-6 bg-muted/30 border-b shrink-0">
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <FileText className="size-6 text-primary" /> Documents
            </DialogTitle>
            <DialogDescription>
              Download official internship documents — all pre-filled with your profile data.
            </DialogDescription>
          </DialogHeader>

          <ScrollableDialogBody>
            <div className="space-y-4">
              {documents.map((doc) => {
                const Icon = doc.icon;
                const busy = downloading === doc.id;
                return (
                  <Card
                    key={doc.id}
                    className={`p-5 border-none shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                      doc.available ? "" : "opacity-75"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        <Icon className="size-6" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-lg">{doc.title}</h4>
                          {doc.badge ? (
                            <Badge variant={doc.available ? "secondary" : "outline"} className="text-[10px]">
                              {doc.badge}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{doc.description}</p>
                      </div>
                    </div>
                    <Button
                      variant={doc.available ? "default" : "outline"}
                      disabled={!doc.available || busy}
                      className="gap-2 shrink-0"
                      onClick={() => handleAction(doc.id)}
                    >
                      {busy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : doc.id === "consent" || doc.id === "project" ? (
                        <ExternalLink className="size-4" />
                      ) : doc.id === "acceptance" ? (
                        <FileText className="size-4" />
                      ) : (
                        <Download className="size-4" />
                      )}
                      {doc.id === "acceptance" ? "View & Download" : "Download"}
                    </Button>
                  </Card>
                );
              })}
            </div>
          </ScrollableDialogBody>
        </DialogContent>
      </Dialog>

      <div className="fixed -left-[9999px] top-0 pointer-events-none" aria-hidden>
        <StudentLogbookDocument ref={logbookRef} fields={fields} />
        <StudentAttendanceReportDocument
          ref={attendanceRef}
          fields={fields}
          attendanceRecords={attendanceRecords}
        />
      </div>
    </>
  );
}
