import { ArrowRight } from "lucide-react";
import { HomeSectionHeader } from "./HomeSectionHeader";

type Step = { n: string; t: string; d: string };

type HomeHowItWorksProps = {
  steps: Step[];
};

export function HomeHowItWorks({ steps }: HomeHowItWorksProps) {
  return (
    <section className="py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <HomeSectionHeader
          pill="How it works"
          title="From registration to certificate in four steps"
          description="A clear, guided journey — no hidden steps or surprise fees."
        />

        <div className="relative grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div
            className="pointer-events-none absolute left-[12%] right-[12%] top-10 hidden h-px bg-gradient-to-r from-transparent via-sky-300 to-transparent lg:block"
            aria-hidden
          />
          {steps.map((s, i) => (
            <article
              key={s.t}
              className="reveal-on-scroll relative rounded-3xl border border-slate-200/80 bg-white p-6 shadow-soft"
              style={{ transitionDelay: `${i * 60}ms` }}
            >
              <div className="mb-5 flex size-10 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white shadow-md">
                {s.n}
              </div>
              <h3 className="font-display mb-2 text-lg font-bold text-slate-900">{s.t}</h3>
              <p className="text-sm leading-relaxed text-slate-500">{s.d}</p>
              {i < steps.length - 1 ? (
                <ArrowRight className="absolute -right-3 top-10 hidden size-5 text-sky-400 lg:block" />
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
