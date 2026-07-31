import { forwardRef } from "react";
import {
  CERTIFICATE_CEO,
  CERTIFICATE_CEO_TITLE,
  CERTIFICATE_VERIFY_URL,
  certificatePronouns,
  certificateVerifyUrl,
  type CertificateDisplayData,
} from "@/lib/certificateFormat";

type Props = {
  data: CertificateDisplayData;
  className?: string;
  /** Official signed copy for students; admin downloads use false. */
  showSignature?: boolean;
};

/** Landscape A4 — Engineering industrial-training certificate (exact template match). */
const PAGE = {
  width: "297mm",
  height: "210mm",
} as const;

/** Official transparent signature + company stamp from /public/certificate. */
const SIGNATURE_SRC = "/certificate/signature.png?v=8";
const STAMP_SRC = "/certificate/stamp.png";
const BORDER_SRC = "/certificate/engineering-border.png";
const WATERMARK_SRC = "/certificate/ei-icon.png";

const TEAL = "#2F9ED8";
const TITLE_BLUE = "#0084FF";

const pageStyle: React.CSSProperties = {
  width: PAGE.width,
  maxWidth: PAGE.width,
  minWidth: PAGE.width,
  height: PAGE.height,
  minHeight: PAGE.height,
  maxHeight: PAGE.height,
  boxSizing: "border-box",
};

function semesterNumber(raw: string): string {
  const m = String(raw || "").match(/(\d+)/);
  return m ? m[1] : raw;
}

