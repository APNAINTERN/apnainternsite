import type { ReactNode, RefObject } from "react";
import { HomeSectionHeader } from "./HomeSectionHeader";

type StatCard = { l: string; v: number; s: string };

type HomeStatsSectionProps = {
  statsRef: RefObject<HTMLDivElement>;
  statCards: StatCard[];
};

export function HomeStatsSection({ statsRef, statCards }: HomeStatsSectionProps) {
  return (
    <section ref={statsRef} className="relative bg-slate-950 py-14 text-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -20%, hsl(208 74% 63% / 0.35), transparent), linear-gradient(180deg, #0f172a 0%, #020617 100%)",
        }}
        aria-hidden
      />
      <div className="relative mx-auto max-w-6xl px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4 md:gap-6">
          {statCards.map((st) => (
            <div key={st.l} className="text-center md:text-left">
              <p className="font-display text-4xl font-extrabold tracking-tight md:text-5xl">
                {st.v.toLocaleString()}
                {st.s}
              </p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                {st.l}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

type HomeBentoFeaturesProps = {
  features: Array<{ i: ReactNode; t: string; d: string }>;
};

export function HomeBentoFeatures({ features }: HomeBentoFeaturesProps) {
  const [lead, ...rest] = features;

  return (
    <section id="about" className="py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <HomeSectionHeader
          pill="Why Apna Intern"
          title="Built for India's undergraduate ecosystem"
          description="A programme designed around university calendars, credit frameworks, and the realities of student life — not generic corporate training."
          align="left"
        />

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {lead ? (
            <article className="reveal-on-scroll group relative overflow-hidden rounded-3xl border border-sky-200/60 bg-gradient-to-br from-sky-50 via-white to-white p-8 shadow-soft md:col-span-2 lg:row-span-2">
              <div className="absolute -right-8 -top-8 size-40 rounded-full bg-sky-200/40 blur-2xl transition-transform group-hover:scale-110" />
              <div className="relative">
                <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-sky-100">
                  {lead.i}
                </div>
                <h3 className="font-display mb-3 text-2xl font-bold text-slate-900">{lead.t}</h3>
                <p className="max-w-md text-base leading-relaxed text-slate-600">{lead.d}</p>
              </div>
            </article>
          ) : null}

          {rest.map((f, idx) => (
            <article
              key={f.t}
              className="reveal-on-scroll rounded-3xl border border-slate-200/80 bg-white p-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-elegant"
              style={{ transitionDelay: `${idx * 50}ms` }}
            >
              <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-slate-100">
                {f.i}
              </div>
              <h3 className="font-display mb-2 text-lg font-bold text-slate-900">{f.t}</h3>
              <p className="text-sm leading-relaxed text-slate-500">{f.d}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
