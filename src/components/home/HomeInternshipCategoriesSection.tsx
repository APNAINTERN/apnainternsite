import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { HomeSectionHeader } from "./HomeSectionHeader";
import { INTERNSHIP_CATEGORIES } from "@/lib/homePageContent";

export function HomeInternshipCategoriesSection() {
  return (
    <section id="categories" className="scroll-mt-24 py-20 md:py-24 home-mesh-bg">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <HomeSectionHeader
          pill="Internship categories"
          title="Domains matched to your degree and career goals"
          description="Explore structured tracks across marketing, tech, finance, design, and professional skills — all aligned with UGC internship guidelines."
        />

        <div className="reveal-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {INTERNSHIP_CATEGORIES.map((category) => {
            const Icon = category.icon;
            return (
              <article
                key={category.title}
                className={`reveal-on-scroll home-card-hover group relative overflow-hidden rounded-3xl border bg-gradient-to-br p-6 shadow-soft ${category.accent}`}
              >
                <div className="absolute -right-6 -top-6 size-24 rounded-full bg-white/40 blur-2xl transition-transform duration-500 group-hover:scale-125" />
                <div className="relative">
                  <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-white text-primary shadow-sm ring-1 ring-slate-200/80 transition-transform duration-300 group-hover:scale-110">
                    <Icon className="size-6" />
                  </div>
                  <h3 className="font-display text-lg font-bold text-slate-900">{category.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 line-clamp-3">
                    {category.description}
                  </p>
                  <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {category.domains}
                  </p>
                </div>
              </article>
            );
          })}
        </div>

        <div className="reveal-on-scroll mt-10 text-center">
          <Button asChild size="lg" className="btn-press rounded-full px-8">
            <Link to="/register">
              Browse all domains at registration
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
