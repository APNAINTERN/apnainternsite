import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Award,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Linkedin,
  Loader2,
  Minus,
  Plus,
  Quote,
  RotateCcw,
  Star,
  Twitter,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  isPdfMime,
  type SiteExpertMember,
  type SiteMou,
  type SiteOfflineProgram,
  type SiteSampleCertificate,
  type SiteTestimonial,
} from "@/lib/siteHomeCmsApi";
import { cn } from "@/lib/utils";

type GalleryImage = {
  id: string;
  title?: string | null;
  caption?: string | null;
  image_url: string;
};

const SectionHead = ({
  pill,
  title,
  description,
}: {
  pill?: string;
  title: string;
  description?: string;
}) => (
  <div className="mx-auto mb-11 max-w-[640px] text-center">
    {pill ? (
      <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3.5 py-1.5 text-[13px] font-semibold text-primary">
        {pill}
      </span>
    ) : null}
    <h2 className="font-display mb-3 text-[28px] font-bold tracking-tight text-slate-900 md:text-[32px]">
      {title}
    </h2>
    {description ? (
      <p className="text-[15px] leading-relaxed text-slate-500">{description}</p>
    ) : null}
  </div>
);

function StarRating({ rating, className }: { rating: number; className?: string }) {
  const value = Math.min(5, Math.max(0, Math.round(rating)));
  return (
    <div className={cn("flex items-center gap-0.5", className)} aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            "size-4",
            i < value ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200"
          )}
        />
      ))}
    </div>
  );
}

