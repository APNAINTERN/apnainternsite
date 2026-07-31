// Deploy refresh marker — no functional change (2026-07-08).
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState, useRef } from "react";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NoticePopup } from "@/components/NoticePopup";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { fetchPublicUniversities } from "@/lib/registrationCatalog";
import { resolveStorageUrl, downloadStorageFile } from "@/lib/storageUrl";
import {
  fetchConsultLetter,
  fetchPublicGalleryImages,
  type SiteGalleryImage,
} from "@/lib/siteContentApi";
import {
  fetchPublicExpertTeam,
  fetchPublicMous,
  fetchPublicOfflinePrograms,
  fetchPublicSampleCertificates,
  fetchPublicTestimonials,
  type SiteExpertMember,
  type SiteMou,
  type SiteOfflineProgram,
  type SiteSampleCertificate,
  type SiteTestimonial,
} from "@/lib/siteHomeCmsApi";
import {
  HomeExpertTeamSection,
  HomeGallerySection,
  HomeMouSection,
  HomeSampleCertificatesSection,
  HomeTestimonialsSection,
} from "@/components/home/HomeCmsSections";
import { HomeCoursesSections } from "@/components/courses/HomeCoursesSections";
import {
  getDomainsForUgStream,
  type UgStreamKey,
} from "@/lib/subjectDomainMap";
import {
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Zap,
  Clock,
  Target,
  Smartphone,
  UserCheck,
  BookOpen,
  Palette,
  BarChart3,
  Quote,
  QrCode,
  Download,
  ExternalLink,
  FileText,
  Loader2,
} from "lucide-react";

const WaveDivider = ({ flip = false, className = "" }: { flip?: boolean; className?: string }) => (
  <div className={`pointer-events-none leading-[0] ${flip ? "rotate-180" : ""} ${className}`} aria-hidden>
    <svg viewBox="0 0 1440 64" preserveAspectRatio="none" className="block h-10 w-full md:h-12">
      <path
        d="M0,32 C240,64 480,0 720,24 C960,48 1200,8 1440,32 L1440,64 L0,64 Z"
        fill="currentColor"
      />
    </svg>
  </div>
);

const SectionHead = ({
  pill,
  title,
  description,
}: {
  pill?: string;
  title: string;
  description?: string;
}) => (
  <div className="reveal-on-scroll mx-auto mb-11 max-w-[640px] text-center">
    {pill ? (
      <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3.5 py-1.5 text-[13px] font-semibold text-primary">
        {pill}
      </span>
    ) : null}
    <h2 className="font-display mb-3 text-[28px] font-bold tracking-tight text-slate-900 md:text-[32px]">
      {title}
    </h2>
    {description ? <p className="text-[15px] leading-relaxed text-slate-500">{description}</p> : null}
  </div>
);

