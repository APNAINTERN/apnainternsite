import { Phone, Mail, MapPin, Instagram, Youtube, Linkedin, Facebook } from "lucide-react";
import { Link } from "react-router-dom";
import {
  BRAND_CONTACT_EMAIL,
  BRAND_SUPPORT_EMAIL,
  BRAND_TAGLINE,
} from "@/lib/brand";

export const SiteFooter = () => (
  <footer id="footer" className="border-t border-slate-800 bg-slate-950 text-slate-400">
    <div className="mx-auto max-w-[1200px] px-8 py-16">
      <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-6">
          <div className="flex flex-col gap-4">
            <Link to="/" className="inline-block w-fit">
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <img
                  src="/logo-full.png"
                  alt="Apna Intern"
                  className="h-24 w-auto object-contain"
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
          <div className="flex gap-4">
            <a href="#" className="hover:text-primary transition-colors" aria-label="Instagram"><Instagram className="size-5" /></a>
            <a
              href="https://www.youtube.com/@Ezyintern_Internship"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors"
              aria-label="YouTube"
            >
              <Youtube className="size-5" />
            </a>
            <a
              href="https://www.linkedin.com/company/ezyintern1/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors"
              aria-label="LinkedIn"
            >
              <Linkedin className="size-5" />
            </a>
            <a href="#" className="hover:text-primary transition-colors" aria-label="Facebook"><Facebook className="size-5" /></a>
          </div>
        </div>

        <div>
          <h4 className="font-display font-bold text-sm uppercase tracking-widest text-white mb-6">Quick Links</h4>
          <ul className="space-y-3.5 text-sm">
            <li><Link to="/" className="hover:text-white transition-colors">Home</Link></li>
            <li><a href="/#about" className="hover:text-white transition-colors">About</a></li>
            <li><a href="/#gallery" className="hover:text-white transition-colors">Gallery</a></li>
            <li><a href="/#consent-form" className="hover:text-white transition-colors">Consent Form</a></li>
            <li><a href="/#faq" className="hover:text-white transition-colors">FAQ</a></li>
            <li><Link to="/verify" className="hover:text-white transition-colors">Verify Certificate</Link></li>
            <li><Link to="/cybercafe" className="hover:text-white transition-colors font-semibold text-[#5ea4e8]">Cyber Cafe Partner</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="font-display font-bold text-sm uppercase tracking-widest text-white mb-6">For Students</h4>
          <ul className="space-y-3.5 text-sm">
            <li><Link to="/register" className="hover:text-white transition-colors font-bold text-primary">Register Now</Link></li>
            <li><Link to="/login" className="hover:text-white transition-colors">Student Login</Link></li>
            <li><Link to="/contact" className="hover:text-white transition-colors">Help & Support</Link></li>
            <li><Link to="/benefits" className="hover:text-white transition-colors">Program Benefits</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="font-display font-bold text-sm uppercase tracking-widest text-white mb-6">Contact Us</h4>
          <ul className="space-y-4 text-sm">
            <li className="flex items-start gap-3">
              <MapPin className="size-5 mt-0.5 text-primary flex-shrink-0" />
              <span>Arfabad Colony, East Nahar Road, <br/>Bajrangpuri, Patna - 800007, Bihar</span>
            </li>
            <li className="flex items-center gap-3">
              <Phone className="size-5 text-primary flex-shrink-0" />
              <div className="flex flex-col">
                <a href="tel:+917050936593" className="hover:text-white">+91 70509 36593</a>
              </div>
            </li>
            <li className="flex items-center gap-3">
              <Mail className="size-5 text-primary flex-shrink-0" />
              <div className="flex flex-col">
                <a href={`mailto:${BRAND_CONTACT_EMAIL}`} className="hover:text-white">{BRAND_CONTACT_EMAIL}</a>
                <a href={`mailto:${BRAND_SUPPORT_EMAIL}`} className="hover:text-white">{BRAND_SUPPORT_EMAIL}</a>
              </div>
            </li>
          </ul>
        </div>
      </div>


      <div className="mt-16 pt-8 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6 text-[10px] font-bold uppercase tracking-widest text-slate-500">
        <p>© {new Date().getFullYear()} Apna Intern. Government Certified Provider.</p>
        <div className="flex gap-8">
          <Link to="/privacy" className="hover:text-white">Privacy Policy</Link>
          <Link to="/terms" className="hover:text-white">Terms of Service</Link>
        </div>
      </div>
    </div>
  </footer>
);
