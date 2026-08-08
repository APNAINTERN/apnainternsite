import { forwardRef } from "react";
import { Globe, Mail, MapPin, Phone } from "lucide-react";
import {
  CERTIFICATE_FOOTER_LEFT_LOGOS,
  CERTIFICATE_FOOTER_RIGHT_LOGOS,
} from "@/lib/documentLogos";
import {
  CERTIFICATE_ASSESSMENT_CRITERIA,
  CERTIFICATE_CEO,
  CERTIFICATE_CEO_TITLE,
  CERTIFICATE_COMPANY,
  CERTIFICATE_CREDITS,
  CERTIFICATE_INTERNSHIP_PERIOD,
  CERTIFICATE_SIGNATURE_SRC,
  CERTIFICATE_TOTAL_HOURS,
  CERTIFICATE_VERIFY_URL,
  certificateVerifyUrl,
  CertificateDisplayData,
  randomizedCertificateAssessmentRows,
} from "@/lib/certificateFormat";
import { isBnmuStudent } from "@/lib/feeRules";

type Props = {
  data: CertificateDisplayData;
  className?: string;
  /** Official signed copy for students; admin downloads use false. */
  showSignature?: boolean;
};

const PAGE = {
  width: "210mm",
  height: "297mm",
  padding: "5mm 7mm 4mm",
} as const;

const pageStyle: React.CSSProperties = {
  width: PAGE.width,
  maxWidth: PAGE.width,
  minWidth: PAGE.width,
  height: PAGE.height,
  minHeight: PAGE.height,
  maxHeight: PAGE.height,
  boxSizing: "border-box",
};

const BORDER = "border-[#5AA3E6]";

/** Explicit px padding — renders reliably in html2canvas PDF export. */
const DETAIL_CELL: React.CSSProperties = {
  padding: "10px 12px",
  lineHeight: 1.45,
  minHeight: "40px",
  boxSizing: "border-box",
};

const ASSESS_CELL: React.CSSProperties = {
  padding: "10px 12px",
  lineHeight: 1.45,
  minHeight: "36px",
  boxSizing: "border-box",
};

const ASSESS_HEAD_CELL: React.CSSProperties = {
  padding: "9px 12px",
  lineHeight: 1.4,
  minHeight: "32px",
  boxSizing: "border-box",
};

function TopLeftAccent() {
  return (
    <div className="absolute top-0 left-0 z-20 pointer-events-none">
      <div
        className="h-[14px] w-[90px] bg-[#0084FF]"
        style={{ clipPath: "polygon(0 0, 100% 0, 78% 100%, 0% 100%)" }}
      />
      <div
        className="h-[14px] w-[28px] bg-[#CDE6FE] absolute top-0 left-[72px]"
        style={{ clipPath: "polygon(30% 0, 100% 0, 70% 100%, 0% 100%)" }}
      />
    </div>
  );
}

function BottomRightAccent() {
  return (
    <div className="absolute bottom-0 right-0 z-20 pointer-events-none">
      <div
        className="h-[14px] w-[90px] bg-[#0084FF]"
        style={{ clipPath: "polygon(22% 0, 100% 0, 100% 100%, 0% 100%)" }}
      />
      <div
        className="h-[14px] w-[28px] bg-[#CDE6FE] absolute bottom-0 right-[72px]"
        style={{ clipPath: "polygon(0 0, 70% 0, 100% 100%, 30% 100%)" }}
      />
    </div>
  );
}

function CertificateHeader() {
  return (
    <header className="relative z-10 shrink-0">
      <div className="flex justify-between items-center gap-3 pt-0.5">
        <div className="flex items-center shrink-0 pl-0.5">
          <img
            src="/certificate/header-logo.png"
            alt="Apna Intern"
            className="block shrink-0"
            style={{ height: "14mm", width: "auto", objectFit: "contain" }}
            crossOrigin="anonymous"
            decoding="sync"
          />
        </div>

        <div className="flex flex-col items-end gap-0.5 text-[9px] font-medium text-slate-800 leading-normal max-w-[52%] shrink pb-2">
          <div className="flex items-center gap-1 text-right">
            <span>Arfabad Colony, East Nahar Road, Bajranngpuri, Patna - 800007</span>
            <span className="bg-[#0084FF] text-white rounded-full p-[2px] shrink-0 inline-flex">
              <MapPin className="size-[8px]" strokeWidth={3} />
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span>7050936593</span>
            <span className="bg-[#0084FF] text-white rounded-full p-[2px] inline-flex">
              <Phone className="size-[8px]" strokeWidth={3} />
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span>contact@ezyintern.in</span>
            <span className="bg-[#0084FF] text-white rounded-full p-[2px] inline-flex">
              <Mail className="size-[8px]" strokeWidth={3} />
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span>www.ezyintern.in</span>
            <span className="bg-[#0084FF] text-white rounded-full p-[2px] inline-flex">
              <Globe className="size-[8px]" strokeWidth={3} />
            </span>
          </div>
        </div>
      </div>
      <div className="border-b-[2px] border-[#1E3A8A]" />
    </header>
  );
}

