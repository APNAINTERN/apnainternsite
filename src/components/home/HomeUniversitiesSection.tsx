import { RefObject } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { resolveStorageUrl } from "@/lib/storageUrl";
import { HomeSectionHeader } from "./HomeSectionHeader";

type University = {
  id: string;
  name: string;
  logo_url?: string | null;
};

type HomeUniversitiesSectionProps = {
  universities: University[];
  scrollRef: RefObject<HTMLDivElement>;
  paused: boolean;
  onPauseChange: (paused: boolean) => void;
};

export function HomeUniversitiesSection({
  universities,
  scrollRef,
  paused,
  onPauseChange,
}: HomeUniversitiesSectionProps) {
  return (
    <section id="universities" className="py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <HomeSectionHeader
          pill="Universities"
          title="Partner institutions across India"
          description="Recognised programmes aligned with UGC internship guidelines and NEP-2020 credit frameworks."
        />

        <div className="relative">
          <div
            ref={scrollRef}
            onMouseEnter={() => onPauseChange(true)}
            onMouseLeave={() => onPauseChange(false)}
            className="no-scrollbar flex cursor-grab gap-5 overflow-x-auto pb-6 active:cursor-grabbing"
          >
            {universities.length > 0 ? (
              universities.map((u) => {
                const abbr =
                  u.name.match(/\((.*?)\)/)?.[1] ||
                  u.name.split(" ")[0].substring(0, 4).toUpperCase();
                return (
                  <article
                    key={u.id}
                    className="w-[min(300px,85vw)] shrink-0 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-soft transition hover:-translate-y-0.5 hover:shadow-elegant"
                  >
                    <div className="mb-4">
                      {u.logo_url ? (
                        <img
                          src={resolveStorageUrl(u.logo_url) || u.logo_url}
                          alt={u.name}
                          className="size-14 rounded-2xl bg-slate-50 object-contain p-1.5"
                        />
                      ) : (
                        <div className="flex size-14 items-center justify-center rounded-2xl bg-sky-50 text-lg font-black text-sky-700">
                          {abbr}
                        </div>
                      )}
                    </div>
                    <p className="line-clamp-2 min-h-[3rem] text-base font-bold leading-snug text-slate-800">
                      {u.name}
                    </p>
                    <div className="mt-4 flex items-center gap-2">
                      <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Partner university
                      </span>
                    </div>
                  </article>
                );
              })
            ) : (
              <p className="w-full py-12 text-center text-slate-400">Loading universities…</p>
            )}
          </div>
          <div className="pointer-events-none absolute bottom-6 left-0 top-0 w-12 bg-gradient-to-r from-[#f8fafc] to-transparent" />
          <div className="pointer-events-none absolute bottom-6 right-0 top-0 w-12 bg-gradient-to-l from-[#f8fafc] to-transparent" />
        </div>

        <p className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
          <ArrowRight className="size-3.5" /> Drag to explore
        </p>
        <p className="mt-8 flex items-center justify-center gap-2 text-sm text-slate-500">
          <ShieldCheck className="size-4 text-sky-600" />
          UGC Internship Guidelines 2023 & NEP-2020 compliant
        </p>
      </div>
    </section>
  );
}