type GalleryLightboxProps = {
  images: GalleryImage[];
  initialIndex?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function GalleryLightbox({ images, initialIndex = 0, open, onOpenChange }: GalleryLightboxProps) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  const current = images[index];
  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  const goPrev = useCallback(() => {
    if (hasPrev) setIndex((i) => i - 1);
  }, [hasPrev]);

  const goNext = useCallback(() => {
    if (hasNext) setIndex((i) => i + 1);
  }, [hasNext]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, goPrev, goNext]);

  if (!current) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl border-0 bg-transparent p-0 shadow-none sm:max-w-5xl">
        <div className="relative overflow-hidden rounded-2xl border bg-white shadow-2xl">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-3 top-3 z-10 rounded-full bg-white/90 hover:bg-white"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </Button>

          <div className="flex min-h-[50vh] max-h-[75vh] items-center justify-center bg-slate-100 p-4 md:p-8">
            <img
              src={current.image_url}
              alt={current.title || "Gallery image"}
              className="max-h-[65vh] max-w-full object-contain"
            />
          </div>

          {(current.title || current.caption) && (
            <div className="border-t px-6 py-4 text-center">
              {current.title ? (
                <DialogTitle className="font-display text-lg font-bold text-slate-900">
                  {current.title}
                </DialogTitle>
              ) : null}
              {current.caption ? (
                <DialogDescription className="mt-1 text-sm text-slate-500">
                  {current.caption}
                </DialogDescription>
              ) : null}
            </div>
          )}

          {images.length > 1 ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90"
                disabled={!hasPrev}
                onClick={goPrev}
              >
                <ChevronLeft className="size-5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90"
                disabled={!hasNext}
                onClick={goNext}
              >
                <ChevronRight className="size-5" />
              </Button>
              <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                {index + 1} / {images.length}
              </p>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type FullImageSlide = {
  id: string;
  imageUrl: string;
  title?: string | null;
  subtitle?: string | null;
};

function FullImageBannerSlider({
  slides,
  onSlideClick,
  autoMs = 4500,
  className,
}: {
  slides: FullImageSlide[];
  onSlideClick?: (index: number) => void;
  autoMs?: number;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;

  useEffect(() => {
    setIndex(0);
  }, [count]);

  useEffect(() => {
    if (paused || count < 2) return;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, autoMs);
    return () => window.clearInterval(timer);
  }, [paused, count, autoMs]);

  if (count === 0) return null;

  const go = (next: number) => setIndex(((next % count) + count) % count);
  const current = slides[index];

  return (
    <div
      className={cn("relative w-full", className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50 shadow-elegant">
        <div className="relative h-[min(78vh,760px)] w-full min-h-[360px] sm:min-h-[440px]">
          {slides.map((slide, i) => {
            const active = i === index;
            return (
              <button
                key={slide.id}
                type="button"
                aria-hidden={!active}
                tabIndex={active ? 0 : -1}
                className={cn(
                  "absolute inset-0 flex items-center justify-center p-1 transition-opacity duration-700 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:p-2",
                  active ? "z-10 opacity-100" : "pointer-events-none z-0 opacity-0"
                )}
                onClick={() => onSlideClick?.(i)}
              >
                <img
                  src={slide.imageUrl}
                  alt={slide.title || "Slide"}
                  className="h-full w-full object-contain"
                  loading={i === 0 ? "eager" : "lazy"}
                  draggable={false}
                />
              </button>
            );
          })}

          {count > 1 ? (
            <>
              <button
                type="button"
                aria-label="Previous slide"
                className="absolute left-3 top-1/2 z-20 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-slate-800 shadow-md ring-1 ring-slate-200 transition hover:bg-white sm:left-5 sm:size-12"
                onClick={(e) => {
                  e.stopPropagation();
                  go(index - 1);
                }}
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                type="button"
                aria-label="Next slide"
                className="absolute right-3 top-1/2 z-20 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-slate-800 shadow-md ring-1 ring-slate-200 transition hover:bg-white sm:right-5 sm:size-12"
                onClick={(e) => {
                  e.stopPropagation();
                  go(index + 1);
                }}
              >
                <ChevronRight className="size-6" />
              </button>
            </>
          ) : null}
        </div>

        {(current?.title || current?.subtitle) && (
          <div className="border-t border-slate-200/80 bg-white px-5 py-4 text-center sm:px-8 sm:text-left">
            {current.title ? (
              <p className="font-display text-lg font-bold text-slate-900 sm:text-xl">{current.title}</p>
            ) : null}
            {current.subtitle ? (
              <p className="mt-1 text-sm text-slate-500">{current.subtitle}</p>
            ) : null}
          </div>
        )}
      </div>

      {count > 1 ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {slides.map((slide, i) => (
            <button
              key={`dot-${slide.id}`}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === index}
              className={cn(
                "h-2.5 rounded-full transition-all",
                i === index ? "w-7 bg-primary" : "w-2.5 bg-slate-300 hover:bg-slate-400"
              )}
              onClick={() => go(i)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

type HomeGallerySectionProps = {
  galleryImages: GalleryImage[];
  galleryLoading: boolean;
  offlinePrograms?: SiteOfflineProgram[];
};

/** Combined full-image slider: offline training photos + gallery (no crop). */
export function HomeGallerySection({
  galleryImages,
  galleryLoading,
  offlinePrograms = [],
}: HomeGallerySectionProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const slides = useMemo(() => {
    const offlineSlides: FullImageSlide[] = offlinePrograms
      .filter((p) => !!p.image_url)
      .map((p) => ({
        id: `offline-${p.id}`,
        imageUrl: p.image_url as string,
        title: p.title,
        subtitle: [p.location, p.duration].filter(Boolean).join(" · ") || p.description,
      }));
    const gallerySlides: FullImageSlide[] = galleryImages.map((img) => ({
      id: `gallery-${img.id}`,
      imageUrl: img.image_url,
      title: img.title,
      subtitle: img.caption,
    }));
    return [...offlineSlides, ...gallerySlides];
  }, [offlinePrograms, galleryImages]);

  const galleryOffset = useMemo(
    () => offlinePrograms.filter((p) => !!p.image_url).length,
    [offlinePrograms]
  );

  if (galleryLoading && slides.length === 0) {
    return (
      <section id="gallery" className="scroll-mt-24 overflow-hidden bg-slate-50 py-16 md:py-20">
        <div id="offline-programs" className="scroll-mt-24" />
        <div className="mx-auto max-w-[1200px] px-8">
          <SectionHead
            pill="Moments"
            title="Training & Campus Gallery"
            description="Offline programmes and campus moments from Apna Intern — full images, auto-sliding."
          />
          <div className="flex justify-center py-16">
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        </div>
      </section>
    );
  }

  if (slides.length === 0) return null;

  return (
    <section id="gallery" className="scroll-mt-24 overflow-hidden bg-slate-50 py-16 md:py-20">
      <div id="offline-programs" className="scroll-mt-24" />
      <div className="mx-auto max-w-[1200px] px-8">
        <SectionHead
          pill="Moments"
          title="Training & Campus Gallery"
          description="Offline programmes and campus moments — every photo shown in full, auto-sliding."
        />
      </div>

      <div className="mx-auto mt-8 w-full max-w-[1400px] px-3 sm:px-6 lg:px-8">
        <FullImageBannerSlider
          slides={slides}
          onSlideClick={(i) => {
            if (i < galleryOffset) return;
            const gIdx = i - galleryOffset;
            if (gIdx >= 0 && gIdx < galleryImages.length) {
              setLightboxIndex(gIdx);
              setLightboxOpen(true);
            }
          }}
        />
      </div>

      {galleryImages.length > 0 ? (
        <GalleryLightbox
          images={galleryImages}
          initialIndex={lightboxIndex}
          open={lightboxOpen}
          onOpenChange={setLightboxOpen}
        />
      ) : null}
    </section>
  );
}

type HomeSampleCertificatesSectionProps = {
  items: SiteSampleCertificate[];
};

export function HomeSampleCertificatesSection({ items }: HomeSampleCertificatesSectionProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string>("");
  const [certZoom, setCertZoom] = useState(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  // Only show image certificates in the slider; PDFs get a card below
  const imageCerts = items.filter((c) => !isPdfMime(c.mime_type, c.file_name));
  const pdfCerts   = items.filter((c) =>  isPdfMime(c.mime_type, c.file_name));
  const hasCerts   = imageCerts.length > 0;
  const count      = imageCerts.length;

  // Auto-advance
  useEffect(() => {
    if (!hasCerts || count < 2 || isPaused) return;
    intervalRef.current = setInterval(() => {
      setActiveIdx((i) => (i + 1) % count);
    }, 4000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [hasCerts, count, isPaused]);

  const goTo = (idx: number) => {
    setActiveIdx(idx);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const prev = () => goTo((activeIdx - 1 + count) % count);
  const next = () => goTo((activeIdx + 1) % count);

  // Keyboard nav for lightbox
  useEffect(() => {
    if (!lightboxOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxOpen, activeIdx]);

  // Empty state
  if (!hasCerts && pdfCerts.length === 0) {
    return (
      <section id="sample-certificates" className="scroll-mt-24 bg-gradient-to-b from-slate-50 to-white py-16 md:py-20">
        <div className="mx-auto max-w-[1200px] px-8">
          <SectionHead
            pill="Sample Certificate"
            title="Our Official Certificate"
            description="Preview the internship certificate awarded on successful completion."
          />
          <div className="mx-auto mt-8 flex max-w-md flex-col items-center gap-5 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-soft">
            <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
              <Award className="size-8 text-primary" />
            </div>
            <p className="text-sm text-slate-500">
              Sample certificate will appear here once uploaded from Admin → Home Content.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const current = imageCerts[activeIdx] ?? null;

  return (
    <section
      id="sample-certificates"
      className="scroll-mt-24 overflow-hidden bg-gradient-to-b from-slate-50 to-white py-16 md:py-20"
    >
      <div className="mx-auto max-w-[1200px] px-4 md:px-8">
        <SectionHead
          pill="Sample Certificate"
          title="Our Official Certificate"
          description="Preview the official internship certificate awarded on programme completion."
        />

        {hasCerts && (
          <div
            className="relative mt-10"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
          >
            {/* ── Certificate Frame ── */}
            <div className="relative mx-auto max-w-3xl">
              {/* Outer glow */}
              <div className="absolute -inset-4 rounded-[32px] bg-gradient-to-br from-yellow-400/20 via-amber-300/10 to-yellow-600/20 blur-2xl" />

              {/* The official certificate frame */}
              <div className="relative overflow-hidden rounded-[24px] bg-[#fffef5] shadow-[0_20px_60px_rgba(0,0,0,0.18)] ring-1 ring-yellow-900/10">

                {/* Outer border frame */}
                <div className="absolute inset-0 m-2 rounded-[20px] border-[6px] border-double border-yellow-700/30 pointer-events-none z-10" />
                <div className="absolute inset-0 m-4 rounded-[16px] border-[2px] border-yellow-600/20 pointer-events-none z-10" />

                {/* Corner ornaments */}
                {[
                  "top-3 left-3",
                  "top-3 right-3",
                  "bottom-3 left-3",
                  "bottom-3 right-3",
                ].map((pos) => (
                  <div
                    key={pos}
                    className={`pointer-events-none absolute ${pos} z-20 flex size-8 items-center justify-center`}
                  >
                    <div className="size-5 rounded-full border-2 border-yellow-600/50 bg-yellow-50/80 shadow-sm" />
                    <div className="absolute size-2.5 rounded-full bg-yellow-600/40" />
                  </div>
                ))}

                {/* Top banner */}
                <div className="relative z-10 bg-gradient-to-r from-yellow-700 via-amber-600 to-yellow-700 py-3 text-center">
                  <p className="text-[10px] md:text-xs font-black uppercase tracking-[4px] text-yellow-100">
                    Apna Intern &nbsp;·&nbsp; Official Internship Certificate
                  </p>
                </div>

                {/* Certificate image */}
                <div
                  className="relative cursor-zoom-in overflow-hidden bg-[#fffef5] px-6 pb-6 pt-4 md:px-10 md:pb-10"
                  onClick={() => {
                    if (current?.file_url) {
                      setLightboxSrc(current.file_url);
                      setCertZoom(1);
                      setLightboxOpen(true);
                    }
                  }}
                >
                  <div className="relative flex items-center justify-center bg-white shadow-sm ring-1 ring-slate-900/5 rounded-lg p-2 md:p-4">
                    {imageCerts.map((cert, idx) => (
                      <div
                        key={cert.id}
                        className={`transition-all duration-700 ${
                          idx === activeIdx
                            ? "opacity-100 scale-100 relative z-10"
                            : "absolute inset-0 opacity-0 scale-95 pointer-events-none z-0"
                        }`}
                        style={{ pointerEvents: idx === activeIdx ? "auto" : "none" }}
                      >
                        <img
                          src={cert.file_url}
                          alt={cert.title || "Certificate"}
                          className="mx-auto w-full object-contain drop-shadow-md"
                          style={{ maxHeight: "520px" }}
                          loading="lazy"
                        />
                      </div>
                    ))}
                  </div>
                  {/* Hover hint */}
                  <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded-full bg-black/40 px-3 py-1 text-[10px] font-bold text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                    <ExternalLink className="size-3" /> Click to enlarge
                  </div>
                </div>

                {/* Bottom ribbon */}
                <div className="relative z-10 bg-gradient-to-r from-yellow-700 via-amber-600 to-yellow-700 py-2 text-center">
                  <p className="text-[9px] md:text-[10px] font-bold uppercase tracking-[3px] text-yellow-100/80">
                    {current?.title || "Sample Certificate of Internship Completion"}
                  </p>
                </div>
              </div>

              {/* Prev / Next arrows */}
              {count > 1 && (
                <>
                  <button
                    onClick={prev}
                    className="absolute left-2 top-1/2 z-30 -translate-y-1/2 flex size-10 items-center justify-center rounded-full bg-white/90 shadow-lg ring-1 ring-slate-200 hover:bg-white hover:scale-110 transition-all md:-left-5"
                    aria-label="Previous certificate"
                  >
                    <ChevronLeft className="size-5 text-slate-700" />
                  </button>
                  <button
                    onClick={next}
                    className="absolute right-2 top-1/2 z-30 -translate-y-1/2 flex size-10 items-center justify-center rounded-full bg-white/90 shadow-lg ring-1 ring-slate-200 hover:bg-white hover:scale-110 transition-all md:-right-5"
                    aria-label="Next certificate"
                  >
                    <ChevronRight className="size-5 text-slate-700" />
                  </button>
                </>
              )}
            </div>

            {/* Slide dots & action buttons */}
            <div className="mt-8 flex flex-col items-center gap-4">
              {count > 1 && (
                <div className="flex items-center gap-2">
                  {imageCerts.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => goTo(idx)}
                      className={`transition-all duration-300 rounded-full ${
                        idx === activeIdx
                          ? "w-6 h-2 bg-yellow-600"
                          : "w-2 h-2 bg-slate-300 hover:bg-yellow-400"
                      }`}
                      aria-label={`Go to certificate ${idx + 1}`}
                    />
                  ))}
                </div>
              )}

              {current && (
                <div className="flex flex-wrap justify-center gap-3">
                  <Button asChild size="lg" className="rounded-xl gap-2 bg-yellow-700 hover:bg-yellow-800">
                    <a href={current.file_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="size-4" /> View Certificate
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="lg" className="rounded-xl gap-2 border-yellow-700/30 text-yellow-800 hover:bg-yellow-50">
                    <a href={current.file_url} download={current.file_name || undefined}>
                      <Download className="size-4" /> Download
                    </a>
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PDF certificates as cards below */}
        {pdfCerts.length > 0 && (
          <div className="mt-10 space-y-4">
            {pdfCerts.map((cert) => (
              <div
                key={cert.id}
                className="mx-auto flex max-w-2xl flex-col items-center gap-5 rounded-2xl border border-slate-200/80 bg-white p-7 text-center shadow-soft sm:flex-row sm:text-left"
              >
                <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-yellow-50 ring-1 ring-yellow-200">
                  <FileText className="size-7 text-yellow-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-yellow-700">Official PDF</div>
                  <h3 className="font-display mb-1 text-lg font-extrabold text-slate-900">{cert.title || "Sample Certificate"}</h3>
                  {cert.description && <p className="text-sm text-slate-500">{cert.description}</p>}
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <Button asChild size="sm" className="rounded-xl gap-1 bg-yellow-700 hover:bg-yellow-800">
                    <a href={cert.file_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="size-3.5" /> View
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="rounded-xl gap-1">
                    <a href={cert.file_url} download={cert.file_name || undefined}>
                      <Download className="size-3.5" /> Download
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Full-screen Lightbox ── */}
      <Dialog open={lightboxOpen} onOpenChange={(open) => { if (!open) { setLightboxOpen(false); setCertZoom(1); } }}>
        <DialogContent className="max-w-[96vw] h-[95vh] bg-transparent border-none p-0 shadow-none [&>button]:text-white [&>button]:bg-black/50 [&>button]:rounded-full [&>button]:p-3 [&>button]:z-50 flex items-center justify-center">
          <DialogTitle className="sr-only">View Certificate</DialogTitle>
          <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[20px] bg-black/50 backdrop-blur-lg">

            {/* Zoom bar */}
            <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-full bg-black/60 px-6 py-3 text-white shadow-xl backdrop-blur-md z-50 border border-white/10">
              <button onClick={() => setCertZoom((z) => Math.max(0.5, z - 0.25))} className="rounded-full p-2 hover:bg-white/20 transition-colors">
                <Minus className="size-5" />
              </button>
              <span className="w-14 text-center font-bold tracking-wider text-sm">{Math.round(certZoom * 100)}%</span>
              <button onClick={() => setCertZoom((z) => Math.min(4, z + 0.25))} className="rounded-full p-2 hover:bg-white/20 transition-colors">
                <Plus className="size-5" />
              </button>
              <div className="w-px h-5 bg-white/20 mx-1" />
              <button onClick={() => setCertZoom(1)} className="rounded-full p-2 hover:bg-white/20 transition-colors" title="Reset zoom">
                <RotateCcw className="size-4" />
              </button>
            </div>

            {/* Scrollable image */}
            <div className="flex h-full w-full items-center justify-center overflow-auto no-scrollbar p-10">
              <div
                style={{ transform: `scale(${certZoom})`, transformOrigin: "center center", transition: "transform 0.3s ease" }}
              >
                <img
                  src={lightboxSrc}
                  alt="Certificate"
                  className="max-w-[85vw] max-h-[80vh] object-contain drop-shadow-2xl rounded-lg"
                />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}



type HomeExpertTeamSectionProps = {
  members: SiteExpertMember[];
};

export function HomeExpertTeamSection({ members }: HomeExpertTeamSectionProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (!scrollRef.current || isPaused || members.length === 0) return;

    const scrollContainer = scrollRef.current;
    // When duplicating items, the real width is exactly half
    const half = scrollContainer.scrollWidth / 2;
    const interval = setInterval(() => {
      if (scrollContainer.scrollLeft >= half) {
        scrollContainer.scrollLeft = 0;
      } else {
        scrollContainer.scrollLeft += 1;
      }
    }, 30);

    return () => clearInterval(interval);
  }, [isPaused, members]);

  if (members.length === 0) return null;

  // Duplicate for seamless infinite scroll
  const displayMembers = [...members, ...members];

  return (
    <section id="expert-team" className="scroll-mt-24 bg-slate-50 py-16 md:py-20 overflow-hidden">
      <div className="mx-auto max-w-[1200px] px-8">
        <SectionHead title="Expert Team" />
      </div>
      <div 
        className="relative mt-2"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div
          ref={scrollRef}
          className="flex gap-6 overflow-x-hidden whitespace-nowrap px-4 md:px-8 pb-8 pt-4"
          style={{ width: "100%", WebkitOverflowScrolling: "touch" }}
        >
          {displayMembers.map((member, i) => (
            <div
              key={`${member.id}-${i}`}
              className="group overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-soft transition-all duration-500 hover:-translate-y-2 hover:shadow-elegant flex-shrink-0 w-[280px] md:w-[320px] whitespace-normal"
            >
              <div className="flex aspect-square items-center justify-center bg-gradient-to-b from-slate-50 to-white p-8">
                <div className="relative flex h-full w-full items-center justify-center rounded-full bg-white p-2 shadow-xl ring-1 ring-slate-900/5 transition-transform duration-500 group-hover:scale-105 group-hover:shadow-2xl">
                  {/* Subtle inner gradient ring */}
                  <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-primary/20 via-transparent to-primary/10 opacity-50 transition-opacity duration-500 group-hover:opacity-100" />
                  
                  {member.photo_url ? (
                    <img
                      src={member.photo_url}
                      alt={member.full_name}
                      className="relative z-10 h-full w-full rounded-full object-cover ring-4 ring-white"
                      loading="lazy"
                    />
                  ) : (
                    <div className="relative z-10 flex h-full min-h-[8rem] w-full items-center justify-center rounded-full bg-slate-100/80 text-slate-300 ring-4 ring-white">
                      <Users className="size-14" />
                    </div>
                  )}
                </div>
              </div>
              <div className="p-6">
                <h3 className="font-display text-lg font-bold text-slate-900">{member.full_name}</h3>
                <p className="mt-1 text-sm font-semibold text-primary">{member.designation}</p>
                <p className="text-sm text-slate-600 line-clamp-1">{member.title}</p>
                {member.bio ? (
                  <p className="mt-3 text-sm leading-relaxed text-slate-500 line-clamp-3">{member.bio}</p>
                ) : null}
                {(member.social_links?.linkedin ||
                  member.social_links?.twitter ||
                  member.social_links?.website) && (
                  <div className="mt-4 flex gap-2">
                    {member.social_links.linkedin ? (
                      <a
                        href={member.social_links.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex size-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:border-primary hover:text-primary"
                        aria-label="LinkedIn"
                      >
                        <Linkedin className="size-4" />
                      </a>
                    ) : null}
                    {member.social_links.twitter ? (
                      <a
                        href={member.social_links.twitter}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex size-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:border-primary hover:text-primary"
                        aria-label="Twitter"
                      >
                        <Twitter className="size-4" />
                      </a>
                    ) : null}
                    {member.social_links.website ? (
                      <a
                        href={member.social_links.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex size-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:border-primary hover:text-primary"
                        aria-label="Website"
                      >
                        <Globe className="size-4" />
                      </a>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

type HomeMouSectionProps = {
  mous: SiteMou[];
};

function MouDocumentFrame({
  imageUrl,
  title,
  className,
  onClick,
}: {
  imageUrl: string;
  title: string;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex w-full cursor-zoom-in flex-col items-center outline-none transition-transform duration-500 hover:scale-[1.02]",
        className
      )}
    >
      <div className="relative mx-auto w-full max-w-2xl">
        {/* Outer glow */}
        <div className="absolute -inset-4 rounded-[32px] bg-gradient-to-br from-yellow-400/20 via-amber-300/10 to-yellow-600/20 blur-2xl transition-opacity duration-500 group-hover:opacity-100 opacity-70" />

        {/* The official document frame */}
        <div className="relative overflow-hidden rounded-[24px] bg-[#fffef5] shadow-[0_20px_60px_rgba(0,0,0,0.18)] ring-1 ring-yellow-900/10">
          
          {/* Outer border frame */}
          <div className="absolute inset-0 m-2 rounded-[20px] border-[6px] border-double border-yellow-700/30 pointer-events-none z-10" />
          <div className="absolute inset-0 m-4 rounded-[16px] border-[2px] border-yellow-600/20 pointer-events-none z-10" />

          {/* Corner ornaments */}
          {[
            "top-3 left-3",
            "top-3 right-3",
            "bottom-3 left-3",
            "bottom-3 right-3",
          ].map((pos) => (
            <div
              key={pos}
              className={`pointer-events-none absolute ${pos} z-20 flex size-8 items-center justify-center`}
            >
              <div className="size-5 rounded-full border-2 border-yellow-600/50 bg-yellow-50/80 shadow-sm" />
              <div className="absolute size-2.5 rounded-full bg-yellow-600/40" />
            </div>
          ))}

          {/* Top banner */}
          <div className="relative z-10 bg-gradient-to-r from-yellow-700 via-amber-600 to-yellow-700 py-3 text-center">
            <p className="text-[10px] md:text-xs font-black uppercase tracking-[4px] text-yellow-100">
              Official Memorandum of Understanding
            </p>
          </div>

          {/* Document image */}
          <div className="relative overflow-hidden bg-[#fffef5] px-6 pb-6 pt-4 md:px-10 md:pb-10">
            <div className="relative flex items-center justify-center bg-white shadow-sm ring-1 ring-slate-900/5 rounded-lg p-2 md:p-4">
              <img
                src={imageUrl}
                alt={title}
                className="mx-auto w-full object-contain drop-shadow-md"
                style={{ maxHeight: "520px" }}
                loading="lazy"
                draggable={false}
              />
            </div>
            {/* Hover hint */}
            <div className="absolute bottom-10 right-10 flex items-center gap-1 rounded-full bg-black/40 px-3 py-1 text-[10px] font-bold text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
              <ExternalLink className="size-3" /> Click to enlarge
            </div>
          </div>

          {/* Bottom ribbon */}
          <div className="relative z-10 bg-gradient-to-r from-yellow-700 via-amber-600 to-yellow-700 py-3 text-center px-4">
            <p className="text-[11px] md:text-xs font-bold uppercase tracking-[2px] text-yellow-100/90 truncate">
              {title}
            </p>
          </div>
        </div>
      </div>
    </button>
  );
}

export function HomeMouSection({ mous }: HomeMouSectionProps) {
  const [selectedMou, setSelectedMou] = useState<SiteMou | null>(null);
  const [zoom, setZoom] = useState(1);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const mousWithImages = useMemo(() => mous.filter((m) => !!m.logo_url), [mous]);
  const count = mousWithImages.length;

  useEffect(() => {
    setIndex(0);
  }, [count]);

  useEffect(() => {
    if (paused || count < 2) return;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [paused, count]);

  if (count === 0) return null;

  const go = (next: number) => setIndex(((next % count) + count) % count);
  const current = mousWithImages[index];

  return (
    <section id="mous" className="scroll-mt-24 overflow-hidden bg-[#EEF1F4] py-16 md:py-20">
      <div className="mx-auto max-w-[1200px] px-8">
        <SectionHead
          title="Memoranda of Understanding"
          description="Collaborations with universities and institutions that power our internship programmes."
        />
      </div>

      <div
        className="relative mx-auto mt-6 w-full max-w-[720px] px-4 sm:px-6"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className="relative">
          {mousWithImages.map((mou, i) => {
            const active = i === index;
            return (
              <div
                key={mou.id}
                aria-hidden={!active}
                className={cn(
                  "transition-opacity duration-700 ease-out",
                  active ? "relative z-10 opacity-100 scale-100" : "absolute inset-x-0 top-0 pointer-events-none z-0 opacity-0 scale-95"
                )}
              >
                <MouDocumentFrame
                  imageUrl={mou.logo_url as string}
                  title={mou.org_name}
                  onClick={() => {
                    setZoom(1);
                    setSelectedMou(mou);
                  }}
                />
              </div>
            );
          })}

          {count > 1 ? (
            <>
              <button
                type="button"
                aria-label="Previous MOU"
                className="absolute left-0 top-[42%] z-20 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-700 shadow-md ring-1 ring-slate-200 transition hover:bg-slate-50 sm:-translate-x-3 sm:size-12"
                onClick={() => go(index - 1)}
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                type="button"
                aria-label="Next MOU"
                className="absolute right-0 top-[42%] z-20 flex size-11 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-700 shadow-md ring-1 ring-slate-200 transition hover:bg-slate-50 sm:translate-x-3 sm:size-12"
                onClick={() => go(index + 1)}
              >
                <ChevronRight className="size-6" />
              </button>
            </>
          ) : null}
        </div>

        {count > 1 ? (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            {mousWithImages.map((mou, i) => (
              <button
                key={`mou-dot-${mou.id}`}
                type="button"
                aria-label={`Go to MOU ${i + 1}`}
                aria-current={i === index}
                className={cn(
                  "h-2.5 rounded-full transition-all",
                  i === index ? "w-7 bg-primary" : "w-2.5 bg-primary/25 hover:bg-primary/40"
                )}
                onClick={() => go(i)}
              />
            ))}
          </div>
        ) : null}

        {current?.description ? (
          <p className="mx-auto mt-4 max-w-xl text-center text-sm text-slate-500">{current.description}</p>
        ) : null}
      </div>

      <Dialog
        open={selectedMou !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedMou(null);
            setZoom(1);
          }
        }}
      >
        <DialogContent className="flex h-[95vh] max-w-[95vw] items-center justify-center border-none bg-transparent p-0 shadow-none [&>button]:z-50 [&>button]:rounded-full [&>button]:bg-black/50 [&>button]:p-3 [&>button]:text-white [&>button]:hover:bg-black/80">
          <DialogTitle className="sr-only">View MOU Document</DialogTitle>
          <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[24px] bg-black/40 backdrop-blur-xl">
            <div className="absolute bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-full border border-white/10 bg-black/60 px-6 py-3 text-white shadow-xl backdrop-blur-md transition-all hover:bg-black/70">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                className="rounded-full p-2 transition-colors hover:bg-white/20"
              >
                <Minus className="size-5" />
              </button>
              <span className="w-16 text-center font-display font-bold tracking-wider">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
                className="rounded-full p-2 transition-colors hover:bg-white/20"
              >
                <Plus className="size-5" />
              </button>
              <div className="mx-1 h-6 w-px bg-white/20" />
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="rounded-full p-2 transition-colors hover:bg-white/20"
                title="Reset Zoom"
              >
                <RotateCcw className="size-4" />
              </button>
            </div>

            <div className="no-scrollbar flex h-full w-full items-center justify-center overflow-auto">
              {selectedMou?.logo_url ? (
                <div
                  className="flex min-h-full min-w-full items-center justify-center p-4 transition-all duration-300 ease-out md:p-12"
                  style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
                >
                  <div className="border-[16px] border-primary bg-white p-2 shadow-2xl">
                    <img
                      src={selectedMou.logo_url}
                      alt={selectedMou.org_name}
                      className="max-h-none max-w-none object-contain"
                      style={{ width: "100%", height: "100%" }}
                    />
                  </div>
                </div>
              ) : (
                <Globe className="size-32 text-white/50" />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

type HomeOfflineProgramsSectionProps = {
  programs: SiteOfflineProgram[];
};

/** @deprecated Combined into HomeGallerySection — kept so older imports do not break. */
export function HomeOfflineProgramsSection(_props: HomeOfflineProgramsSectionProps) {
  return null;
}

type HomeTestimonialsSectionProps = {
  testimonials: SiteTestimonial[];
};

export function HomeTestimonialsSection({ testimonials }: HomeTestimonialsSectionProps) {
  if (testimonials.length === 0) return null;

  return (
    <section id="success-stories" className="scroll-mt-24 bg-white py-16 md:py-20">
      <div className="mx-auto max-w-[1200px] px-8">
        <SectionHead
          pill="Success stories"
          title="What our students say"
          description="Real feedback from students who completed internships through Apna Intern."
        />
        <div className="relative px-12">
          <Carousel
            opts={{ align: "start", loop: testimonials.length > 1 }}
            className="w-full"
          >
            <CarouselContent>
              {testimonials.map((t) => (
                <CarouselItem key={t.id} className="md:basis-1/2 lg:basis-1/3">
                  <div className="h-full rounded-2xl border border-slate-200/80 bg-slate-50 p-6 shadow-soft">
                    <StarRating rating={t.rating} className="mb-4" />
                    <Quote className="mb-3 size-6 text-primary/30" />
                    <p className="mb-6 text-sm leading-relaxed text-slate-700">&ldquo;{t.review}&rdquo;</p>
                    <div className="flex items-center gap-3 border-t border-slate-200/80 pt-4">
                      <div className="size-12 shrink-0 overflow-hidden rounded-full bg-slate-200">
                        {t.photo_url ? (
                          <img
                            src={t.photo_url}
                            alt={t.full_name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-slate-400">
                            <Quote className="size-5" />
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-display text-sm font-bold text-slate-900">{t.full_name}</p>
                        {t.designation ? (
                          <p className="text-xs text-slate-500">{t.designation}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            {testimonials.length > 1 ? (
              <>
                <CarouselPrevious className="-left-2 border-slate-200 bg-white shadow-sm md:-left-4" />
                <CarouselNext className="-right-2 border-slate-200 bg-white shadow-sm md:-right-4" />
              </>
            ) : null}
          </Carousel>
        </div>
      </div>
    </section>
  );
}