function CertificationBody({ data }: { data: CertificateDisplayData }) {
  const institution = data.collegeName || data.universityName || "—";
  const majorLabel = [data.degree, data.subject ? `(${data.subject})` : null]
    .filter(Boolean)
    .join(" ");
  const bnmu = isBnmuStudent(data.universityName);

  return (
    <section className="relative z-10 text-center shrink-0 py-1.5">
      <h1 className="font-serif font-bold text-[#1565C0] text-[33px] tracking-wide mb-2 leading-tight">
        Certificate of Completion
      </h1>
      <div className="text-[13px] leading-[1.5] space-y-0">
        <p>This is to certify that</p>
        <p className="font-bold text-[15px]">Mr./Ms. {data.studentName},</p>
        {bnmu ? (
          <>
            <p>
              University Registration No.{" "}
              <span className="font-bold">{data.universityRegistrationNumber || "—"}</span>
            </p>
            <p>
              University Roll No.{" "}
              <span className="font-bold">{data.universityRollNo || "—"}</span>
            </p>
          </>
        ) : (
          <p>
            bearing University Roll No.{" "}
            <span className="font-bold">{data.universityRollNo || "—"}</span>
          </p>
        )}
        <p>of</p>
        <p className="font-bold text-[15px]">{institution},</p>
        {data.academicSession || majorLabel ? (
          <p>
            {data.academicSession ? (
              <>
                Session <span className="font-bold">{data.academicSession}</span>
              </>
            ) : null}
            {data.academicSession && majorLabel ? ", " : null}
            {majorLabel ? (
              <>
                with Major in <span className="font-bold">{majorLabel}</span>
              </>
            ) : null}
            ,
          </p>
        ) : null}
        <p>has successfully completed his/her internship with our organisation.</p>
      </div>
    </section>
  );
}

