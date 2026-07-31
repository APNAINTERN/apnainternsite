import type { SupabaseClient } from "@supabase/supabase-js";
import { createRoot } from "react-dom/client";
import { createElement } from "react";
import { StudentAttendanceReportDocument } from "@/components/student/StudentAttendanceReportDocument";
import {
  formatDocumentIssueDate,
  resolveStudentDocumentFields,
} from "@/lib/studentPortalDocuments";
import { downloadHtmlDocumentPdf } from "@/lib/studentDocumentPdf";
import { enrichStudentProfileForDisplay } from "@/lib/studentProfileDisplay";

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/**
 * Download the same attendance report PDF used on the Student Dashboard
 * for an admin directory student row.
 */
export async function downloadStudentAttendanceReportPdf(
  client: SupabaseClient,
  student: Record<string, unknown>
): Promise<void> {
  const id = String(student.id || "").trim();
  if (!id) throw new Error("Student id is missing.");

  let row: Record<string, unknown> = student;
  try {
    const { data } = await client.from("students").select("*").eq("id", id).maybeSingle();
    if (data) row = data as Record<string, unknown>;
  } catch {
    /* use partial row */
  }

  const enriched = enrichStudentProfileForDisplay(row) || row;
  const fields = resolveStudentDocumentFields(enriched);

  const { data: attRows, error: attErr } = await client
    .from("attendance")
    .select("marked_at")
    .eq("student_id", id)
    .order("marked_at", { ascending: true });
  if (attErr) throw attErr;

  const attendanceRecords = (attRows || []).map((r) => ({
    marked_at: (r as { marked_at?: string | null }).marked_at ?? null,
  }));

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;pointer-events:none;width:794px;z-index:-1;";
  document.body.appendChild(host);

  const root = createRoot(host);
  let el: HTMLDivElement | null = null;

  try {
    await new Promise<void>((resolve) => {
      root.render(
        createElement(StudentAttendanceReportDocument, {
          ref: (node: HTMLDivElement | null) => {
            el = node;
          },
          fields,
          attendanceRecords,
          issueDate: formatDocumentIssueDate(),
        })
      );
      void waitForPaint().then(resolve);
    });

    if (!el) throw new Error("Could not render attendance report.");

    await downloadHtmlDocumentPdf(
      el,
      `Attendance_Report_${(fields.studentName || "Student").replace(/\s+/g, "_")}.pdf`
    );
  } finally {
    root.unmount();
    host.remove();
  }
}
