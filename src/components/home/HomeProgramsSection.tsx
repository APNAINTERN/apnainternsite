import type { ReactNode } from "react";
import { BookOpen, BarChart3, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HomeSectionHeader } from "./HomeSectionHeader";
import type { UgStreamKey } from "@/lib/subjectDomainMap";

const STREAM_META: Record<
  UgStreamKey,
  { icon: ReactNode; hint: string; accent: string }
> = {
  "B.A.": {
    icon: <Palette className="size-6" />,
    hint: "Humanities & social sciences",
    accent: "from-violet-500/10 to-fuchsia-500/5 border-violet-200/60",
  },
  "B.Sc.": {
    icon: <BookOpen className="size-6" />,
    hint: "Science & research tracks",
    accent: "from-sky-500/10 to-cyan-500/5 border-sky-200/60",
  },
  "B.Com.": {
    icon: <BarChart3 className="size-6" />,
    hint: "Commerce & finance domains",
    accent: "from-amber-500/10 to-orange-500/5 border-amber-200/60",
  },
};

type HomeProgramsSectionProps = {
  onSelectStream: (stream: UgStreamKey) => void;
};

const STREAMS: UgStreamKey[] = ["B.A.", "B.Sc.", "B.Com."];

export function HomeProgramsSection({ onSelectStream }: HomeProgramsSectionProps) {
  return (
    <section id="programs" className="border-y border-slate-200/80 bg-white py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <HomeSectionHeader
          pill="Programmes"
          title="Choose your stream, pick your domain"
          description="Internship domains are matched to B.A., B.Sc., and B.Com. backgrounds — browse options before you register."
        />

        <div className="grid gap-5 md:grid-cols-3">
          {STREAMS.map((name) => {
            const meta = STREAM_META[name];
            return (
              <article
                key={name}
                className={`reveal-on-scroll group relative overflow-hidden rounded-3xl border bg-gradient-to-br p-8 shadow-soft transition-all hover:-translate-y-1 hover:shadow-elegant ${meta.accent}`}
              >
                <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-white text-sky-700 shadow-sm ring-1 ring-slate-200/80">
                  {meta.icon}
                </div>
                <h3 className="font-display text-2xl font-extrabold text-slate-900">{name}</h3>
                <p className="mt-2 text-sm font-medium text-slate-500">{meta.hint}</p>
                <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                  15+ domains
                </p>
                <Button
                  className="btn-press mt-8 w-full rounded-full"
                  variant="secondary"
                  onClick={() => onSelectStream(name)}
                >
                  Explore domains
                </Button>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
