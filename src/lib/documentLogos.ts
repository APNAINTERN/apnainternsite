/** Full row — Logbook, Attendance Report, Acceptance Letter (left to right) */
export const ACCREDITATION_LOGOS = [
  { src: "/certificate/mca.png", alt: "Ministry of Corporate Affairs", h: "h-[48px]" },
  { src: "/certificate/msme.png", alt: "Ministry of MSME, Govt. of India", h: "h-[58px]" },
  { src: "/certificate/dpiit.png", alt: "DPIIT Startup India", h: "h-[48px]" },
  { src: "/certificate/iso.png", alt: "ISO 9001:2015 Certified Company", h: "h-[56px]" },
  { src: "/certificate/nip.png", alt: "National Internship Portal", h: "h-[50px]" },
] as const;

/** Certificate footer — left column under QR (DPIIT, NIP, ISO) */
export const CERTIFICATE_FOOTER_LEFT_LOGOS = [
  { src: "/certificate/dpiit.png", alt: "DPIIT Startup India", height: 56 },
  { src: "/certificate/nip.png", alt: "National Internship Portal", height: 64 },
  { src: "/certificate/iso.png", alt: "ISO 9001:2015 Certified Company", height: 68 },
] as const;

/** Certificate footer — right column under signature (MSME, MCA) */
export const CERTIFICATE_FOOTER_RIGHT_LOGOS = [
  { src: "/certificate/msme.png", alt: "Ministry of MSME, Govt. of India", height: 80 },
  { src: "/certificate/mca.png", alt: "Ministry of Corporate Affairs", height: 64 },
] as const;