const CERT_BADGES = [
  { t: "MCA Registered", img: "mca_logo.png" },
  { t: "MSME Certified", img: "msme_logo.png" },
  { t: "ISO 9001:2015", img: "iso_logo.png" },
  { t: "AICTE Registered", img: "aicte_logo.png" },
  { t: "UGC Compliant", img: "ugc_logo.png" },
] as const;

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const statsRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState({ students: 0, unis: 0, domains: 0, certs: 0 });
  const [unis, setUnis] = useState<any[]>([]);
  const [counted, setCounted] = useState(false);
  const [galleryImages, setGalleryImages] = useState<SiteGalleryImage[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [sampleCerts, setSampleCerts] = useState<SiteSampleCertificate[]>([]);
  const [expertTeam, setExpertTeam] = useState<SiteExpertMember[]>([]);
  const [mous, setMous] = useState<SiteMou[]>([]);
  const [offlinePrograms, setOfflinePrograms] = useState<SiteOfflineProgram[]>([]);
  const [testimonials, setTestimonials] = useState<SiteTestimonial[]>([]);
  const [consentFormUrl, setConsentFormUrl] = useState<string | null>(null);
  const [consentFormName, setConsentFormName] = useState<string | null>(null);
  const [domainsStream, setDomainsStream] = useState<UgStreamKey | null>(null);

  const streamDomains = useMemo(
    () => (domainsStream ? getDomainsForUgStream(domainsStream) : []),
    [domainsStream]
  );

  useEffect(() => {
    fetchPublicUniversities(supabase).then(setUnis).catch(() => setUnis([]));
    setGalleryLoading(true);
    fetchPublicGalleryImages(supabase)
      .then(setGalleryImages)
      .catch((err) => {
        console.warn("[gallery] public fetch failed:", err);
        setGalleryImages([]);
      })
      .finally(() => setGalleryLoading(false));
    fetchConsultLetter(supabase)
      .then((letter) => {
        setConsentFormUrl(letter?.file_url || null);
        setConsentFormName(letter?.file_name || null);
      })
      .catch(() => {
        setConsentFormUrl(null);
        setConsentFormName(null);
      });
    Promise.all([
      fetchPublicSampleCertificates(supabase).catch(() => [] as SiteSampleCertificate[]),
      fetchPublicExpertTeam(supabase).catch(() => [] as SiteExpertMember[]),
      fetchPublicMous(supabase).catch(() => [] as SiteMou[]),
      fetchPublicOfflinePrograms(supabase).catch(() => [] as SiteOfflineProgram[]),
      fetchPublicTestimonials(supabase).catch(() => [] as SiteTestimonial[]),
    ]).then(([certs, team, mouRows, offline, reviews]) => {
      setSampleCerts(certs);
      setExpertTeam(team);
      setMous(mouRows);
      setOfflinePrograms(offline);
      setTestimonials(reviews);
    });
  }, []);

  // Scroll to hash targets (e.g. /#gallery) after nav or refresh
  useEffect(() => {
    const hash = (location.hash || "").replace(/^#/, "");
    if (!hash) return;
    const t = window.setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [
    location.hash,
    galleryImages.length,
    galleryLoading,
    sampleCerts.length,
    consentFormUrl,
    expertTeam.length,
    mous.length,
    offlinePrograms.length,
    testimonials.length,
  ]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const trustedStripRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isTrustedPaused, setIsTrustedPaused] = useState(false);

  useEffect(() => {
    if (!scrollRef.current || isPaused) return;

    const scrollContainer = scrollRef.current;
    const interval = setInterval(() => {
      if (scrollContainer.scrollLeft + scrollContainer.clientWidth >= scrollContainer.scrollWidth) {
        scrollContainer.scrollLeft = 0;
      } else {
        scrollContainer.scrollLeft += 1;
      }
    }, 30);

    return () => clearInterval(interval);
  }, [isPaused, unis]);

  useEffect(() => {
    if (!trustedStripRef.current || isTrustedPaused || unis.length === 0) return;

    const scrollContainer = trustedStripRef.current;
    const half = scrollContainer.scrollWidth / 2;
    const interval = setInterval(() => {
      if (scrollContainer.scrollLeft >= half) {
        scrollContainer.scrollLeft = 0;
      } else {
        scrollContainer.scrollLeft += 1;
      }
    }, 30);

    return () => clearInterval(interval);
  }, [isTrustedPaused, unis]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !counted) {
          setCounted(true);
          const duration = 2000;
          const frames = 60;
          const interval = duration / frames;

          let frame = 0;
          const timer = setInterval(() => {
            frame++;
            const progress = frame / frames;
            setStats({
              students: Math.floor(progress * 70000),
              unis: Math.floor(progress * 17),
              domains: Math.floor(progress * 50),
              certs: Math.floor(progress * 68000),
            });
            if (frame === frames) clearInterval(timer);
          }, interval);
        }
      },
      { threshold: 0.3 }
    );

    if (statsRef.current) observer.observe(statsRef.current);
    return () => observer.disconnect();
  }, [counted]);

  useEffect(() => {
    const root = pageRef.current;
    if (!root) return;
    const nodes = root.querySelectorAll(".reveal-on-scroll:not(.is-visible)");
    if (!nodes.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -20px 0px" }
    );
    nodes.forEach((n) => io.observe(n));
    // Fallback: if already in viewport (or observer misses), reveal shortly after mount
    const t = window.setTimeout(() => {
      nodes.forEach((n) => {
        const rect = (n as HTMLElement).getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          n.classList.add("is-visible");
        }
      });
    }, 400);
    return () => {
      window.clearTimeout(t);
      io.disconnect();
    };
  }, [
    galleryImages.length,
    galleryLoading,
    consentFormUrl,
    sampleCerts.length,
    expertTeam.length,
    mous.length,
    offlinePrograms.length,
    testimonials.length,
  ]);

  const faqs = [
    {
      cat: "Payments",
      q: "What is the registration fee?",
      a: "The registration fee is a one-time charge for the entire internship duration. There are no hidden charges or extra costs for certification.",
    },
    {
      cat: "Payments",
      q: "What is the refund policy?",
      a: "We offer a full refund within 24 hours of payment if you have not attended any classes. After 24 hours, the fee is non-refundable.",
    },
    {
      cat: "Academics",
      q: "Is the certificate valid / recognised?",
      a: "Yes, Apna Intern is a government authorized and certified company. Our certificates are recognized by universities as per UGC Guidelines 2023. We are MCA Registered, MSME Certified, and ISO Certified.",
    },
    {
      cat: "Academics",
      q: "How long does the internship take?",
      a: "The internship is structured across 4 to 8 weeks. Classes are held online 3–4 times a week and are also available as recordings.",
    },
    {
      cat: "Academics",
      q: "Is the internship online or offline?",
      a: "Completely online. Classes are conducted via YouTube Live, Google Meet or Zoom. You just need a smartphone or laptop with internet access.",
    },
    {
      cat: "Verification",
      q: "How do I verify my certificate?",
      a: "Visit the verify page and enter your certificate number or scan the QR code on your certificate. It takes you to the verification page automatically.",
    },
    {
      cat: "Academics",
      q: "Do I earn academic credits?",
      a: "Yes. The programme is a 120-hour, 4-credit internship aligned with UGC and NEP-2020 guidelines, designed for undergraduate students across partner universities in India.",
    },
    {
      cat: "Payments",
      q: "When do I receive my offer letter?",
      a: "After successful payment, your offer letter is generated instantly and available in your student dashboard. You can download it anytime.",
    },
    {
      cat: "Verification",
      q: "Can employers verify my certificate without logging in?",
      a: "Yes. Anyone can verify a certificate on the public Verify page using the certificate ID or QR code — no account required.",
    },
    {
      cat: "Academics",
      q: "Which degrees are eligible?",
      a: "B.A., B.Sc., B.Com., BBA, BCA and other UG streams at partner colleges. Domains are matched to your academic background during registration.",
    },
  ];

  const whyFeatures = [
    {
      i: <Zap className="size-6 text-primary" />,
      t: "UGC & NEP-2020 Compliant",
      d: "Our curriculum is structured under CBCS / CCFUP guidelines with 4 academic credits, recognised across India.",
    },
    {
      i: <Clock className="size-6 text-emerald-600" />,
      t: "120-Hour Programme",
      d: "Structured training with live classes, notes, and quizzes — all tracked in your personal student dashboard.",
    },
    {
      i: <ShieldCheck className="size-6 text-amber-600" />,
      t: "Verifiable Certificates",
      d: "Every certificate has a unique ID and QR code. Employers can verify it instantly on our portal — no fakes possible.",
    },
    {
      i: <Target className="size-6 text-sky-600" />,
      t: "Affordable Fee",
      d: "Transparent pricing (₹400-₹500) with special discounts for BNMU, Purnea University, LNMU, and Magadh University students.",
    },
    {
      i: <Smartphone className="size-6 text-rose-600" />,
      t: "100% Online & Flexible",
      d: "Attend classes on Google Meet from your phone. Access recordings and study materials anytime, anywhere.",
    },
    {
      i: <UserCheck className="size-6 text-indigo-600" />,
      t: "Dedicated Mentor Support",
      d: "Assigned domain mentors guide you via WhatsApp and live sessions. Get feedback on all your assessments.",
    },
  ];

  const howSteps = [
    { n: "1", t: "Register", d: "Fill form with academic details and pick your domain." },
    { n: "2", t: "Pay & Offer", d: "Pay registration fee and get your offer letter instantly." },
    { n: "3", t: "Train", d: "Attend live classes and complete online quizzes." },
    { n: "4", t: "Get Certificate", d: "Download your verifiable digital certificate." },
  ];

  const programmes = [
    { name: "B.A.", icon: <Palette className="size-7 text-primary" />, hint: "15+ Domains" },
    { name: "B.Sc.", icon: <BookOpen className="size-7 text-primary" />, hint: "15+ Domains" },
    { name: "B.Com.", icon: <BarChart3 className="size-7 text-primary" />, hint: "15+ Domains" },
  ];

  const outcomes = [
    {
      quote:
        "The live classes and dashboard quizzes kept me on track for credits — and the QR certificate was easy for my college to accept.",
      role: "B.A. student · Digital Marketing track",
    },
    {
      quote:
        "Offer letter after payment and mentor support on WhatsApp made the 120-hour programme manageable alongside semester exams.",
      role: "B.Com. student · Accounting & Tally track",
    },
    {
      quote:
        "Employers could verify my certificate online in seconds. That transparency is why I chose Apna Intern.",
      role: "B.Sc. student · Data / Research track",
    },
  ];

  const statCards = [
    { l: "Students Trained", v: stats.students, s: "+" },
    { l: "Partner Universities", v: stats.unis, s: "" },
    { l: "Domains", v: stats.domains, s: "+" },
    { l: "Certificates Issued", v: stats.certs, s: "+" },
  ];

  return (
    <div
      ref={pageRef}
      className="min-h-screen bg-[#F7FAFD] font-sans text-slate-900 selection:bg-primary selection:text-white"
    >
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Announcement */}
      <div className="bg-primary py-2.5 px-4 text-center text-[13.5px] font-medium text-white">
        <b className="font-semibold">Registrations Open for 2023–2027 Batch</b> &nbsp;
        <Link to="/register" className="font-semibold text-blue-100 underline transition-colors hover:text-white">
          Register Now →
        </Link>
      </div>

      <SiteNav />
      <NoticePopup page="home" />

      {/* Hero */}
      <section
        id="hero"
        className="relative overflow-hidden pb-12 pt-16 md:pb-20 md:pt-24 bg-slate-950"
      >
        {/* Dynamic Background with Grid and Glowing Orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20" />
          <div className="absolute -top-[30%] -left-[10%] h-[70%] w-[50%] rounded-full bg-blue-600/30 blur-[120px] mix-blend-screen" />
          <div className="absolute top-[20%] -right-[10%] h-[70%] w-[50%] rounded-full bg-emerald-500/20 blur-[120px] mix-blend-screen" />
          <div className="absolute -bottom-[30%] left-[20%] h-[60%] w-[60%] rounded-full bg-indigo-600/20 blur-[120px] mix-blend-screen" />
        </div>

        <div className="relative mx-auto grid max-w-[1200px] items-center gap-16 px-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="animate-fade-in-up relative z-10 text-center lg:text-left">
            
            {/* Pan India Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-1.5 text-sm font-semibold text-blue-200 backdrop-blur-md mb-6 shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:bg-blue-500/20 transition-colors">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              Empowering Students Pan India 🇮🇳
            </div>

            <h1 className="font-display mb-6 text-[40px] font-extrabold leading-[1.1] tracking-tight text-white md:text-[56px] drop-shadow-lg">
              India's Premier <br className="hidden lg:block"/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-emerald-400 animate-gradient-x">
                Verified Internship
              </span> Program
            </h1>
            
            <p className="mb-8 max-w-[50ch] text-[17px] leading-relaxed text-slate-300 mx-auto lg:mx-0">
              Skill-based training and industry internships complying with AICTE and UGC guidelines. 
              Join thousands of students from <span className="font-bold text-white">every corner of India</span> building their careers with us.
            </p>
            
            <div className="mb-10 flex flex-wrap justify-center lg:justify-start gap-4">
              <Button
                size="lg"
                className="btn-press group relative overflow-hidden rounded-xl bg-blue-600 px-8 py-4 text-[16px] font-bold text-white shadow-[0_0_40px_rgba(37,99,235,0.4)] transition-all duration-300 hover:scale-105 hover:bg-blue-500 hover:shadow-[0_0_60px_rgba(37,99,235,0.6)]"
                onClick={() => navigate("/register")}
              >
                <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.2)_50%,transparent_75%)] bg-[length:250%_250%,100%_100%] bg-[position:200%_0,0_0] bg-no-repeat transition-[background-position_0s_ease] hover:bg-[position:-200%_0,0_0] hover:duration-[1500ms]" />
                <span className="relative flex items-center gap-2">
                  Start Your Journey <ArrowRight className="size-4 group-hover:translate-x-1 transition-transform" />
                </span>
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="btn-press h-auto rounded-xl border-slate-700 bg-slate-800/50 px-8 py-4 text-[16px] font-semibold text-slate-200 backdrop-blur-sm hover:bg-slate-700/80 hover:text-white transition-all hover:scale-105 hover:border-slate-500"
                onClick={() => navigate("/verify")}
              >
                Verify Certificate
              </Button>
            </div>
            
            <div className="flex flex-wrap justify-center lg:justify-start gap-3">
              {["MSME Certified", "AICTE Compliant", "UGC Compliant", "ISO 9001:2015"].map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/50 bg-slate-800/80 px-3 py-1 text-[12px] font-semibold text-slate-300 shadow-sm backdrop-blur-sm hover:border-blue-500/50 transition-colors"
                >
                  <CheckCircle2 className="size-3 text-blue-400" />
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[500px] lg:mx-0 lg:ml-auto">
            {/* Interactive Image Container */}
            <div className="absolute -inset-6 rounded-[40px] bg-gradient-to-tr from-blue-500/20 via-emerald-500/20 to-indigo-500/20 blur-2xl animate-spin-slow" aria-hidden />
            
            <div className="group relative z-10 overflow-hidden rounded-[32px] shadow-[0_30px_60px_rgba(0,0,0,0.4)] ring-1 ring-white/10 transition-transform duration-700 hover:-translate-y-3 hover:shadow-[0_40px_80px_rgba(37,99,235,0.3)]">
              <img
                src="/student_real.png"
                alt="Student Intern"
                className="aspect-[4/4.5] w-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/20 to-transparent" />
              
              {/* Floating location badges */}
              <div className="absolute bottom-6 left-6 animate-bounce-slow flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-4 py-2 backdrop-blur-md shadow-xl">
                <div className="flex size-8 items-center justify-center rounded-full bg-blue-500/20">
                  <span className="text-xl">📍</span>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Active Interns</div>
                  <div className="text-sm font-black text-white">New Delhi</div>
                </div>
              </div>
              
              <div className="absolute top-8 right-6 animate-float flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-4 py-2 backdrop-blur-md shadow-xl" style={{ animationDelay: '1.5s' }}>
                <div className="flex size-8 items-center justify-center rounded-full bg-emerald-500/20">
                  <span className="text-xl">🎓</span>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-300">University</div>
                  <div className="text-sm font-black text-white">Karnataka</div>
                </div>
              </div>
              
              <div className="absolute bottom-32 right-[-10px] animate-pulse-slow flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 backdrop-blur-md shadow-xl scale-90" style={{ animationDelay: '0.7s' }}>
                <span className="text-lg">📍</span>
                <span className="text-xs font-bold text-white">Maharashtra</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Decorative Wave Divider at the bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-white" style={{ clipPath: "polygon(0 100%, 100% 100%, 100% 0, 0 100%)" }} />
      </section>

      {/* Logo strip — single row marquee */}
      <div className="border-y border-slate-200/80 bg-white py-10">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-8 px-8">
          <h3 className="text-center font-display text-xl font-bold tracking-tight text-slate-800">
            Trusted By Partner Universities
          </h3>
          <div className="relative w-full overflow-hidden">
            <div
              ref={trustedStripRef}
              onMouseEnter={() => setIsTrustedPaused(true)}
              onMouseLeave={() => setIsTrustedPaused(false)}
              className="no-scrollbar flex flex-nowrap items-center gap-10 overflow-x-auto"
            >
              {(unis.length > 0 ? [...unis, ...unis] : [{ id: "loading", name: "Loading universities…" }]).map(
                (u, i) => (
                  <span
                    key={`${u.id}-${i}`}
                    className="shrink-0 whitespace-nowrap text-[16px] font-bold text-slate-400 hover:text-primary transition-colors cursor-pointer"
                  >
                    {u.name}
                  </span>
                )
              )}
            </div>
            <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-white to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-white to-transparent" />
          </div>
        </div>
      </div>

      {/* Stats */}
      <section className="relative bg-slate-950 py-16 text-white" ref={statsRef}>
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(circle at 25% 50%, hsl(208 80% 45% / 0.5), transparent 50%), radial-gradient(circle at 75% 30%, hsl(208 80% 55% / 0.35), transparent 50%), linear-gradient(135deg, rgba(15,23,42,1) 0%, rgba(30,41,59,1) 100%)",
          }}
          aria-hidden
        />
        <div className="relative mx-auto grid max-w-[1200px] grid-cols-2 gap-8 px-8 md:grid-cols-4 md:gap-6">
          {statCards.map((st, i) => (
            <div key={i} className="text-center md:text-left">
              <div className="font-display text-[36px] font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-300 md:text-[42px] drop-shadow-sm">
                {st.v.toLocaleString()}
                {st.s}
              </div>
              <div className="mt-1 text-[12px] font-semibold uppercase tracking-wider text-slate-400">
                {st.l}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Why */}
      <section id="about" className="py-16 md:py-20">
        <div className="mx-auto max-w-[1200px] px-8">
          <SectionHead
            pill="Why Choose Us"
            title="Designed for India's UG Students"
            description="We understand the local university ecosystem and have built a programme that truly fits your academic calendar and needs."
          />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {whyFeatures.map((f, i) => (
              <Card
                key={i}
                className="group reveal-on-scroll rounded-2xl border-slate-200/80 bg-white p-7 shadow-soft transition-all duration-300 hover:-translate-y-2 hover:shadow-xl"
                style={{ transitionDelay: `${i * 40}ms` }}
              >
                <div className="mb-5 flex size-14 items-center justify-center rounded-xl bg-primary/5 ring-1 ring-primary/10 transition-transform duration-300 group-hover:scale-110">
                  {f.i}
                </div>
                <h3 className="font-display mb-2 text-base font-bold text-slate-900">{f.t}</h3>
                <p className="text-[13.5px] leading-relaxed text-slate-500">{f.d}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <HomeCoursesSections />

      {/* Programs */}
      <section id="programs" className="bg-white py-16 md:py-20">
        <div className="mx-auto max-w-[1200px] px-8 text-center">
          <SectionHead pill="Programmes" title="Available for All UG Streams" />
          <div className="mx-auto grid max-w-4xl grid-cols-2 gap-5 lg:grid-cols-3">
            {programmes.map((p, i) => (
              <Card
                key={p.name}
                className={`group reveal-on-scroll rounded-2xl border p-7 shadow-soft transition-all duration-300 hover:-translate-y-2 hover:shadow-xl ${i === 1
                    ? "border-primary/35 bg-primary/[0.04] ring-1 ring-primary/20"
                    : "border-slate-200/80 bg-white"
                  }`}
              >
                <div className="mb-4 flex size-14 items-center justify-center rounded-xl bg-slate-50 mx-auto transition-transform duration-300 group-hover:scale-110">
                  {p.icon}
                </div>
                <h3 className="font-display mb-2 text-xl font-extrabold text-slate-900">{p.name}</h3>
                <p className="mb-5 text-[11px] font-bold uppercase tracking-wider text-slate-400">{p.hint}</p>
                <Button
                  variant={i === 1 ? "default" : "outline"}
                  size="sm"
                  className="btn-press w-full rounded-xl"
                  onClick={() => setDomainsStream(p.name as UgStreamKey)}
                >
                  View Domains
                </Button>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <HomeGallerySection
        galleryImages={galleryImages}
        galleryLoading={galleryLoading}
        offlinePrograms={offlinePrograms}
      />

      {/* Global consent form template (admin-uploaded; separate from per-student signed consent) */}
      <section id="consent-form" className="scroll-mt-24 py-16 md:py-20">
        <div className="mx-auto max-w-[1200px] px-8">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 rounded-2xl border border-slate-200/80 bg-white p-8 text-center shadow-soft sm:flex-row sm:text-left">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <FileText className="size-7 text-primary" />
            </div>
            <div className="flex-1">
              <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-primary">
                Official template
              </div>
              <h3 className="font-display mb-2 text-xl font-extrabold text-slate-900">
                Consent Letter Form
              </h3>
              <p className="text-sm leading-relaxed text-slate-500">
                View or download the fixed consent letter format. Fill and sign it, then upload your
                completed copy from your student dashboard when required.
              </p>
              {consentFormName ? (
                <p className="mt-2 text-xs font-medium text-slate-400">{consentFormName}</p>
              ) : null}
            </div>
            {consentFormUrl ? (
              <div className="flex shrink-0 flex-col gap-2 sm:items-stretch">
                <Button asChild className="btn-press rounded-xl" size="lg">
                  <a href={consentFormUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 size-4" /> View
                  </a>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  size="lg"
                  onClick={() =>
                    void downloadStorageFile(
                      consentFormUrl,
                      consentFormName?.replace(/\s+/g, "_") || "ApnaIntern_Consent_Form.pdf"
                    )
                  }
                >
                  <Download className="mr-2 size-4" /> Download
                </Button>
              </div>
            ) : (
              <Button disabled variant="outline" className="shrink-0 rounded-xl" size="lg">
                Coming soon
              </Button>
            )}
          </div>
        </div>
      </section>

      <HomeSampleCertificatesSection items={sampleCerts} />

      {/* How It Works */}
      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-[1200px] px-8">
          <SectionHead
            pill="How it works"
            title="How It Works — 4 Simple Steps"
            description="From registration to a verified certificate in easy steps."
          />
          <div className="relative grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div
              className="pointer-events-none absolute left-[12%] right-[12%] top-[2.15rem] hidden h-0.5 bg-gradient-to-r from-primary/40 via-primary/20 to-primary/40 lg:block"
              aria-hidden
            />
            {howSteps.map((s, i) => (
              <div
                key={i}
                className="reveal-on-scroll relative rounded-2xl border border-slate-200/80 bg-white p-6 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elegant"
              >
                <div className="mb-4 flex size-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-white shadow-sm">
                  {s.n}
                </div>
                <h3 className="font-display mb-2 text-base font-bold text-slate-900">{s.t}</h3>
                <p className="text-[13.5px] leading-relaxed text-slate-500">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust & credibility */}
      <section id="trust" className="bg-slate-50 py-16 md:py-20">
        <div className="mx-auto max-w-[1200px] px-8">
          <SectionHead
            pill="Trust & Credibility"
            title="Government-Recognised. Instantly Verifiable."
            description="Every certificate carries a unique ID and QR code. Institutions and employers can confirm authenticity on our public verify portal."
          />
          <div className="reveal-on-scroll mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {CERT_BADGES.map((b) => (
              <div
                key={b.t}
                className="flex flex-col items-center rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft"
              >
                <div className="mb-3 flex size-14 items-center justify-center rounded-xl bg-slate-50 p-2">
                  <img
                    src={`/certifications/${b.img}`}
                    alt={b.t}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <span className="text-center text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  {b.t}
                </span>
              </div>
            ))}
          </div>
          <div className="reveal-on-scroll mx-auto flex max-w-2xl flex-col items-center gap-4 rounded-2xl border border-primary/20 bg-white p-6 text-center shadow-soft sm:flex-row sm:text-left">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <QrCode className="size-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-display mb-1 text-base font-bold text-slate-900">How verification works</h3>
              <p className="text-sm leading-relaxed text-slate-500">
                Enter the certificate number or scan the QR on the printed certificate — results appear
                instantly on the public verify page.
              </p>
            </div>
            <Button
              variant="outline"
              className="btn-press shrink-0 rounded-xl border-primary/25 text-primary"
              onClick={() => navigate("/verify")}
            >
              Verify now
            </Button>
          </div>
        </div>
      </section>

      <HomeExpertTeamSection members={expertTeam} />

      <HomeMouSection mous={mous} />

      {/* Student outcomes */}
      <section id="outcomes" className="bg-white py-16 md:py-20">
        <div className="mx-auto max-w-[1200px] px-8">
          <SectionHead
            pill="Student Outcomes"
            title="What Students Get From the Programme"
            description="Outcomes framed from typical programme experiences — live training, credit-ready certificates, and employer-ready verification."
          />
          <div className="grid gap-5 md:grid-cols-3">
            {outcomes.map((o, i) => (
              <div
                key={i}
                className="reveal-on-scroll rounded-2xl border border-slate-200/80 bg-white/60 backdrop-blur-md p-7 shadow-soft hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 group"
              >
                <Quote className="mb-4 size-8 text-primary/40 transition-colors duration-300 group-hover:text-primary/70" />
                <p className="mb-5 text-[14.5px] leading-relaxed text-slate-700">&ldquo;{o.quote}&rdquo;</p>
                <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">{o.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <HomeTestimonialsSection testimonials={testimonials} />

      {/* Universities */}
      <section id="universities" className="py-16 md:py-20">
        <div className="mx-auto max-w-[1200px] px-8">
          <SectionHead
            pill="Universities"
            title="11+ Universities Covered"
            description="We are recognised by and partner with top universities across India to deliver academic credits."
          />
          <div className="relative group">
            <div
              ref={scrollRef}
              onMouseEnter={() => setIsPaused(true)}
              onMouseLeave={() => setIsPaused(false)}
              className="no-scrollbar flex cursor-grab gap-5 overflow-x-auto pb-8 active:cursor-grabbing"
            >
              {unis.length > 0 ? (
                unis.map((u) => {
                  const abbr =
                    u.name.match(/\((.*?)\)/)?.[1] || u.name.split(" ")[0].substring(0, 4).toUpperCase();
                  return (
                    <div
                      key={u.id}
                      className="w-[300px] flex-shrink-0 rounded-2xl border border-slate-200/80 bg-white p-6 text-left shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elegant"
                    >
                      <div className="mb-4 flex items-center gap-4">
                        {u.logo_url ? (
                          <img
                            src={resolveStorageUrl(u.logo_url) || u.logo_url}
                            alt={u.name}
                            className="size-14 rounded-xl bg-slate-50 object-contain p-1.5"
                          />
                        ) : (
                          <div className="flex size-14 items-center justify-center rounded-xl bg-primary/10 text-xl font-black text-primary">
                            {abbr}
                          </div>
                        )}
                      </div>
                      <p className="mb-2 line-clamp-2 h-12 text-[15px] font-bold leading-tight text-slate-800">
                        {u.name}
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          Partner University
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="w-full py-10 italic text-slate-400">Loading universities...</div>
              )}
            </div>
            <div className="pointer-events-none absolute bottom-8 left-0 top-0 w-16 bg-gradient-to-r from-[#F7FAFD] to-transparent" />
            <div className="pointer-events-none absolute bottom-8 right-0 top-0 w-16 bg-gradient-to-l from-[#F7FAFD] to-transparent" />
          </div>
          <div className="flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <ArrowRight className="size-3 animate-pulse" /> Scroll to explore
          </div>
          <p className="mt-10 flex items-center justify-center gap-2 text-sm text-slate-400">
            <ShieldCheck className="size-4 text-primary" /> UGC Internship Guidelines 2023 &amp; NEP-2020
            Compliant
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white py-16 md:py-20" id="faq">
        <div className="mx-auto max-w-[1200px] px-8">
          <SectionHead pill="Support" title="Frequently Asked Questions" />
          <div className="reveal-on-scroll mx-auto max-w-[760px]">
            {faqs.map((f, i) => (
              <details key={i} className="group border-b border-slate-200 py-5" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-[15.5px] font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                  <span>
                    <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-primary/80">
                      {f.cat}
                    </span>
                    {f.q}
                  </span>
                  <span className="mt-1 shrink-0 text-xl font-normal text-primary group-open:hidden">+</span>
                  <span className="mt-1 hidden shrink-0 text-xl font-normal text-primary group-open:inline">
                    –
                  </span>
                </summary>
                <p className="mt-3 max-w-[65ch] text-sm leading-relaxed text-slate-500">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-[1200px] px-8">
          <div className="reveal-on-scroll overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-900 via-slate-900 to-primary px-8 py-14 text-center text-white md:px-14">
            <h2 className="font-display mb-3 text-[28px] font-bold text-white md:text-[32px]">
              Ready to Start Your Internship?
            </h2>
            <p className="mx-auto mb-8 max-w-2xl text-[15px] text-blue-100/90">
              Join 70,000+ students who have already earned their verified internship certificate with
              Apna Intern.
            </p>
            <div className="mb-10 flex flex-wrap items-center justify-center gap-3">
              <Button
                size="lg"
                variant="accent"
                className="btn-press h-auto rounded-xl px-8 py-3.5 text-[15px] font-semibold"
                onClick={() => navigate("/register")}
              >
                Register Now <ArrowRight className="ml-2 size-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="btn-press h-auto rounded-xl border-white/30 bg-transparent px-8 py-3.5 text-[15px] font-semibold text-white hover:bg-white/10"
                onClick={() => navigate("/verify")}
              >
                Verify Certificate
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
              {CERT_BADGES.map((b) => (
                <div
                  key={b.t}
                  className="flex flex-col items-center justify-center rounded-xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm transition-transform hover:scale-[1.03]"
                >
                  <div className="mb-2.5 flex size-11 items-center justify-center rounded-lg bg-white p-1.5 shadow-sm">
                    <img
                      src={`/certifications/${b.img}`}
                      alt={b.t}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <span className="text-center text-[10px] font-bold uppercase leading-tight tracking-wider text-blue-100">
                    {b.t}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />

      <Dialog open={Boolean(domainsStream)} onOpenChange={(open) => !open && setDomainsStream(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{domainsStream} Domains</DialogTitle>
            <DialogDescription>
              Internship domains available for {domainsStream} students. Pick one during registration.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[55vh] pr-3">
            {streamDomains.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">No domains listed for this stream yet.</p>
            ) : (
              <ul className="space-y-2 pb-2">
                {streamDomains.map((domain) => (
                  <li
                    key={domain}
                    className="rounded-xl border border-slate-200/80 bg-slate-50 px-3.5 py-2.5 text-left text-sm font-medium text-slate-800"
                  >
                    {domain}
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDomainsStream(null)}>
              Close
            </Button>
            <Button
              onClick={() => {
                setDomainsStream(null);
                navigate("/register");
              }}
            >
              Register now
              <ArrowRight className="ml-2 size-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
