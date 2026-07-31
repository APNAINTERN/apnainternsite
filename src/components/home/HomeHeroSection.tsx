import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  GraduationCap,
  PlayCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type HomeHeroSectionProps = {
  onRegister: () => void;
  onVerify: () => void;
};

const TRUST_TAGS = ["UGC Compliant", "NEP-2020 Aligned", "ISO 9001:2015", "AICTE Registered"];

export function HomeHeroSection({ onRegister, onVerify }: HomeHeroSectionProps) {
  return (
    <section
      id="hero"
      className="relative overflow-hidden border-b border-slate-200/80 bg-[#f8fafc]"
    >
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-32 top-0 h-[28rem] w-[28rem] rounded-full bg-sky-200/40 blur-3xl" />
        <div className="absolute right-0 top-1/4 h-[24rem] w-[24rem] rounded-full bg-amber-100/50 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgb(148 163 184 / 0.25) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 pb-20 pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:pb-24 lg:pt-20">
        {/* Copy */}
        <div className="animate-fade-in-up text-center lg:text-left">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-white/90 px-4 py-2 text-sm font-semibold text-sky-800 shadow-sm backdrop-blur">
            <Sparkles className="size-4 text-amber-500" />
            UGC-mandated internships · Pan India
          </div>

          <h1 className="font-display text-[2.35rem] font-extrabold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl lg:text-[3.35rem]">
            Launch your career with a{" "}
            <span className="bg-gradient-to-r from-sky-600 via-sky-500 to-teal-500 bg-clip-text text-transparent">
              verified internship
            </span>{" "}
            programme
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-slate-600 lg:mx-0 lg:text-lg">
            Apna Intern connects undergraduate students to structured 120-hour programmes,
            live mentorship, and instantly verifiable certificates recognised by partner
            universities across Bihar and India.
          </p>

          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
            <Button
              size="lg"
              className="btn-press h-12 w-full rounded-full bg-slate-900 px-8 text-base font-semibold shadow-lg shadow-slate-900/15 hover:bg-slate-800 sm:w-auto"
              onClick={onRegister}
            >
              Start registration
              <ArrowRight className="ml-2 size-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="btn-press h-12 w-full rounded-full border-slate-300 bg-white/80 px-8 text-base font-semibold text-slate-800 backdrop-blur hover:bg-white sm:w-auto"
              onClick={onVerify}
            >
              <ShieldCheck className="mr-2 size-4 text-sky-600" />
              Verify certificate
            </Button>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
            {TRUST_TAGS.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200/80"
              >
                <BadgeCheck className="size-3.5 text-sky-600" />
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Visual bento */}
        <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
          <div className="grid grid-cols-6 gap-3 sm:gap-4">
            <div className="col-span-6 overflow-hidden rounded-3xl border border-white/60 bg-white p-2 shadow-[0_24px_60px_-20px_rgba(15,23,42,0.25)] ring-1 ring-slate-200/60">
              <picture>
                <source srcSet="/hero-home.webp" type="image/webp" />
                <img
                  src="/hero-home.jpg"
                  alt="Young professional working on an internship at a modern workspace"
                  className="aspect-[5/4] w-full rounded-2xl object-cover"
                  loading="eager"
                  fetchPriority="high"
                />
              </picture>
            </div>

            <div className="col-span-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-soft">
              <div className="mb-2 flex size-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                <GraduationCap className="size-5" />
              </div>
              <p className="font-display text-2xl font-extrabold text-slate-900">120</p>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Training hours · 4 credits
              </p>
            </div>

            <div className="col-span-3 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-900 to-slate-800 p-4 text-white shadow-soft">
              <p className="text-xs font-bold uppercase tracking-wider text-sky-300">Live classes</p>
              <p className="mt-2 font-display text-lg font-bold leading-tight">
                YouTube · Meet · Recordings
              </p>
              <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-300">
                <PlayCircle className="size-3.5" /> Flexible schedule
              </div>
            </div>

            <div className="col-span-6 flex items-center justify-between gap-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <ShieldCheck className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-emerald-950">QR-verified certificates</p>
                  <p className="text-xs text-emerald-800/80">Public verify portal for employers</p>
                </div>
              </div>
              <Link
                to="/verify"
                className="shrink-0 text-sm font-semibold text-emerald-800 underline-offset-4 hover:underline"
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
