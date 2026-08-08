import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Step = { n: string; t: string; d: string };

type HomeHowItWorksProps = {
  steps: Step[];
  onRegister?: () => void;
};

export function HomeHowItWorks({ steps, onRegister }: HomeHowItWorksProps) {
  return (
    <section id="how-it-works" className="scroll-mt-24 relative overflow-hidden py-20 md:py-28">
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 100%, hsl(208 74% 63% / 0.1), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6 lg:px-8">
        <div className="reveal-on-scroll mb-14 max-w-3xl mx-auto text-center">
          <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-slate-600 shadow-sm">
            How it works
          </span>
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
            From registration to certificate in four steps
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-500 md:text-lg">
            A clear, guided journey — no hidden steps or surprise fees.
          </p>
        </div>

        <div className="relative grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div
            className="pointer-events-none absolute left-[10%] right-[10%] top-12 hidden h-0.5 bg-gradient-to-r from-transparent via-primary/40 to-transparent lg:block home-shimmer-line"
            aria-hidden
          />
          {steps.map((s, i) => (
            <article
              key={s.t}
              className={cn(
                "reveal-on-scroll home-card-hover group relative rounded-3xl border border-slate-200/80 bg-white p-6 shadow-soft",
                "hover:border-primary/25"
              )}
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              <div className="mb-5 flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 text-sm font-bold text-white shadow-lg transition-transform duration-300 group-hover:scale-110">
                {s.n}
              </div>
              <h3 className="font-display mb-2 text-lg font-bold text-slate-900">{s.t}</h3>
              <p className="text-sm leading-relaxed text-slate-500">{s.d}</p>
              {i < steps.length - 1 ? (
                <ArrowRight className="absolute -right-3 top-12 hidden size-5 text-primary/60 lg:block" />
              ) : null}
            </article>
          ))}
        </div>

        {onRegister ? (
          <div className="reveal-on-scroll mt-12 text-center">
            <Button
              size="lg"
              className="btn-press rounded-full px-8"
              onClick={onRegister}
            >
              Get started now
              <ArrowRight className="ml-2 size-4" />
            </Button>
          </div>
        ) : (
          <div className="reveal-on-scroll mt-12 text-center">
            <Button asChild size="lg" className="btn-press rounded-full px-8">
              <Link to="/register">
                Get started now
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
