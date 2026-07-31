import { forwardRef } from "react";
import { StudentDocumentFields, studentDocumentIdentityRows } from "@/lib/studentPortalDocuments";
import {
  programmeDayChunks,
  resolveInternshipProgrammeConfig,
} from "@/lib/internshipProgramme";
import {
  DocumentPage,
  DocumentPages,
  DocumentTitle,
  InfoTable,
} from "@/components/student/StudentDocumentLayout";

type Props = {
  fields: StudentDocumentFields;
  issueDate?: string;
};

function LogTable({ days, startDate }: { days: number[]; startDate: Date }) {
  return (
    <table className="w-full border border-[#5AA3E6] text-[10px]">
      <thead>
        <tr className="bg-[#5AA3E6] text-white">
          <th className="p-1.5 border border-[#5AA3E6] w-10 text-center font-bold">Day</th>
          <th className="p-1.5 border border-[#5AA3E6] w-[72px] text-center font-bold">Date</th>
          <th className="p-1.5 border border-[#5AA3E6] text-center font-bold">
            Activity / Topic Covered
          </th>
          <th className="p-1.5 border border-[#5AA3E6] w-[28%] text-center font-bold">Remarks</th>
        </tr>
      </thead>
      <tbody>
        {days.map((day) => {
          const d = new Date(startDate);
          d.setDate(startDate.getDate() + (day - 1));
          return (
            <tr key={day}>
              <td className="p-1.5 border border-slate-200 text-center font-bold bg-slate-50">{day}</td>
              <td className="p-1.5 border border-slate-200 text-center">
                {d.toLocaleDateString("en-GB")}
              </td>
              <td className="p-1.5 border border-slate-200 h-9">&nbsp;</td>
              <td className="p-1.5 border border-slate-200">&nbsp;</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export const StudentLogbookDocument = forwardRef<HTMLDivElement, Props>(
  function StudentLogbookDocument({ fields, issueDate }, ref) {
    const programme = resolveInternshipProgrammeConfig(fields.university);
    const dayChunks = programmeDayChunks(programme.programmeDayCount);
    const totalPages = dayChunks.length;

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
        {dayChunks.map((days, pageIndex) => {
          const isFirst = pageIndex === 0;
          const isLast = pageIndex === dayChunks.length - 1;
          const pageLabel = `Page ${pageIndex + 1} of ${totalPages}`;

          return (
            <DocumentPage
              key={pageLabel}
              documentLabel="Internship Logbook"
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
                    title="Internship Logbook"
                    subtitle={`Programme Period: ${fields.programmePeriod}`}
                  />
                  <InfoTable rows={infoRows} />
                  <h2 className="font-bold text-[11px] text-[#1E3A8A] mb-2 uppercase tracking-wide">
                    Daily Activity Log
                  </h2>
                </>
              ) : null}
              <LogTable days={days} startDate={programme.programmeStartDate} />
            </DocumentPage>
          );
        })}
      </DocumentPages>
    );
  }
);

StudentLogbookDocument.displayName = "StudentLogbookDocument";
