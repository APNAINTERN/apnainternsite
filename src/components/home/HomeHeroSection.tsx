import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  GraduationCap,
  MapPin,
  PlayCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type HomeHeroSectionProps = {
  onRegister: () => void;
  onVerify: () => void;
};

const TRUST_TAGS = ["UGC Compliant", "NEP-2020 Aligned", "ISO 9001:2015", "Pan India"];

export function HomeHeroSection({ onRegister, onVerify }: HomeHeroSectionProps) {
  return (
    <section
      id="hero"
      className="relative min-h-[90vh] overflow-hidden border-b border-slate-200/60 home-mesh-bg"
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-24 top-20 h-96 w-96 rounded-full bg-sky-300/30 blur-3xl animate-pulse-slow" />
        <div className="absolute right-0 top-1/3 h-80 w-80 rounded-full bg-amber-200/40 blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-0 left-1/2 h-64 w-[40rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      </div>

      {/* Floating accents */}
      <div
        className="pointer-events-none absolute left-[8%] top-[28%] hidden size-16 rounded-2xl border border-white/60 bg-white/50 shadow-lg backdrop-blur-md lg:block animate-float"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-[12%] top-[22%] hidden size-12 rounded-full bg-gradient-to-br from-primary to-sky-400 opacity-80 shadow-glow lg:block animate-float"
        style={{ animationDelay: "1s" }}
        aria-hidden
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.08fr_0.92fr] lg:gap-14 lg:px-8 lg:pb-28 lg:pt-24">
        <div className="animate-fade-in-up text-center lg:text-left">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-white/90 px-4 py-2 text-sm font-semibold text-sky-800 shadow-sm backdrop-blur home-glass">
            <Sparkles className="size-4 text-amber-500" />
            UGC-mandated internships · Nationwide
            <MapPin className="size-3.5 text-primary" />
          </div>

          <h1 className="font-display text-[2.4rem] font-extrabold leading-[1.06] tracking-tight text-slate-900 sm:text-5xl lg:text-[3.5rem]">
            Build a{" "}
            <span className="home-gradient-text">career-ready profile</span>{" "}
            with verified internships
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-slate-600 lg:mx-0 lg:text-lg">
            Apna Intern connects undergraduate students across India to structured 120-hour
            programmes, live mentorship, and QR-verifiable certificates recognised by partner
            universities.
          </p>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
            <Button
              size="lg"
              className="btn-press group h-12 w-full rounded-full bg-gradient-to-r from-slate-900 to-slate-800 px-9 text-base font-semibold shadow-xl shadow-slate-900/20 hover:from-slate-800 hover:to-slate-700 sm:w-auto"
              onClick={onRegister}
            >
              Start registration
              <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="btn-press h-12 w-full rounded-full border-slate-300/80 bg-white/80 px-9 text-base font-semibold text-slate-800 backdrop-blur hover:bg-white sm:w-auto"
              onClick={onVerify}
            >
              <ShieldCheck className="mr-2 size-4 text-primary" />
              Verify certificate
            </Button>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
            {TRUST_TAGS.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200/80 transition-colors hover:ring-primary/30"
              >
                <BadgeCheck className="size-3.5 text-primary" />
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
          <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-primary/20 via-sky-200/20 to-amber-100/30 blur-2xl" aria-hidden />

          <div className="relative grid grid-cols-6 gap-3 sm:gap-4">
            <div className="col-span-6 overflow-hidden rounded-3xl border border-white/70 bg-white/90 p-2 shadow-[0_32px_80px_-24px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/60 backdrop-blur">
              <picture>
                <source srcSet="/hero-home.webp" type="image/webp" />
                <img
                  src="/hero-home.jpg"
                  alt="Students collaborating on an internship project"
                  className="aspect-[5/4] w-full rounded-2xl object-cover transition-transform duration-700 hover:scale-[1.02]"
                  loading="eager"
                  fetchPriority="high"
                />
              </picture>
            </div>

            <div className="col-span-3 home-card-hover rounded-2xl border border-slate-200/80 bg-white p-4 shadow-soft">
              <div className="mb-2 flex size-9 items-center justify-center rounded-xl bg-sky-50 text-primary">
                <GraduationCap className="size-5" />
              </div>
              <p className="font-display text-2xl font-extrabold text-slate-900">120</p>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Hours · 4 credits
              </p>
            </div>

            <div className="col-span-3 home-card-hover rounded-2xl border border-slate-800/20 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 text-white shadow-soft">
              <p className="text-xs font-bold uppercase tracking-wider text-sky-300">Live classes</p>
              <p className="mt-2 font-display text-lg font-bold leading-tight">
                Meet · YouTube · Recordings
              </p>
              <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-300">
                <PlayCircle className="size-3.5" /> Flexible schedule
              </div>
            </div>

            <div className="col-span-6 flex items-center justify-between gap-4 rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 to-white px-4 py-3 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md">
                  <ShieldCheck className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-emerald-950">QR-verified certificates</p>
                  <p className="text-xs text-emerald-800/80">Instant employer verification</p>
                </div>
              </div>
              <Link
                to="/verify"
                className="shrink-0 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                Try it
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
