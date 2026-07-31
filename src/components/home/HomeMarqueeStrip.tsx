import { RefObject } from "react";

type University = { id: string; name: string };

type HomeMarqueeStripProps = {
  universities: University[];
  stripRef: RefObject<HTMLDivElement>;
  paused: boolean;
  onPauseChange: (paused: boolean) => void;
};

export function HomeMarqueeStrip({
  universities,
  stripRef,
  paused,
  onPauseChange,
}: HomeMarqueeStripProps) {
  const items =
    universities.length > 0
      ? [...universities, ...universities]
      : [{ id: "loading", name: "Loading partner universities…" }];

  return (
    <div className="border-y border-slate-200/80 bg-white py-8">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <p className="mb-5 text-center text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
          Trusted by partner universities
        </p>
        <div className="relative overflow-hidden">
          <div
            ref={stripRef}
            onMouseEnter={() => onPauseChange(true)}
            onMouseLeave={() => onPauseChange(false)}
            className="no-scrollbar flex flex-nowrap items-center gap-12 overflow-x-auto py-1"
          >
            {items.map((u, i) => (
              <span
                key={`${u.id}-${i}`}
                className="shrink-0 whitespace-nowrap text-sm font-semibold text-slate-500 transition-colors hover:text-sky-700"
              >
                {u.name}
              </span>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-white to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-white to-transparent" />
        </div>
      </div>
    </div>
  );
}