function InternshipDetailsTable({ data }: { data: CertificateDisplayData }) {
  const rows: [string, string][] = [
    ["Internship Domain", data.internshipDomain || "—"],
    ["Internship Duration", data.internshipDuration || CERTIFICATE_INTERNSHIP_PERIOD],
    ["Total Hours Completed", data.totalHours || CERTIFICATE_TOTAL_HOURS],
    [data.creditsLabel || "No. of Credits Recommended", data.creditsRecommended || CERTIFICATE_CREDITS],
    ["Mode of Internship", data.internshipMode || "Online"],
    ["Overall Marks Percentage", data.marksPercent || "—"],
  ];

  return (
    <div className={`relative w-full border ${BORDER} text-[13.5px] overflow-hidden shrink-0 bg-white`}>
      <div className="relative z-[1]">
        {rows.map(([label, value], i) => (
          <div
            key={label}
            className={`flex ${i < rows.length - 1 ? `border-b ${BORDER}` : ""}`}
          >
            <div
              className={`w-[45%] font-bold border-r ${BORDER} flex items-center justify-center text-center`}
              style={DETAIL_CELL}
            >
              {label}
            </div>
            <div
              className="w-[55%] flex items-center justify-center text-center font-medium"
              style={DETAIL_CELL}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PerformanceAssessmentTable({ data }: { data: CertificateDisplayData }) {
  const seed =
    data.certificateId ||
    data.registrationId ||
    data.universityRollNo ||
    data.studentName ||
    "certificate";
  const rows =
    data.assessmentRows?.length === CERTIFICATE_ASSESSMENT_CRITERIA.length
      ? data.assessmentRows
      : randomizedCertificateAssessmentRows(String(seed));

  return (
    <div className="shrink-0 w-full">
      <h2 className="text-[14.5px] font-bold text-[#5AA3E6] leading-normal block mb-2">
        Internship Performance Assessment
      </h2>
      <div className={`border ${BORDER} text-[13px] w-full`}>
        <div className="flex bg-[#5AA3E6] text-white font-bold text-[13.5px]">
          <div
            className="w-[68%] border-r border-white/30 text-center"
            style={ASSESS_HEAD_CELL}
          >
            Assessment Criteria
          </div>
          <div className="w-[32%] text-center" style={ASSESS_HEAD_CELL}>
            Rating
          </div>
        </div>
        {rows.map((row, i) => (
          <div
            key={row.criteria}
            className={`flex bg-white ${i < rows.length - 1 ? `border-b ${BORDER}` : ""}`}
          >
            <div
              className={`w-[68%] border-r ${BORDER} flex items-center justify-center text-center`}
              style={ASSESS_CELL}
            >
              {row.criteria}
            </div>
            <div
              className="w-[32%] flex items-center justify-center text-center font-bold"
              style={ASSESS_CELL}
            >
              {row.rating}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TablesSection({ data }: { data: CertificateDisplayData }) {
  return (
    <div className="relative shrink-0 w-full mt-2">
      <div className="relative z-10 space-y-5">
        <InternshipDetailsTable data={data} />
        <PerformanceAssessmentTable data={data} />
      </div>
    </div>
  );
}

function CertificateFooter({
  certificateId,
  issueDate,
  showSignature = true,
}: {
  certificateId?: string | null;
  issueDate?: string | null;
  showSignature?: boolean;
}) {
  const verifyLink = certificateId
    ? certificateVerifyUrl(certificateId)
    : CERTIFICATE_VERIFY_URL;

  return (
    <footer className="relative z-10 shrink-0 pt-4 mt-1">
      <div className="flex justify-between items-start gap-3 mb-2">
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          <div className="relative size-[22mm] shrink-0 border border-slate-300 bg-white p-0.5">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=320x320&ecc=Q&data=${encodeURIComponent(verifyLink)}`}
              alt="QR Code"
              className="w-full h-full"
              crossOrigin="anonymous"
            />
          </div>
          <div className="text-[12px] leading-tight space-y-1 pt-1">
            <p>
              <span className="font-bold text-slate-800">Certificate Number: </span>
              <span className="font-bold text-[#5AA3E6]">{certificateId || "—"}</span>
            </p>
            <p>
              <span className="font-bold text-slate-800">Date of Certification: </span>
              <span className="font-bold text-[#5AA3E6]">{issueDate || "—"}</span>
            </p>
            <p className="text-[11px] font-bold text-[#5AA3E6] leading-snug max-w-[72mm]">
              Online Certificate Verification Available on: {CERTIFICATE_VERIFY_URL}
            </p>
          </div>
        </div>

        <div className="text-right shrink-0 w-[46%]">
          {showSignature ? (
            <div className="relative flex justify-end items-end min-h-[22mm]">
              <img
                src="/certificate/stamp.png"
                alt="Company stamp"
                className="absolute right-0 bottom-0 h-[22mm] w-[22mm] object-contain"
                crossOrigin="anonymous"
              />
              <img
                src={CERTIFICATE_SIGNATURE_SRC}
                alt={`Signature of ${CERTIFICATE_CEO}`}
                className="relative z-10 h-[21mm] w-auto max-w-[52mm] object-contain object-bottom mr-[10mm]"
                crossOrigin="anonymous"
              />
            </div>
          ) : (
            <div className="min-h-[22mm]" aria-hidden />
          )}
          <p className="text-[14px] font-bold text-slate-900 leading-tight mt-1">{CERTIFICATE_CEO}</p>
          <p className="text-[12px] font-semibold text-slate-700 leading-tight">{CERTIFICATE_CEO_TITLE}</p>
          <p className="text-[11.5px] font-bold text-[#5AA3E6] uppercase tracking-wide leading-tight">
            {CERTIFICATE_COMPANY}
          </p>
        </div>
      </div>

      <div className="flex justify-between items-end gap-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-end gap-3">
            {CERTIFICATE_FOOTER_LEFT_LOGOS.map(({ src, alt, height }) => (
              <img
                key={src}
                src={src}
                alt={alt}
                className="w-auto object-contain shrink-0"
                style={{ height }}
                crossOrigin="anonymous"
              />
            ))}
          </div>
          <p className="text-[8px] font-semibold text-slate-600 leading-tight">
            A DPIIT Recognised Startup India and ISO Certified Platform
          </p>
        </div>

        <div className="flex items-end justify-end gap-3 shrink-0">
          {CERTIFICATE_FOOTER_RIGHT_LOGOS.map(({ src, alt, height }) => (
            <img
              key={src}
              src={src}
              alt={alt}
              className="w-auto object-contain shrink-0"
              style={{ height }}
              crossOrigin="anonymous"
            />
          ))}
        </div>
      </div>
    </footer>
  );
}

function CertificatePage({
  data,
  showSignature = true,
}: {
  data: CertificateDisplayData;
  showSignature?: boolean;
}) {
  return (
    <div
      data-certificate-page
      className="bg-white shadow-2xl text-slate-900 font-sans leading-snug relative flex flex-col overflow-hidden"
      style={{ ...pageStyle, padding: PAGE.padding }}
    >
      <TopLeftAccent />
      <BottomRightAccent />
      <CertificateHeader />
      <CertificationBody data={data} />
      <TablesSection data={data} />
      <CertificateFooter
        certificateId={data.certificateId}
        issueDate={data.issueDate}
        showSignature={showSignature}
      />
    </div>
  );
}

export const CertificateDocument = forwardRef<HTMLDivElement, Props>(
  function CertificateDocument({ data, className = "", showSignature = true }, ref) {
    return (
      <div ref={ref} className={className} style={{ width: PAGE.width }}>
        <CertificatePage data={data} showSignature={showSignature} />
      </div>
    );
  }
);

CertificateDocument.displayName = "CertificateDocument";
