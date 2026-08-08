import { Phone, Mail, MapPin, Instagram, Youtube, Linkedin, Facebook, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  BRAND_CONTACT_EMAIL,
  BRAND_SUPPORT_EMAIL,
  BRAND_TAGLINE,
} from "@/lib/brand";

export const SiteFooter = () => (
  <footer id="footer" className="relative border-t border-slate-800 bg-slate-950 text-slate-400">
    <div className="home-shimmer-line absolute inset-x-0 top-0 h-px opacity-40" aria-hidden />

    <div className="mx-auto max-w-[1200px] px-6 py-14 sm:px-8">
      <div className="mb-14 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-primary/20 via-slate-900 to-slate-950 p-8 md:p-10">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">Pan India internships</p>
            <h3 className="font-display mt-2 text-2xl font-extrabold text-white md:text-3xl">
              Ready to start your internship journey?
            </h3>
            <p className="mt-2 max-w-lg text-sm text-slate-400">
              Register in minutes, get your offer letter, and join thousands of students earning UGC-aligned credits.
            </p>
          </div>
          <Button asChild size="lg" className="btn-press shrink-0 rounded-full px-8">
            <Link to="/register">
              Register now
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-6">
          <div className="flex flex-col gap-4">
            <Link to="/" className="inline-block w-fit">
              <div className="rounded-2xl bg-white p-3 shadow-lg ring-1 ring-white/10">
                <img
                  src="/logo-full.png"
                  alt="Apna Intern"
                  className="h-20 w-auto object-contain"
                />
              </div>
            </Link>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              {BRAND_TAGLINE}
            </p>
          </div>
          <p className="text-sm leading-relaxed text-slate-400">
            India&apos;s trusted platform for UGC-compliant internship programmes, digital certification, and academic credit tracking.
          </p>
          <div className="flex gap-3">
            {[
              { Icon: Instagram, href: "#", label: "Instagram" },
              { Icon: Youtube, href: "https://www.youtube.com/@Ezyintern_Internship", label: "YouTube" },
              { Icon: Linkedin, href: "https://www.linkedin.com/company/ezyintern1/", label: "LinkedIn" },
              { Icon: Facebook, href: "#", label: "Facebook" },
            ].map(({ Icon, href, label }) => (
              <a
                key={label}
                href={href}
                target={href.startsWith("http") ? "_blank" : undefined}
                rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                aria-label={label}
              >
                <Icon className="size-4" />
              </a>
            ))}
          </div>
        </div>

        <div>
          <h4 className="font-display mb-6 text-sm font-bold uppercase tracking-widest text-white">Explore</h4>
          <ul className="space-y-3.5 text-sm">
            <li><Link to="/" className="transition-colors hover:text-white">Home</Link></li>
            <li><a href="/#about" className="transition-colors hover:text-white">About</a></li>
            <li><a href="/#categories" className="transition-colors hover:text-white">Internship Categories</a></li>
            <li><a href="/#how-it-works" className="transition-colors hover:text-white">How It Works</a></li>
            <li><a href="/#gallery" className="transition-colors hover:text-white">Gallery</a></li>
            <li><a href="/#faq" className="transition-colors hover:text-white">FAQ</a></li>
            <li><Link to="/verify" className="transition-colors hover:text-white">Verify Certificate</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="font-display mb-6 text-sm font-bold uppercase tracking-widest text-white">For Students</h4>
          <ul className="space-y-3.5 text-sm">
            <li><Link to="/register" className="font-bold text-primary transition-colors hover:text-sky-300">Register Now</Link></li>
            <li><Link to="/login" className="transition-colors hover:text-white">Student Login</Link></li>
            <li><Link to="/benefits" className="transition-colors hover:text-white">Program Benefits</Link></li>
            <li><Link to="/contact" className="transition-colors hover:text-white">Help & Support</Link></li>
            <li><Link to="/cybercafe" className="font-semibold text-sky-400 transition-colors hover:text-sky-300">Cyber Cafe Partner</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="font-display mb-6 text-sm font-bold uppercase tracking-widest text-white">Contact</h4>
          <ul className="space-y-4 text-sm">
            <li className="flex items-start gap-3">
              <MapPin className="mt-0.5 size-5 shrink-0 text-primary" />
              <span>Arfabad Colony, East Nahar Road, Bajrangpuri, Patna - 800007, Bihar</span>
            </li>
            <li className="flex items-center gap-3">
              <Phone className="size-5 shrink-0 text-primary" />
              <a href="tel:+917050936593" className="transition-colors hover:text-white">+91 70509 36593</a>
            </li>
            <li className="flex items-center gap-3">
              <Mail className="size-5 shrink-0 text-primary" />
              <div className="flex flex-col">
                <a href={`mailto:${BRAND_CONTACT_EMAIL}`} className="transition-colors hover:text-white">{BRAND_CONTACT_EMAIL}</a>
                <a href={`mailto:${BRAND_SUPPORT_EMAIL}`} className="transition-colors hover:text-white">{BRAND_SUPPORT_EMAIL}</a>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-14 flex flex-col items-center justify-between gap-6 border-t border-slate-800 pt-8 text-[10px] font-bold uppercase tracking-widest text-slate-500 md:flex-row">
        <p>© {new Date().getFullYear()} Apna Intern. Government Certified Provider.</p>
        <div className="flex gap-8">
          <Link to="/privacy" className="transition-colors hover:text-white">Privacy Policy</Link>
          <Link to="/terms" className="transition-colors hover:text-white">Terms of Service</Link>
        </div>
      </div>
    </div>
  </footer>
);
