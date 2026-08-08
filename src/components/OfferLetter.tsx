import { forwardRef } from "react";
import {
  resolveOfferLetterFields,
} from "@/lib/offerLetterProfile";
import {
  OFFER_LETTER_CAPTURE_WIDTH_PX,
  OFFER_LETTER_PADDING_PX,
} from "@/lib/offerLetterPdf";
import { ACCREDITATION_LOGOS } from "@/lib/documentLogos";
import {
  CERTIFICATE_CEO,
  CERTIFICATE_CEO_TITLE,
  CERTIFICATE_COMPANY,
  CERTIFICATE_SIGNATURE_SRC,
} from "@/lib/certificateFormat";

interface OfferLetterProps {
  profile: any;
}

const letterStyle: React.CSSProperties = {
  width: OFFER_LETTER_CAPTURE_WIDTH_PX,
  maxWidth: OFFER_LETTER_CAPTURE_WIDTH_PX,
  minWidth: OFFER_LETTER_CAPTURE_WIDTH_PX,
  boxSizing: "border-box",
  overflow: "visible",
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
};

export const OfferLetter = forwardRef<HTMLDivElement, OfferLetterProps>(({ profile }, ref) => {
  const fields = resolveOfferLetterFields(profile);
  const pad = OFFER_LETTER_PADDING_PX;

  const topDateLabel = fields.isLnmu ? "Application Date" : "Date";
  const topDateValue = fields.issueDate;

  const rows: { l: string; v: string }[] = [
    { l: "Name of the Student", v: fields.fullName },
    { l: "Registration No.", v: fields.registrationNo },
    ...(fields.isBnmu
      ? [{ l: "University Roll No.", v: fields.universityRollNo }]
      : []),
    { l: "College / Institution", v: fields.collegeName },
    { l: "Department & Semester", v: fields.departmentSemester },
    { l: "Internship Domain", v: fields.internshipDomain },
    { l: "Internship Duration", v: fields.internshipDuration },
    { l: "Mode of Internship", v: fields.internshipMode },
    { l: "Internship Start Date", v: fields.startDate },
    {
      l: fields.isLnmu ? "Internship End Date" : "Expected End Date",
      v: fields.endDate,
    },
    { l: "Stipend", v: fields.stipend },
  ];

  return (
    <div
      ref={ref}
      data-offer-letter-root
      className="bg-white text-slate-800 text-[14px] leading-snug relative"
      style={letterStyle}
    >
      {/* Header — full width, no negative margins (PDF-safe) */}
      <div className="relative z-10 bg-white w-full">
        <div className="h-3 w-full bg-sky-500" />

        <div
          className="flex items-start justify-between gap-3 py-4"
          style={{ paddingLeft: pad, paddingRight: pad }}
        >
          <div className="flex items-center gap-3 min-w-0 shrink">
            <img
              src="/logo.png"
              alt="Apna Intern"
              width={56}
              height={56}
              className="h-14 w-14 shrink-0 rounded-md object-contain bg-white"
              crossOrigin="anonymous"
              decoding="sync"
            />
            <span className="text-[20px] font-bold text-sky-600 tracking-tight whitespace-nowrap">
              Apna <span className="text-slate-700">Intern</span>
            </span>
          </div>

          <div className="text-right text-[10px] leading-[1.4] text-slate-700 shrink-0 max-w-[240px]">
            <p>Arfabad Colony, East Nahar Road, Bajranngpuri,</p>
            <p>Patna - 800007</p>
            <p className="font-semibold">7050936593</p>
            <p>contact@ezyintern.in</p>
            <p>www.ezyintern.in</p>
          </div>
        </div>

        <div className="border-t-2 border-sky-600" style={{ marginLeft: pad, marginRight: pad }} />

        <h1
          className="text-center py-3 text-[17px] font-bold tracking-wide text-slate-900"
          style={{ paddingLeft: pad, paddingRight: pad }}
        >
          {fields.isLnmu ? "Internship Acceptance Letters" : "INTERNSHIP OFFER LETTER"}
        </h1>
      </div>

      <div
        className="relative z-10"
        style={{ paddingLeft: pad, paddingRight: pad, paddingBottom: pad }}
      >
        <div className="flex justify-between gap-3 text-[12px] font-bold mb-4 tabular-nums">
          <p className="min-w-0 break-words" style={{ maxWidth: "58%" }}>
            Letter Ref. No.:{" "}
            <span className="font-black text-slate-900">{fields.letterRefNo}</span>
          </p>
          <p className="shrink-0 text-right">
            {topDateLabel}: <span className="font-bold text-slate-900">{topDateValue}</span>
          </p>
        </div>

        <div className="text-[14px] space-y-1 mb-4">
          <p>To,</p>
          <p className="font-bold text-slate-900 uppercase break-words">{fields.fullName}</p>
          <p className="break-words">
            Registration No.: <span className="font-bold">{fields.registrationNo}</span>
          </p>
          <p className="break-words leading-snug">
            College / Institution:{" "}
            <span className="font-bold">{fields.collegeName}</span>
          </p>
        </div>

        <div className="text-[14px] space-y-3 leading-relaxed text-justify">
          <p className="font-bold">Dear Candidate,</p>
          <p>
            We are pleased to accept your application and formally offer you an internship at{" "}
            <span className="font-bold">Apna Intern</span>.
            Our internship programmes are designed in full alignment with{" "}
            <span className="font-bold">NEP-2020, AICTE and UGC Internship Guidelines</span>, and your
            university&apos;s specific internship framework.
          </p>

          <div className="rounded-lg border border-sky-200 bg-sky-50 py-3 px-3">
            <p className="font-bold mb-2">Your internship details are as follows:</p>
            <table className="w-full border-collapse text-[13px]" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "44%" }} />
                <col style={{ width: "4%" }} />
                <col style={{ width: "52%" }} />
              </colgroup>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td className="align-top py-1 pr-1 text-slate-800 break-words">• {row.l}</td>
                    <td className="align-top py-1 text-center">:</td>
                    <td className="align-top py-1 font-bold text-slate-900 break-words">{row.v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p>
            Please report to us on your start date as per the schedule above and bring this letter along
            with the <span className="font-bold">Consent Letter</span> issued by your College. We also
            request that you inform your{" "}
            <span className="font-bold">College Internship Nodal Officer (CINO)</span> upon receiving
            this acceptance letter. During the programme, you are required to maintain the minimum
            required attendance and complete all tasks and assignments given by your mentor.
          </p>

          <p>
            We look forward to a meaningful and enriching internship experience and appreciate your
            interest in <span className="font-bold">Apna Intern</span>.
          </p>
        </div>

        <div className="relative z-10 mt-6 w-full border-t border-slate-200 pt-4">
          <div className="flex justify-end items-end gap-2 mb-2">
            <img
              src={CERTIFICATE_SIGNATURE_SRC}
              alt={`Signature of ${CERTIFICATE_CEO}`}
              className="h-[48px] w-auto max-w-[170px] object-contain"
              crossOrigin="anonymous"
            />
            <img
              src="/certificate/stamp.png"
              alt="Company stamp"
              className="h-[48px] w-[48px] object-contain shrink-0"
              crossOrigin="anonymous"
            />
          </div>
          <div className="text-right mb-3">
            <p className="text-[11px] font-bold text-slate-900">{CERTIFICATE_CEO}</p>
            <p className="text-[10px] font-semibold text-slate-700">{CERTIFICATE_CEO_TITLE}</p>
            <p className="text-[9px] font-bold text-sky-600 uppercase tracking-wide leading-tight">
              {CERTIFICATE_COMPANY}
            </p>
          </div>
          <div className="flex flex-wrap justify-center items-center gap-2.5 py-1.5">
            {ACCREDITATION_LOGOS.map(({ src, alt, h }) => (
              <img
                key={src}
                src={src}
                alt={alt}
                className={`${h} w-auto object-contain`}
                crossOrigin="anonymous"
              />
            ))}
          </div>
          <p className="text-[9px] text-center font-semibold text-slate-600 pb-1">
            A DPIIT Recognised Startup India and ISO Certified Platform
          </p>
        </div>
      </div>
    </div>
  );
});

OfferLetter.displayName = "OfferLetter";
