import { Star, Users } from "lucide-react";
import type { RefObject } from "react";
import { HomeSectionHeader } from "./HomeSectionHeader";
import { TRUSTED_STUDENT_HIGHLIGHTS } from "@/lib/homePageContent";

const AVATAR_COLORS = [
  "bg-sky-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-indigo-500",
];

type HomeTrustedByStudentsProps = {
  studentCount: number;
  counted: boolean;
  sectionRef?: RefObject<HTMLDivElement>;
};

export function HomeTrustedByStudents({ studentCount, counted, sectionRef }: HomeTrustedByStudentsProps) {
  const displayCount = counted ? studentCount : 0;

  return (
    <section ref={sectionRef} className="relative overflow-hidden border-b border-slate-200/60 bg-white py-16 md:py-20">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 0%, hsl(208 74% 63% / 0.12), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6 lg:px-8">
        <HomeSectionHeader
          pill="Trusted by students"
          title="India's students choose Apna Intern for career-ready training"
          description="From Bihar to pan-India campuses, undergraduates rely on our UGC-aligned programmes, mentor support, and verifiable credentials."
        />

        <div className="reveal-on-scroll mx-auto mb-12 flex max-w-2xl flex-col items-center gap-5 rounded-3xl border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-sky-50/50 p-8 shadow-soft">
          <div className="flex -space-x-3">
            {AVATAR_COLORS.map((color, i) => (
              <div
                key={color}
                className={`flex size-11 items-center justify-center rounded-full border-[3px] border-white text-xs font-bold text-white shadow-md ${color}`}
                style={{ zIndex: AVATAR_COLORS.length - i }}
              >
                {String.fromCharCode(65 + i)}
              </div>
            ))}
            <div className="flex size-11 items-center justify-center rounded-full border-[3px] border-white bg-slate-900 text-[10px] font-bold text-white shadow-md">
              <Users className="size-4" />
            </div>
          </div>

          <div className="text-center">
            <p className="font-display text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
              {displayCount.toLocaleString()}+
            </p>
            <p className="mt-1 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
              Students trained nationwide
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm ring-1 ring-slate-200/80">
            <div className="flex">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="size-4 fill-amber-400 text-amber-400" />
              ))}
            </div>
            <span className="text-sm font-semibold text-slate-700">4.8 student satisfaction</span>
          </div>
        </div>

        <div className="reveal-stagger grid grid-cols-2 gap-4 md:grid-cols-4">
          {TRUSTED_STUDENT_HIGHLIGHTS.map((item) => (
            <div
              key={item.label}
              className="reveal-on-scroll home-card-hover rounded-2xl border border-slate-200/70 bg-white p-5 text-center shadow-sm"
            >
              <p className="font-display text-2xl font-extrabold text-slate-900 md:text-3xl">
                {item.value}
                <span className="text-primary">{item.suffix}</span>
              </p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {item.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
