import { Quote } from "lucide-react";
import { HomeSectionHeader } from "./HomeSectionHeader";

type Outcome = { quote: string; role: string };

type HomeOutcomesSectionProps = {
  outcomes: Outcome[];
};

export function HomeOutcomesSection({ outcomes }: HomeOutcomesSectionProps) {
  return (
    <section id="outcomes" className="border-t border-slate-200/80 bg-white py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <HomeSectionHeader
          pill="Success stories"
          title="What graduates take away from the programme"
          description="Real experiences from students balancing internships alongside semester schedules."
        />
        <div className="reveal-stagger grid gap-5 md:grid-cols-3">
          {outcomes.map((o, i) => (
            <blockquote
              key={i}
              className="reveal-on-scroll home-card-hover rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50/80 p-7 shadow-soft"
            >
              <Quote className="mb-4 size-8 text-sky-300" />
              <p className="text-sm leading-relaxed text-slate-700">&ldquo;{o.quote}&rdquo;</p>
              <footer className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {o.role}
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}
