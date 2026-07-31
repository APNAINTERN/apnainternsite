type Faq = { cat: string; q: string; a: string };

type HomeFaqSectionProps = {
  faqs: Faq[];
};

export function HomeFaqSection({ faqs }: HomeFaqSectionProps) {
  return (
    <section className="bg-slate-50 py-20 md:py-24" id="faq">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="reveal-on-scroll lg:sticky lg:top-28">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-slate-600">
              Support
            </span>
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
              Questions students ask most
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-500">
              Payments, credits, verification, and programme format — answered in plain language.
            </p>
          </div>

          <div className="reveal-on-scroll space-y-3">
            {faqs.map((f, i) => (
              <details
                key={f.q}
                className="group rounded-2xl border border-slate-200/80 bg-white px-5 py-4 shadow-sm open:shadow-soft"
                open={i === 0}
              >
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-[15px] font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                  <span>
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-sky-600">
                      {f.cat}
                    </span>
                    {f.q}
                  </span>
                  <span className="mt-1 shrink-0 text-lg font-normal text-sky-600 group-open:hidden">+</span>
                  <span className="mt-1 hidden shrink-0 text-lg font-normal text-sky-600 group-open:inline">−</span>
                </summary>
                <p className="mt-3 border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-500">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
