import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  downloadConsentLetterFile,
  getStudentConsentLetterUrl,
  saveStudentConsentLetter,
} from "@/lib/studentDocuments";
import {
  formatDocumentIssueDate,
  resolveStudentDocumentFields,
} from "@/lib/studentPortalDocuments";
import { downloadHtmlDocumentPdf } from "@/lib/studentDocumentPdf";
import type { LearningMaterialRow } from "@/lib/learningMaterialsApi";
import {
  downloadStorageFileWithFallback,
  pickWorkingStorageUrl,
} from "@/lib/storageUrl";
import { StudentLogbookDocument } from "@/components/student/StudentLogbookDocument";
import { StudentAttendanceReportDocument } from "@/components/student/StudentAttendanceReportDocument";
import { createElement } from "react";

export type StudentDocumentId =
  | "consent"
  | "acceptance"
  | "logbook"
  | "certificate"
  | "attendance"
  | "project";

export type StudentDocumentMeta = {
  id: StudentDocumentId;
  title: string;
  description: string;
  ready: boolean;
  statusLabel: string;
  canUpload?: boolean;
};

type AttendanceRecord = { marked_at?: string | null };

type Options = {
  userId: string;
  profile: Record<string, unknown> | null;
  attendanceRecords: AttendanceRecord[];
  projectReports: LearningMaterialRow[];
  hasCertificate: boolean;
  onOpenAcceptanceLetter: () => void;
  onOpenCertificate: () => void;
  onProfileUpdated?: () => void | Promise<void>;
};

