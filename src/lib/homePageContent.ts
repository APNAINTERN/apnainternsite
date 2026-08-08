import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Briefcase,
  Code2,
  Megaphone,
  Palette,
  Scale,
  Search,
  Users,
} from "lucide-react";

export type InternshipCategory = {
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  domains: string;
};

export const INTERNSHIP_CATEGORIES: InternshipCategory[] = [
  {
    title: "Digital Marketing",
    description: "SEO, social media, content strategy, and campaign analytics for modern brands.",
    icon: Megaphone,
    accent: "from-rose-500/15 to-orange-500/5 border-rose-200/70",
    domains: "12+ tracks",
  },
  {
    title: "Web & App Development",
    description: "Front-end, back-end, and full-stack foundations with project-based learning.",
    icon: Code2,
    accent: "from-sky-500/15 to-cyan-500/5 border-sky-200/70",
    domains: "10+ tracks",
  },
  {
    title: "Data & Research",
    description: "Spreadsheets, visualization, survey methods, and evidence-based reporting.",
    icon: BarChart3,
    accent: "from-violet-500/15 to-indigo-500/5 border-violet-200/70",
    domains: "8+ tracks",
  },
  {
    title: "Accounting & Finance",
    description: "Tally, GST basics, bookkeeping, and financial literacy for commerce students.",
    icon: Scale,
    accent: "from-amber-500/15 to-yellow-500/5 border-amber-200/70",
    domains: "9+ tracks",
  },
  {
    title: "HR & Operations",
    description: "Recruitment basics, workplace communication, and organisational workflows.",
    icon: Users,
    accent: "from-emerald-500/15 to-teal-500/5 border-emerald-200/70",
    domains: "7+ tracks",
  },
  {
    title: "Design & Media",
    description: "Graphic design, video editing, and creative storytelling for digital platforms.",
    icon: Palette,
    accent: "from-fuchsia-500/15 to-pink-500/5 border-fuchsia-200/70",
    domains: "11+ tracks",
  },
  {
    title: "Business Development",
    description: "Sales fundamentals, client outreach, and startup-style growth experiments.",
    icon: Briefcase,
    accent: "from-slate-500/15 to-slate-400/5 border-slate-200/70",
    domains: "6+ tracks",
  },
  {
    title: "Career Skills",
    description: "Resume building, interview prep, and professional communication.",
    icon: Search,
    accent: "from-primary/15 to-sky-400/5 border-primary/30",
    domains: "5+ tracks",
  },
];

export const TOP_RECRUITERS = [
  "TCS",
  "Infosys",
  "Wipro",
  "HDFC Bank",
  "ICICI Bank",
  "Deloitte",
  "Accenture",
  "HCLTech",
  "Capgemini",
  "Cognizant",
  "Amazon",
  "Flipkart",
  "Zomato",
  "Swiggy",
  "BYJU'S",
  "Paytm",
] as const;

export const TRUSTED_STUDENT_HIGHLIGHTS = [
  { label: "Average rating", value: "4.8", suffix: "/5" },
  { label: "States covered", value: "28", suffix: "+" },
  { label: "Live mentor sessions", value: "500", suffix: "+" },
  { label: "Partner colleges", value: "200", suffix: "+" },
] as const;
