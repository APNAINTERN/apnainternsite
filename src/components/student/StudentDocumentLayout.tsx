import { forwardRef } from "react";
import { Globe, Mail, MapPin, Phone } from "lucide-react";
import { ACCREDITATION_LOGOS } from "@/lib/documentLogos";
import {
  CERTIFICATE_CEO,
  CERTIFICATE_CEO_TITLE,
  CERTIFICATE_COMPANY,
  CERTIFICATE_SIGNATURE_SRC,
} from "@/lib/certificateFormat";
import { ACCEPTANCE_LETTER_ISSUE_DATE } from "@/lib/offerLetterProfile";

export const DOCUMENT_PAGE = {
  width: "210mm",
  height: "297mm",
  padding: "10mm 12mm",
  captureWidthPx: 794,
} as const;

export const documentPageStyle: React.CSSProperties = {
  width: DOCUMENT_PAGE.width,
  maxWidth: DOCUMENT_PAGE.width,
  minWidth: DOCUMENT_PAGE.width,
  height: DOCUMENT_PAGE.height,
  minHeight: DOCUMENT_PAGE.height,
  maxHeight: DOCUMENT_PAGE.height,
  boxSizing: "border-box",
};

function TopLeftAccent() {
  return (
    <div className="absolute top-0 left-0 z-20 pointer-events-none">
      <div
        className="h-[12px] w-[78px] bg-[#0084FF]"
        style={{ clipPath: "polygon(0 0, 100% 0, 78% 100%, 0% 100%)" }}
      />
      <div
        className="h-[12px] w-[24px] bg-[#CDE6FE] absolute top-0 left-[62px]"
        style={{ clipPath: "polygon(30% 0, 100% 0, 70% 100%, 0% 100%)" }}
      />
    </div>
  );
}

export function DocumentHeader() {
  return (
    <header className="relative z-10 pt-2 pb-2.5 shrink-0">
      <div className="flex justify-between items-center gap-3">
        <div className="flex items-center shrink-0 min-w-0">
          <img
            src="/certificate/header-logo.png"
            alt="Apna Intern"
            className="block shrink-0"
            style={{ height: "14mm", width: "auto", objectFit: "contain" }}
            crossOrigin="anonymous"
            decoding="sync"
          />
        </div>

        <div className="flex flex-col items-end gap-0.5 text-[9px] font-medium text-slate-800 leading-snug max-w-[48%] shrink">
          <div className="flex items-center gap-1 text-right">
            <span>Arfabad Colony, East Nahar Road, Bajranngpuri, Patna - 800007</span>
            <span className="bg-[#0084FF] text-white rounded-full p-[2px] shrink-0 inline-flex">
              <MapPin className="size-[7px]" strokeWidth={3} />
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span>7050936593</span>
            <span className="bg-[#0084FF] text-white rounded-full p-[2px] inline-flex">
              <Phone className="size-[7px]" strokeWidth={3} />
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span>contact@ezyintern.in</span>
            <span className="bg-[#0084FF] text-white rounded-full p-[2px] inline-flex">
              <Mail className="size-[7px]" strokeWidth={3} />
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span>www.ezyintern.in</span>
            <span className="bg-[#0084FF] text-white rounded-full p-[2px] inline-flex">
              <Globe className="size-[7px]" strokeWidth={3} />
            </span>
          </div>
        </div>
      </div>
      <div className="mt-2 border-b-[1.5px] border-[#1E3A8A]" />
    </header>
  );
}

