import { forwardRef } from "react";
import {
  StudentDocumentFields,
  attendanceReportRows,
  attendanceReportSummary,
  studentDocumentIdentityRows,
} from "@/lib/studentPortalDocuments";
import { programmeDayChunks } from "@/lib/internshipProgramme";
import {
  DocumentPage,
  DocumentPages,
  DocumentTitle,
  InfoTable,
} from "@/components/student/StudentDocumentLayout";

type Props = {
  fields: StudentDocumentFields;
  attendanceRecords: Array<{ marked_at?: string | null }>;
  issueDate?: string;
};

function AttendanceTable({
  rows,
}: {
  rows: { day: number; date: string; status: "Present" | "Absent" }[];
}) {
  return (
    <table className="w-full border border-[#5AA3E6] text-[10px]">
      <thead>
        <tr className="bg-[#5AA3E6] text-white">
          <th className="p-1.5 border border-[#5AA3E6] text-center font-bold">Day</th>
          <th className="p-1.5 border border-[#5AA3E6] text-center font-bold">Date</th>
          <th className="p-1.5 border border-[#5AA3E6] text-center font-bold">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.day}>
            <td className="p-1.5 border border-slate-200 text-center font-bold bg-slate-50">
              Day {row.day}
            </td>
            <td className="p-1.5 border border-slate-200 text-center">{row.date}</td>
            <td
              className={`p-1.5 border border-slate-200 text-center font-bold ${
                row.status === "Present" ? "text-emerald-700" : "text-red-600"
              }`}
            >
              {row.status}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const StudentAttendanceReportDocument = forwardRef<HTMLDivElement, Props>(
  function StudentAttendanceReportDocument({ fields, attendanceRecords, issueDate }, ref) {
    const summary = attendanceReportSummary(attendanceRecords, fields.university);
    const dayRows = attendanceReportRows(attendanceRecords, fields.university);
    const rowChunks = programmeDayChunks(summary.programmeDays).map((days) =>
      dayRows.filter((row) => days.includes(row.day))
    );
    const totalPages = rowChunks.length;

    const infoRows: [string, string][] = [
      ["Student Name", fields.studentName],
      ["University", fields.university],
      ["College Name", fields.collegeName],
      ...studentDocumentIdentityRows(fields),
      ["Course", fields.course],
      ["Subject", fields.subject],
      ["Semester", fields.semester],
      ["Domain", fields.domain],
      ["Mode", fields.mode],
      ["Duration", fields.duration],
      ["Internship Starting Date", fields.startDate],
      ["Internship Ending Date", fields.endDate],
      ["Phone Number", fields.phone],
      ["Email ID", fields.email],
    ];

    return (
      <DocumentPages ref={ref}>
        {rowChunks.map((pageRows, pageIndex) => {
          const isFirst = pageIndex === 0;
          const isLast = pageIndex === rowChunks.length - 1;
          const pageLabel = `Page ${pageIndex + 1} of ${totalPages}`;

          return (
            <DocumentPage
              key={pageLabel}
              documentLabel="Attendance Report"
              variant={isFirst ? "default" : "continuation"}
              continuationHeader={
                isFirst
                  ? undefined
                  : {
                      studentName: fields.studentName,
                      pageLabel,
                    }
              }
              showSignature={isLast}
              showLogos={isLast}
              showDocumentInfo={isLast}
              pageLabel={isFirst ? pageLabel : undefined}
              issueDate={isLast ? issueDate : undefined}
            >
              {isFirst ? (
                <>
                  <DocumentTitle
                    title="Attendance Report"
                    subtitle={`Internship Period: ${summary.period}`}
                  />
                  <InfoTable rows={infoRows} />

                  <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                    <div className="rounded-md border border-violet-200 bg-violet-50 p-2">
                      <p className="text-[9px] font-bold uppercase text-violet-700">Days Marked</p>
                      <p className="text-lg font-black text-violet-800">{summary.totalMarked}</p>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                      <p className="text-[9px] font-bold uppercase text-slate-600">Programme Days</p>
                      <p className="text-lg font-black text-slate-800">{summary.programmeDays}</p>
                    </div>
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2">
                      <p className="text-[9px] font-bold uppercase text-emerald-700">Attendance %</p>
                      <p className="text-lg font-black text-emerald-800">
                        {summary.percentage.toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  <h2 className="font-bold text-[11px] text-[#1E3A8A] mb-2 uppercase tracking-wide">
                    Day-wise Attendance
                  </h2>
                </>
              ) : null}
              <AttendanceTable rows={pageRows} />
            </DocumentPage>
          );
        })}
      </DocumentPages>
    );
  }
);

StudentAttendanceReportDocument.displayName = "StudentAttendanceReportDocument";
