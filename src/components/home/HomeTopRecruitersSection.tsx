import { Building2 } from "lucide-react";
import { HomeSectionHeader } from "./HomeSectionHeader";
import { TOP_RECRUITERS } from "@/lib/homePageContent";

const RECRUITER_ITEMS = [...TOP_RECRUITERS, ...TOP_RECRUITERS];

export function HomeTopRecruitersSection() {
  return (
    <section id="recruiters" className="scroll-mt-24 border-y border-slate-200/80 bg-white py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <HomeSectionHeader
          pill="Top recruiters"
          title="Skills that open doors with leading employers"
          description="Our internship domains are designed around competencies valued by India's top companies — from IT services and banking to startups and e-commerce."
        />

        <div className="reveal-on-scroll overflow-hidden rounded-3xl border border-slate-200/80 bg-slate-50/80 py-8">
          <div className="mb-6 flex items-center justify-center gap-2">
            <Building2 className="size-4 text-primary" />
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              Employers value verified internship credentials
            </p>
          </div>

          <div className="relative">
            <div className="flex w-max animate-marquee gap-4 px-4">
              {RECRUITER_ITEMS.map((name, i) => (
                <div
                  key={`${name}-${i}`}
                  className="flex h-14 min-w-[9rem] shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 bg-white px-6 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                >
                  <span className="font-display text-sm font-bold tracking-tight text-slate-700">
                    {name}
                  </span>
                </div>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-slate-50 to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-slate-50 to-transparent" />
          </div>
        </div>
      </div>
    </section>
  );
}
