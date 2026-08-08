// Deploy refresh marker — no functional change (2026-07-08).
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState, useRef } from "react";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
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
import { HomeHeroSection } from "@/components/home/HomeHeroSection";
import { HomeStatsSection, HomeBentoFeatures } from "@/components/home/HomeFeaturesAndStats";
import { HomeTrustedByStudents } from "@/components/home/HomeTrustedByStudents";
import { HomePartnersSection } from "@/components/home/HomePartnersSection";
import { HomeInternshipCategoriesSection } from "@/components/home/HomeInternshipCategoriesSection";
import { HomeTopRecruitersSection } from "@/components/home/HomeTopRecruitersSection";
import { HomeProgramsSection } from "@/components/home/HomeProgramsSection";
import { HomeHowItWorks } from "@/components/home/HomeHowItWorks";
import { HomeTrustSection } from "@/components/home/HomeTrustSection";
import { HomeOutcomesSection } from "@/components/home/HomeOutcomesSection";
import { HomeUniversitiesSection } from "@/components/home/HomeUniversitiesSection";
import { HomeFaqSection } from "@/components/home/HomeFaqSection";
import { HomeFinalCta } from "@/components/home/HomeFinalCta";
import { HomeCoursesSections } from "@/components/courses/HomeCoursesSections";
import {
  getDomainsForUgStream,
  type UgStreamKey,
} from "@/lib/subjectDomainMap";
import {
  ArrowRight,
  Zap,
  Clock,
  ShieldCheck,
  Target,
  Smartphone,
  UserCheck,
  Download,
  ExternalLink,
  FileText,
} from "lucide-react";

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const statsRef = useRef<HTMLDivElement>(null);
  const trustedRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
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
  const [isPaused, setIsPaused] = useState(false);

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
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !counted) {
          setCounted(true);
        }
      },
      { threshold: 0.15 }
    );

    if (statsRef.current) observer.observe(statsRef.current);
    if (trustedRef.current) observer.observe(trustedRef.current);
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
    { l: "Students Trained", v: 70000, s: "+" },
    { l: "Partner Universities", v: 17, s: "" },
    { l: "Domains", v: 50, s: "+" },
    { l: "Certificates Issued", v: 68000, s: "+" },
  ];

  const goRegister = () => navigate("/register");
  const goVerify = () => navigate("/verify");

  return (
    <div
      ref={pageRef}
      className="min-h-screen bg-[#f8fafc] font-sans text-slate-900 selection:bg-primary selection:text-white"
    >
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className="border-b border-sky-900/10 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 py-2.5 px-4 text-center text-sm text-slate-200">
        <span className="font-medium">
          Registrations open for 2023–2027 batch —
        </span>{" "}
        <Link
          to="/register"
          className="font-semibold text-sky-300 underline-offset-4 transition-colors hover:text-white hover:underline"
        >
          Reserve your seat
        </Link>
      </div>

      <SiteNav />
      <NoticePopup page="home" />

      <HomeHeroSection onRegister={goRegister} onVerify={goVerify} />

      <HomeTrustedByStudents studentCount={70000} counted={counted} sectionRef={trustedRef} />

      <HomeStatsSection statsRef={statsRef} statCards={statCards} active={counted} />

      <HomeBentoFeatures features={whyFeatures} />

      <HomeInternshipCategoriesSection />

      <HomeCoursesSections />

      <HomeProgramsSection onSelectStream={setDomainsStream} />

      <HomeHowItWorks steps={howSteps} onRegister={goRegister} />

      <HomePartnersSection universities={unis} />

      <HomeTopRecruitersSection />

      <HomeGallerySection
        galleryImages={galleryImages}
        galleryLoading={galleryLoading}
        offlinePrograms={offlinePrograms}
      />

      {/* Consent form template */}
      <section id="consent-form" className="scroll-mt-24 py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-6 lg:px-8">
          <div className="reveal-on-scroll flex flex-col items-center gap-6 rounded-3xl border border-slate-200/80 bg-white p-8 shadow-soft sm:flex-row sm:text-left">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-sky-50">
              <FileText className="size-7 text-sky-600" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">
                Official template
              </p>
              <h3 className="font-display mt-1 text-xl font-extrabold text-slate-900">
                Consent letter form
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                View or download the fixed consent letter format. Fill and sign it, then upload your
                completed copy from your student dashboard when required.
              </p>
              {consentFormName ? (
                <p className="mt-2 text-xs font-medium text-slate-400">{consentFormName}</p>
              ) : null}
            </div>
            {consentFormUrl ? (
              <div className="flex shrink-0 flex-col gap-2">
                <Button asChild className="btn-press rounded-full" size="lg">
                  <a href={consentFormUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 size-4" /> View
                  </a>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
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
              <Button disabled variant="outline" className="shrink-0 rounded-full" size="lg">
                Coming soon
              </Button>
            )}
          </div>
        </div>
      </section>

      <HomeSampleCertificatesSection items={sampleCerts} />

      <HomeTrustSection onVerify={goVerify} />

      <HomeExpertTeamSection members={expertTeam} />

      <HomeMouSection mous={mous} />

      <HomeOutcomesSection outcomes={outcomes} />

      <HomeTestimonialsSection testimonials={testimonials} />

      <HomeUniversitiesSection
        universities={unis}
        scrollRef={scrollRef}
        paused={isPaused}
        onPauseChange={setIsPaused}
      />

      <HomeFaqSection faqs={faqs} />

      <HomeFinalCta onRegister={goRegister} onVerify={goVerify} />

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
