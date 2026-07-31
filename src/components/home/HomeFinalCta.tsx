import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CERT_BADGES } from "./HomeTrustSection";

type HomeFinalCtaProps = {
  onRegister: () => void;
  onVerify: () => void;
};

export function HomeFinalCta({ onRegister, onVerify }: HomeFinalCtaProps) {
  return (
    <section className="py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="reveal-on-scroll overflow-hidden rounded-[2rem] bg-slate-950 text-white shadow-[0_32px_80px_-24px_rgba(15,23,42,0.55)]">
          <div className="grid lg:grid-cols-2">
            <div className="relative px-8 py-12 md:px-12 md:py-14">
              <div
                className="pointer-events-none absolute -left-20 top-0 h-64 w-64 rounded-full bg-sky-500/30 blur-3xl"
                aria-hidden
              />
              <div className="relative">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">
                  Ready when you are
                </p>
                <h2 className="font-display mt-4 text-3xl font-extrabold tracking-tight md:text-4xl">
                  Start your internship journey today
                </h2>
                <p className="mt-4 max-w-md text-base leading-relaxed text-slate-300">
                  Join thousands of students earning UGC-aligned credits with live training,
                  mentor support, and verifiable certificates.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button
                    size="lg"
                    className="btn-press rounded-full bg-white px-8 font-semibold text-slate-900 hover:bg-slate-100"
                    onClick={onRegister}
                  >
                    Register now
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="btn-press rounded-full border-white/25 bg-transparent px-8 font-semibold text-white hover:bg-white/10"
                    onClick={onVerify}
                  >
                    Verify certificate
                  </Button>
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 bg-white/5 px-8 py-10 lg:border-l lg:border-t-0">
              <p className="mb-6 text-center text-xs font-bold uppercase tracking-widest text-slate-400 lg:text-left">
                Recognised & certified
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {CERT_BADGES.map((b) => (
                  <div
                    key={b.t}
                    className="flex flex-col items-center rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm"
                  >
                    <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-white p-1">
                      <img
                        src={`/certifications/${b.img}`}
                        alt={b.t}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <span className="text-center text-[9px] font-bold uppercase leading-tight tracking-wide text-slate-300">
                      {b.t}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
