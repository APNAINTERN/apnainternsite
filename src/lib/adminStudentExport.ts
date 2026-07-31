import Papa from "papaparse";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AdminStudentDirectoryFilters,
  fetchAdminStudentDirectoryAll,
} from "@/lib/adminStudentDirectory";
import { studentInternshipMode } from "@/lib/internshipMode";
import { enrichStudentProfileForDisplay } from "@/lib/studentProfileDisplay";

function metaOf(s: Record<string, unknown>): Record<string, unknown> {
  const m = s.metadata;
  if (m == null) return {};
  if (typeof m === "string") {
    try {
      const parsed = JSON.parse(m) as unknown;
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return typeof m === "object" && !Array.isArray(m) ? (m as Record<string, unknown>) : {};
}

function studentToCsvRow(s: Record<string, unknown>) {
  const display = enrichStudentProfileForDisplay(s) || s;
  const meta = metaOf(s);
  const createdAt = s.created_at ? new Date(String(s.created_at)).toLocaleDateString() : "";
  const mode = studentInternshipMode({
    university_name: display.university_name ?? s.university_name,
    internship_mode: display.internship_mode ?? s.internship_mode,
    metadata: s.metadata,
  });
  return {
    "Full Name": display.full_name ?? s.full_name ?? "",
    Email: display.email ?? s.email ?? "",
    Contact: display.contact_number ?? s.contact_number ?? "",
    University: display.university_name ?? s.university_name ?? "",
    College: display.college_name ?? s.college_name ?? "",
    Course:
      String(display.course ?? s.course ?? display.internship_domain ?? s.internship_domain ?? "")
        .trim() || "",
    Degree: display.degree ?? s.degree ?? "",
    Department: display.department ?? s.department ?? "",
    Subject:
      String(display.subject ?? s.subject ?? meta.subject ?? "").trim() || "",
    Mode: mode,
    "Internship Domain":
      display.internship_domain ?? s.internship_domain ?? s.course ?? "",
    "Registration No": display.roll_number ?? s.roll_number ?? "",
    "Batch/Session": display.academic_session ?? s.academic_session ?? "",
    Semester: display.class_semester ?? s.class_semester ?? "",
    "Parent Name": display.parent_name ?? s.parent_name ?? "",
    "Emergency Contact": display.emergency_contact ?? s.emergency_contact ?? "",
    Status: s.status ?? "",
    "Joined Date": createdAt,
  };
}

/** Export directory rows via paginated admin RPC (avoids direct students table timeouts). */
export async function exportAdminStudentsCsv(
  client: SupabaseClient,
  filters: AdminStudentDirectoryFilters,
  opts?: { excludeUserIds?: Iterable<string> }
): Promise<number> {
  const exclude = new Set(opts?.excludeUserIds ?? []);
  const rows = await fetchAdminStudentDirectoryAll(client, filters);
  const exportRows = rows.filter((s) => !exclude.has(String(s.id)));

  if (exportRows.length === 0) {
    throw new Error("No rows match the current filters.");
  }

  const csv = Papa.unparse(exportRows.map(studentToCsvRow));
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `students_export_${new Date().toISOString().split("T")[0]}.csv`
  );
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return exportRows.length;
}
