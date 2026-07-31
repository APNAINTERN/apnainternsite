import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HomeSectionHeader } from "./HomeSectionHeader";

const CERT_BADGES = [
  { t: "MCA Registered", img: "mca_logo.png" },
  { t: "MSME Certified", img: "msme_logo.png" },
  { t: "ISO 9001:2015", img: "iso_logo.png" },
  { t: "AICTE Registered", img: "aicte_logo.png" },
  { t: "UGC Compliant", img: "ugc_logo.png" },
] as const;

type HomeTrustSectionProps = {
  onVerify: () => void;
};

export function HomeTrustSection({ onVerify }: HomeTrustSectionProps) {
  return (
    <section id="trust" className="bg-slate-50 py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <HomeSectionHeader
          pill="Trust & credibility"
          title="Credentials employers and colleges can rely on"
          description="Government-recognised compliance plus a public verification layer on every certificate."
        />

        <div className="reveal-on-scroll mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {CERT_BADGES.map((b) => (
            <div
              key={b.t}
              className="flex flex-col items-center rounded-2xl border border-white bg-white p-5 shadow-soft"
            >
              <div className="mb-3 flex size-16 items-center justify-center rounded-2xl bg-slate-50 p-2">
                <img
                  src={`/certifications/${b.img}`}
                  alt={b.t}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <span className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-600">
                {b.t}
              </span>
            </div>
          ))}
        </div>

        <div className="reveal-on-scroll flex flex-col items-center gap-6 rounded-3xl border border-sky-200/60 bg-white p-8 shadow-soft lg:flex-row lg:text-left">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
            <QrCode className="size-7" />
          </div>
          <div className="flex-1 text-center lg:text-left">
            <h3 className="font-display text-xl font-bold text-slate-900">Instant certificate verification</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Enter a certificate ID or scan the QR code — results appear on our public verify page with no login required.
            </p>
          </div>
          <Button
            variant="outline"
            className="btn-press shrink-0 rounded-full border-sky-200 px-6 text-sky-800 hover:bg-sky-50"
            onClick={onVerify}
          >
            Open verify portal
          </Button>
        </div>
      </div>
    </section>
  );
}

export { CERT_BADGES };