async function waitForPaint(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export function useStudentDocumentActions({
  userId,
  profile,
  attendanceRecords,
  projectReports,
  hasCertificate,
  onOpenAcceptanceLetter,
  onOpenCertificate,
  onProfileUpdated,
}: Options) {
  const logbookRef = useRef<HTMLDivElement>(null);
  const attendanceRef = useRef<HTMLDivElement>(null);
  const consentInputRef = useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = useState<StudentDocumentId | null>(null);
  const [uploadingConsent, setUploadingConsent] = useState(false);
  const [previewId, setPreviewId] = useState<StudentDocumentId | null>(null);
  const [documentIssueDate, setDocumentIssueDate] = useState(() => formatDocumentIssueDate());

  const fields = useMemo(() => resolveStudentDocumentFields(profile), [profile]);
  const consentUrl = useMemo(
    () => getStudentConsentLetterUrl({ metadata: (profile?.metadata as Record<string, unknown>) || null }),
    [profile]
  );
  const projectReport = projectReports[0] ?? null;
  const projectUrlCandidates =
    projectReport?.file_url_candidates?.length
      ? projectReport.file_url_candidates
      : projectReport?.file_url
        ? [projectReport.file_url]
        : [];
  const projectReady = projectUrlCandidates.length > 0;

  const documents: StudentDocumentMeta[] = useMemo(
    () => [
      {
        id: "consent",
        title: "Consent Letter",
        description:
          "Upload your signed consent letter from college, then view or download it anytime.",
        ready: !!consentUrl,
        canUpload: true,
        statusLabel: consentUrl ? "Ready" : "Upload required",
      },
      {
        id: "acceptance",
        title: "Acceptance Letter",
        description:
          "Official confirmation that you have been accepted into the Apna Intern programme.",
        ready: true,
        statusLabel: "Ready",
      },
      {
        id: "logbook",
        title: "Logbook",
        description:
          "Your day-wise internship record. Auto-generated from your profile — no typing needed.",
        ready: true,
        statusLabel: "Auto-generated",
      },
      {
        id: "certificate",
        title: "Certificate",
        description:
          "Your official internship completion certificate, issued after programme completion.",
        ready: hasCertificate,
        statusLabel: hasCertificate ? "Ready" : "Available after completion",
      },
      {
        id: "attendance",
        title: "Attendance Report",
        description:
          "A detailed report showing your present and absent days throughout the internship.",
        ready: true,
        statusLabel: "Ready",
      },
      {
        id: "project",
        title: "Project Report",
        description:
          "Your domain-specific project report, uploaded by the Apna Intern team for your batch.",
        ready: projectReady,
        statusLabel: projectReady ? "Ready" : "Not shared yet",
      },
    ],
    [consentUrl, hasCertificate, projectReady]
  );

  const refreshIssueDate = useCallback(() => {
    setDocumentIssueDate(formatDocumentIssueDate());
  }, []);

  const downloadLogbook = async () => {
    if (!logbookRef.current) return;
    refreshIssueDate();
    await waitForPaint();
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
    refreshIssueDate();
    await waitForPaint();
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

  const handleConsentFileChange = async (file: File | null | undefined) => {
    if (!file || !userId) return;
    setUploadingConsent(true);
    try {
      await saveStudentConsentLetter(supabase, userId, profile, file);
      toast.success("Consent letter uploaded.");
      await onProfileUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not upload consent letter.");
    } finally {
      setUploadingConsent(false);
      if (consentInputRef.current) consentInputRef.current.value = "";
    }
  };

  const triggerConsentUpload = () => {
    consentInputRef.current?.click();
  };

  const viewDocument = (id: StudentDocumentId) => {
    switch (id) {
      case "consent":
        if (consentUrl) window.open(consentUrl, "_blank", "noopener,noreferrer");
        else toast.error("Upload your consent letter first.");
        break;
      case "acceptance":
        onOpenAcceptanceLetter();
        break;
      case "logbook":
        refreshIssueDate();
        setPreviewId("logbook");
        break;
      case "certificate":
        if (hasCertificate) onOpenCertificate();
        else toast.info("Certificate will be available once issued by the admin.");
        break;
      case "attendance":
        refreshIssueDate();
        setPreviewId("attendance");
        break;
      case "project":
        if (projectUrlCandidates.length > 0) {
          void (async () => {
            const url = await pickWorkingStorageUrl(projectUrlCandidates);
            if (url) window.open(url, "_blank", "noopener,noreferrer");
            else toast.error("Could not open project report.");
          })();
        } else {
          toast.info("Project report has not been shared for your profile yet.");
        }
        break;
      default:
        break;
    }
  };

  const downloadDocument = async (id: StudentDocumentId) => {
    switch (id) {
      case "consent":
        if (consentUrl) {
          setDownloading("consent");
          try {
            await downloadConsentLetterFile(consentUrl, fields.studentName);
            toast.success("Consent letter downloaded.");
          } catch {
            toast.error("Could not download consent letter.");
          } finally {
            setDownloading(null);
          }
        } else {
          toast.error("Upload your consent letter first.");
        }
        break;
      case "acceptance":
        onOpenAcceptanceLetter();
        break;
      case "logbook":
        await downloadLogbook();
        break;
      case "certificate":
        if (hasCertificate) onOpenCertificate();
        else toast.info("Certificate will be available once issued by the admin.");
        break;
      case "attendance":
        await downloadAttendanceReport();
        break;
      case "project":
        if (projectUrlCandidates.length > 0) {
          setDownloading("project");
          try {
            await downloadStorageFileWithFallback(
              projectUrlCandidates,
              projectReport?.file_name || "Project_Report.pdf"
            );
            toast.success("Project report downloaded.");
          } catch {
            toast.error("Could not download project report. Please try View instead.");
          } finally {
            setDownloading(null);
          }
        } else {
          toast.info("Project report has not been shared for your profile yet.");
        }
        break;
      default:
        break;
    }
  };

  const uploadDocument = (id: StudentDocumentId) => {
    if (id === "consent") triggerConsentUpload();
  };

  const hiddenPdfNodes = createElement(
    "div",
    { className: "fixed -left-[9999px] top-0 pointer-events-none", "aria-hidden": true },
    createElement(StudentLogbookDocument, { ref: logbookRef, fields, issueDate: documentIssueDate }),
    createElement(StudentAttendanceReportDocument, {
      ref: attendanceRef,
      fields,
      attendanceRecords,
      issueDate: documentIssueDate,
    }),
    createElement("input", {
      ref: consentInputRef,
      type: "file",
      className: "hidden",
      accept: ".pdf,.png,.jpg,.jpeg,.webp,.gif,application/pdf,image/*",
      onChange: (e: { target: HTMLInputElement }) => {
        void handleConsentFileChange(e.target.files?.[0]);
      },
    })
  );

  return {
    documents,
    downloading,
    uploadingConsent,
    previewId,
    setPreviewId,
    viewDocument,
    downloadDocument,
    uploadDocument,
    fields,
    attendanceRecords,
    documentIssueDate,
    hiddenPdfNodes,
  };
}