export function DocumentFooter({
  documentLabel,
  issueDate = ACCEPTANCE_LETTER_ISSUE_DATE,
  showSignature = true,
  showLogos = true,
  showDocumentInfo = true,
  pageLabel,
}: {
  documentLabel: string;
  issueDate?: string;
  showSignature?: boolean;
  showLogos?: boolean;
  showDocumentInfo?: boolean;
  pageLabel?: string;
}) {
  const showDetails = showDocumentInfo || showSignature;

  return (
    <footer className="relative z-10 mt-auto pt-2 shrink-0 border-t border-slate-200">
      {showDetails ? (
        <div className="flex justify-between items-end gap-3 mb-2 text-[10px]">
          {showDocumentInfo ? (
            <div className="space-y-0.5">
              <p>
                <span className="font-bold text-slate-800">Document: </span>
                <span className="font-bold text-[#5AA3E6]">{documentLabel}</span>
              </p>
              <p>
                <span className="font-bold text-slate-800">Issue Date: </span>
                <span className="font-bold text-[#5AA3E6]">{issueDate}</span>
              </p>
            </div>
          ) : (
            <div />
          )}
          {showSignature ? (
            <div className="text-right">
              <div className="flex justify-end items-end gap-2 mb-0.5">
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
              <p className="text-[10px] font-bold text-slate-900">{CERTIFICATE_CEO}</p>
              <p className="text-[9px] font-semibold text-slate-700">{CERTIFICATE_CEO_TITLE}</p>
              <p className="text-[9px] font-bold text-[#5AA3E6] uppercase tracking-wide leading-tight">
                {CERTIFICATE_COMPANY}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {showLogos ? (
        <>
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
        </>
      ) : null}

      {pageLabel ? (
        <p className="text-[10px] text-right font-medium text-slate-500 pt-1">{pageLabel}</p>
      ) : null}
    </footer>
  );
}

export function ContinuationHeader({
  studentName,
  pageLabel,
}: {
  studentName: string;
  pageLabel: string;
}) {
  return (
    <div className="flex justify-end items-center gap-2 border-b border-slate-200 pb-2 mb-3 text-[10px] shrink-0">
      <span className="font-bold text-slate-800">{studentName}</span>
      <span className="text-slate-300">|</span>
      <span className="text-slate-500 font-medium">{pageLabel}</span>
    </div>
  );
}

export function DocumentPage({
  children,
  showFooter = true,
  documentLabel,
  variant = "full",
  continuationHeader,
  showSignature = true,
  showLogos = true,
  showDocumentInfo = true,
  pageLabel,
  issueDate,
}: {
  children: React.ReactNode;
  showFooter?: boolean;
  documentLabel: string;
  variant?: "full" | "continuation";
  continuationHeader?: { studentName: string; pageLabel: string };
  showSignature?: boolean;
  showLogos?: boolean;
  showDocumentInfo?: boolean;
  pageLabel?: string;
  issueDate?: string;
}) {
  return (
    <div
      data-document-page
      className="bg-white text-slate-900 font-sans leading-snug relative flex flex-col overflow-hidden shadow-md"
      style={{ ...documentPageStyle, padding: DOCUMENT_PAGE.padding }}
    >
      {variant === "full" ? (
        <>
          <TopLeftAccent />
          <DocumentHeader />
        </>
      ) : null}
      <div className="relative z-10 flex-1 py-3 min-h-0 overflow-hidden">
        {variant === "continuation" && continuationHeader ? (
          <ContinuationHeader
            studentName={continuationHeader.studentName}
            pageLabel={continuationHeader.pageLabel}
          />
        ) : null}
        {children}
      </div>
      {showFooter ? (
        <DocumentFooter
          documentLabel={documentLabel}
          issueDate={issueDate}
          showSignature={showSignature}
          showLogos={showLogos}
          showDocumentInfo={showDocumentInfo}
          pageLabel={pageLabel}
        />
      ) : null}
    </div>
  );
}

export const DocumentPages = forwardRef<HTMLDivElement, { children: React.ReactNode }>(
  function DocumentPages({ children }, ref) {
    return (
      <div
        ref={ref}
        className="flex flex-col"
        style={{ width: DOCUMENT_PAGE.width, gap: "16px" }}
      >
        {children}
      </div>
    );
  }
);
DocumentPages.displayName = "DocumentPages";

export function InfoTable({ rows }: { rows: [string, string][] }) {
  return (
    <table className="w-full border border-[#5AA3E6] text-[10.5px] mb-3">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-b border-[#5AA3E6]/40 last:border-b-0">
            <td className="font-bold p-1.5 w-[36%] bg-[#E8F4FD] border-r border-[#5AA3E6]/40 text-slate-800">
              {label}
            </td>
            <td className="p-1.5 text-slate-900">{value || ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DocumentTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="text-center mb-3">
      <h1 className="text-[18px] font-black text-[#1E3A8A] uppercase tracking-wide">{title}</h1>
      {subtitle ? (
        <p className="text-[10px] text-slate-600 mt-1 font-medium">{subtitle}</p>
      ) : null}
      <div className="mt-2 mx-auto w-24 h-[2px] bg-[#5AA3E6]" />
    </div>
  );
}