function EngineeringCertificatePage({
  data,
  showSignature = true,
}: {
  data: CertificateDisplayData;
  showSignature?: boolean;
}) {
  const pronouns = certificatePronouns(data.gender);
  const college = data.collegeName || data.universityName || "—";
  const semNum = data.semester ? semesterNumber(data.semester) : "";
  const regNo =
    data.universityRegistrationNumber ||
    data.universityRollNo ||
    data.registrationId ||
    "—";
  const duration = data.durationLabel || "One Month";
  const domain = data.internshipDomain || "—";
  const startDate = data.startDate || "—";
  const endDate = data.endDate || "—";
  const attendance = data.attendancePercent || "—";
  const marks = data.marksPercent || "—";
  const certificateId = data.certificateId || "—";
  const issueDate = data.issueDate || "—";
  const verifyLink = data.certificateId
    ? certificateVerifyUrl(data.certificateId)
    : CERTIFICATE_VERIFY_URL;

  return (
    <div
      data-certificate-page
      data-certificate-orientation="landscape"
      className="bg-white text-black relative flex flex-col overflow-hidden"
      style={{
        ...pageStyle,
        padding: "14mm 16mm 11mm",
        fontFamily: 'Arial, Helvetica, "Segoe UI", sans-serif',
      }}
    >
      {/* Exact border extracted from official engineering certificate template */}
      <img
        src={BORDER_SRC}
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full pointer-events-none z-20"
        style={{ objectFit: "fill" }}
        crossOrigin="anonymous"
        decoding="sync"
      />

      {/* EI watermark */}
      <img
        src={WATERMARK_SRC}
        alt=""
        aria-hidden
        className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0"
        style={{ width: "88mm", height: "auto", opacity: 0.08 }}
        crossOrigin="anonymous"
      />

      {/* Header */}
      <header className="relative z-10 flex items-start justify-between gap-4 shrink-0">
        <img
          src="/certificate/header-logo.png"
          alt="Ezyintern"
          className="block shrink-0"
          style={{ height: "13mm", width: "auto", objectFit: "contain" }}
          crossOrigin="anonymous"
          decoding="sync"
        />
        <div className="flex items-center gap-3.5 shrink-0">
          <img
            src="/certificate/mca.png"
            alt="Ministry of Corporate Affairs"
            className="object-contain"
            style={{ height: "15mm", width: "auto" }}
            crossOrigin="anonymous"
          />
          <img
            src="/certificate/msme.png"
            alt="Ministry of MSME"
            className="object-contain"
            style={{ height: "15mm", width: "auto" }}
            crossOrigin="anonymous"
          />
        </div>
      </header>

      {/* Title + body — centered narrative matching template bolding */}
      <section className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-4">
        <h1
          className="font-bold tracking-wide leading-none mb-3.5"
          style={{
            fontFamily: 'Georgia, "Times New Roman", Times, serif',
            fontSize: "30px",
            color: TITLE_BLUE,
          }}
        >
          Certificate of Completion
        </h1>

        <div
          className="max-w-[235mm] space-y-[5px]"
          style={{ fontSize: "13.5px", lineHeight: 1.5, color: "#111" }}
        >
          <p>This is to certify that</p>

          <p className="font-bold text-black" style={{ fontSize: "18px", lineHeight: 1.3 }}>
            {data.studentName || "—"}
          </p>

          <p>of</p>

          <p className="font-bold text-black" style={{ fontSize: "15.5px" }}>
            {college}
          </p>

          {semNum ? (
            <p>
              Semester <span className="font-bold">{semNum}</span>, Registration Number{" "}
              <span className="font-bold">{regNo}</span>
            </p>
          ) : (
            <p>
              Registration Number <span className="font-bold">{regNo}</span>
            </p>
          )}

          <p>
            has successfully completed a <span className="font-bold">{duration}</span>{" "}
            Industrial Training in
          </p>

          <p className="font-bold text-black pt-0.5" style={{ fontSize: "18px" }}>
            {domain}
          </p>

          <p>
            from <span className="font-bold">{startDate}</span> to{" "}
            <span className="font-bold">{endDate}</span>
          </p>

          <p className="pt-1.5 max-w-[225mm] mx-auto">
            During this internship, <span className="font-bold">{pronouns.subject}</span> has
            learned key concepts and tools relevant to the domain through practical assignments
            and project work. <span className="font-bold">{pronouns.Subject}</span> maintained{" "}
            <span className="font-bold">{attendance}</span> attendance and secured{" "}
            <span className="font-bold">{marks}</span> Marks in the final assessment.
          </p>

          <p>
            We appreciate <span className="font-bold">{pronouns.possessive}</span> sincere
            participation and wish them the best for future opportunities.
          </p>
        </div>
      </section>

      {/* Footer — 3 columns matching template */}
      <footer className="relative z-10 shrink-0 grid grid-cols-[1.15fr_1fr_1fr] gap-2 items-end pt-1">
        {/* Left: QR + cert meta */}
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="relative size-[17mm] shrink-0 border border-slate-300 bg-white p-[1px]">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=280x280&ecc=Q&data=${encodeURIComponent(verifyLink)}`}
              alt="QR Code"
              className="w-full h-full"
              crossOrigin="anonymous"
            />
          </div>
          <div className="leading-snug pt-0.5 min-w-0" style={{ fontSize: "10.5px", color: TEAL }}>
            <p>
              <span className="font-semibold">Certificate Number: </span>
              <span className="font-bold break-all">{certificateId}</span>
            </p>
            <p className="mt-0.5">
              <span className="font-semibold">Date of Certification: </span>
              <span className="font-bold">{issueDate}</span>
            </p>
            <p className="mt-1 leading-tight" style={{ fontSize: "8.5px", color: TEAL }}>
              Online Certificate Verification Available on:
              <br />
              www.ezyintern.com/certificate-verification/
            </p>
          </div>
        </div>

        {/* Center: AICTE / NIP / ISO */}
        <div className="flex flex-col items-center justify-end gap-1 pb-0.5">
          <div className="flex items-end justify-center gap-3">
            <img
              src="/certificate/aicte.png"
              alt="AICTE"
              className="object-contain"
              style={{ height: "13.5mm" }}
              crossOrigin="anonymous"
            />
            <img
              src="/certificate/nip.png"
              alt="National Internship Portal"
              className="object-contain"
              style={{ height: "13.5mm" }}
              crossOrigin="anonymous"
            />
            <img
              src="/certificate/iso.png"
              alt="ISO 9001:2015"
              className="object-contain"
              style={{ height: "14.5mm" }}
              crossOrigin="anonymous"
            />
          </div>
          <p className="font-bold text-black text-center" style={{ fontSize: "9px" }}>
            (AICTE Approved and ISO Certified Platform)
          </p>
        </div>

        {/* Right: stamp + signature (from /public/certificate) */}
        <div className="flex flex-col items-end justify-end text-right">
          {showSignature ? (
            <div className="relative w-full flex justify-end items-end" style={{ height: "22mm" }}>
              <img
                src={STAMP_SRC}
                alt="Ezyintern company stamp"
                className="absolute object-contain"
                style={{
                  right: "0",
                  bottom: "2mm",
                  height: "20mm",
                  width: "20mm",
                  opacity: 0.92,
                }}
                crossOrigin="anonymous"
              />
              <img
                src={SIGNATURE_SRC}
                alt="Signature of Raushan Kumar"
                className="relative z-10 object-contain object-bottom"
                style={{
                  height: "18mm",
                  width: "auto",
                  maxWidth: "52mm",
                  marginRight: "7mm",
                }}
                crossOrigin="anonymous"
              />
            </div>
          ) : (
            <div style={{ height: "22mm" }} aria-hidden />
          )}
          <p
            className="font-bold text-black leading-tight"
            style={{
              fontFamily: 'Georgia, "Times New Roman", Times, serif',
              fontSize: "14px",
              fontStyle: "italic",
            }}
          >
            Mr. {CERTIFICATE_CEO}
          </p>
          <p
            className="font-bold leading-tight"
            style={{
              fontFamily: 'Georgia, "Times New Roman", Times, serif',
              fontSize: "11.5px",
              color: TITLE_BLUE,
            }}
          >
            {CERTIFICATE_CEO_TITLE}
          </p>
        </div>
      </footer>
    </div>
  );
}

export const EngineeringCertificateDocument = forwardRef<HTMLDivElement, Props>(
  function EngineeringCertificateDocument(
    { data, className = "", showSignature = true },
    ref
  ) {
    return (
      <div ref={ref} className={className} style={{ width: PAGE.width }}>
        <EngineeringCertificatePage data={data} showSignature={showSignature} />
      </div>
    );
  }
);

EngineeringCertificateDocument.displayName = "EngineeringCertificateDocument";
