import { Handshake } from "lucide-react";
import { HomeSectionHeader } from "./HomeSectionHeader";
import { CERT_BADGES } from "./HomeTrustSection";

type University = { id: string; name: string };

type HomePartnersSectionProps = {
  universities: University[];
};

export function HomePartnersSection({ universities }: HomePartnersSectionProps) {
  const uniItems =
    universities.length > 0
      ? [...universities, ...universities]
      : [
          { id: "1", name: "Partner universities loading…" },
          { id: "2", name: "Pan India academic network" },
        ];

  return (
    <section id="partners" className="scroll-mt-24 bg-slate-950 py-16 md:py-20 text-white">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <HomeSectionHeader
          pill="Our partners"
          title="Universities, colleges & compliance partners"
          description="We collaborate with academic institutions and recognised certification bodies to deliver trusted internship programmes at scale."
          className="[&_h2]:text-white [&_p]:text-slate-400 [&_span]:border-white/10 [&_span]:bg-white/5 [&_span]:text-slate-300"
        />

        <div className="reveal-on-scroll mb-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {CERT_BADGES.map((badge) => (
            <div
              key={badge.t}
              className="home-card-hover flex flex-col items-center rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm"
            >
              <div className="mb-3 flex size-14 items-center justify-center rounded-xl bg-white p-2">
                <img
                  src={`/certifications/${badge.img}`}
                  alt={badge.t}
                  className="max-h-full max-w-full object-contain"
                  loading="lazy"
                />
              </div>
              <span className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-300">
                {badge.t}
              </span>
            </div>
          ))}
        </div>

        <div className="reveal-on-scroll overflow-hidden rounded-2xl border border-white/10 bg-white/5 py-6">
          <div className="mb-4 flex items-center justify-center gap-2 px-4">
            <Handshake className="size-4 text-sky-400" />
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
              Academic partner network
            </p>
          </div>

          <div className="relative">
            <div className="flex w-max animate-marquee gap-10 px-6">
              {uniItems.map((uni, i) => (
                <span
                  key={`${uni.id}-${i}`}
                  className="shrink-0 whitespace-nowrap text-sm font-semibold text-slate-300 transition-colors hover:text-white"
                >
                  {uni.name}
                </span>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-slate-950 to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-slate-950 to-transparent" />
          </div>
        </div>
      </div>
    </section>
  );
}
