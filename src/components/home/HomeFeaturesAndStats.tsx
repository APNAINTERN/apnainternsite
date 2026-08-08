import type { ReactNode, RefObject } from "react";
import { Award, Building2, Globe2, GraduationCap } from "lucide-react";
import { useAnimatedCounter } from "@/hooks/useAnimatedCounter";

type StatCard = { l: string; v: number; s: string };

type HomeStatsSectionProps = {
  statsRef: RefObject<HTMLDivElement>;
  statCards: StatCard[];
  active: boolean;
};

function AnimatedStat({
  label,
  target,
  suffix,
  icon,
  active,
}: {
  label: string;
  target: number;
  suffix: string;
  icon: ReactNode;
  active: boolean;
}) {
  const value = useAnimatedCounter(target, active);

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm transition-all duration-300 hover:border-primary/30 hover:bg-white/10">
      <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary transition-transform duration-300 group-hover:scale-110">
        {icon}
      </div>
      <p className="font-display text-3xl font-extrabold tracking-tight text-white md:text-4xl">
        {value.toLocaleString()}
        <span className="text-sky-300">{suffix}</span>
      </p>
      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <div className="pointer-events-none absolute -right-4 -top-4 size-20 rounded-full bg-primary/10 blur-2xl transition-opacity group-hover:opacity-100 opacity-0" />
    </div>
  );
}

export function HomeStatsSection({ statsRef, statCards, active }: HomeStatsSectionProps) {
  const icons = [
    <GraduationCap key="s" className="size-5" />,
    <Building2 key="u" className="size-5" />,
    <Globe2 key="d" className="size-5" />,
    <Award key="c" className="size-5" />,
  ];

  return (
    <section ref={statsRef} className="relative overflow-hidden bg-slate-950 py-16 text-white md:py-20">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 90% 70% at 50% -30%, hsl(208 74% 63% / 0.4), transparent 60%), linear-gradient(180deg, #0f172a 0%, #020617 100%)",
        }}
      />
      <div className="home-shimmer-line pointer-events-none absolute inset-x-0 top-0 h-px opacity-60" aria-hidden />

      <div className="relative mx-auto max-w-6xl px-6 lg:px-8">
        <div className="mb-10 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-400">By the numbers</p>
          <h2 className="font-display mt-3 text-2xl font-extrabold text-white md:text-3xl">
            Impact across India&apos;s student ecosystem
          </h2>
        </div>

        <div className="reveal-stagger grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6">
          {statCards.map((st, i) => (
            <div key={st.l} className="reveal-on-scroll">
              <AnimatedStat
                label={st.l}
                target={st.v}
                suffix={st.s}
                icon={icons[i]}
                active={active}
              />
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
    <section id="about" className="scroll-mt-24 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="reveal-on-scroll mb-12 max-w-3xl">
          <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-primary">
            <span className="size-1.5 rounded-full bg-primary animate-pulse" aria-hidden />
            Why Apna Intern
          </span>
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
            Built for India&apos;s undergraduate ecosystem
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-500 md:text-lg">
            A programme designed around university calendars, credit frameworks, and the realities
            of student life — not generic corporate training.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {lead ? (
            <article className="reveal-on-scroll group relative overflow-hidden rounded-3xl border border-sky-200/60 bg-gradient-to-br from-sky-50 via-white to-white p-8 shadow-soft md:col-span-2 lg:row-span-2">
              <div className="absolute -right-8 -top-8 size-40 rounded-full bg-sky-200/40 blur-2xl transition-transform duration-500 group-hover:scale-125" />
              <div className="relative">
                <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-sky-100 transition-transform duration-300 group-hover:rotate-3">
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
              className="reveal-on-scroll home-card-hover rounded-3xl border border-slate-200/80 bg-white p-6 shadow-soft"
              style={{ transitionDelay: `${idx * 50}ms` }}
            >
              <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-slate-100 transition-colors group-hover:bg-primary/5">
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
