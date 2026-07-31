/**
 * Subject → internship domain options (UG: B.A., B.Sc, B.Com).
 * Used by RegistrationForm and PrefilledRegistrationForm so the domain
 * dropdown only shows domains relevant to the selected subject.
 */

export const SUBJECT_DOMAIN_MAP: Record<string, string[]> = {
  // B.Sc — Science, Research & Applied Technology
  "B.Sc (Botany)": [
    "Organic Farming & Sustainable Agriculture",
    "Herbal & Ayurvedic Product Development",
  ],
  "B.Sc (Chemistry)": ["Pharmaceutical Industry Basics & Drug Chemistry"],
  "B.Sc (Geology)": [
    "GIS (Geographic Information Systems) Analysis",
    "Disaster Management & Risk Assessment",
    "Climate Change & Carbon Analytics Research",
    "Archaeological Survey & Excavation Research",
  ],
  "B.Sc (Mathematics)": [
    "Financial Mathematics & Stock Market Basics",
    "Accounting & Tally with GST",
  ],
  "B.Sc (Physics)": [
    "Renewable Energy System",
    "Solar Energy & Photovoltaic Systems",
  ],
  "B.Sc (Zoology)": [
    "Biomedical Research",
    "Genetics & Biotechnology Basics for Zoologists",
  ],

  // B.Com — Commerce, Finance & Business
  "B.Com Accounting and Finance": [
    "Personal Finance & Financial Planning",
    "Financial Mathematics & Stock Market Basics",
    "Accounting & Tally with GST",
  ],
  "B.Com (Accounting & Finance)": [
    "Personal Finance & Financial Planning",
    "Financial Mathematics & Stock Market Basics",
    "Accounting & Tally with GST",
  ],
  "B.Com (HRM)": ["HR Operations & Employee Lifecycle Management"],
  "B.Com (Marketing)": [
    "Sales Fundamentals & B2B/B2C Selling Skills",
    "Digital Marketing Analytics & Social Media Management",
  ],

  // B.A. — Arts, Humanities & Social Science
  "B.A. (Ancient Indian History - AIH)": [
    "Archaeological Survey & Excavation Research",
    "Heritage Conservation & Monument Restoration",
  ],
  "B.A. (Ancient Indian History)": [
    "Archaeological Survey & Excavation Research",
    "Heritage Conservation & Monument Restoration",
  ],
  "B.A. (Anthropology)": ["Ethnographic Field Research"],
  "B.A. (Arabic)": ["Arabic Content Writing & Copywriting using AI Tools"],
  "B.A. (Bengali)": ["Bengali Content Writing & Copywriting using AI Tools"],
  "B.A. (Bhojpuri)": ["Bhojpuri Content Writing & Copywriting using AI Tools"],
  "B.A. (Dramatics)": ["Scriptwriting & Creative Storytelling"],
  "B.A. (Economics)": ["ESG (Environmental, Social, Governance) Research"],
  "B.A. (English)": ["Spoken English & Communication Skills"],
  "B.A. (Geography)": [
    "GIS (Geographic Information Systems) Analysis",
    "Disaster Management & Risk Assessment",
    "Climate Change & Carbon Analytics Research",
  ],
  "B.A. (Home Science)": ["Food Technology & FMCG Product Development"],
  "B.A. (Hindi)": [
    "Hindi Content Writing & Copywriting using AI Tools",
    "Hindi Journalism & News Media Production",
  ],
  "B.A. (History)": [
    "Historical Content Writing & SEO Blogging",
    "Digital Archives & Heritage Documentation",
    "Buddhist Studies & Heritage Research",
  ],
  "B.A. (Law)": [
    "Corporate Legal Compliance & Governance",
    "Human Rights & NGO Legal Advocacy",
  ],
  "B.A. (LSW)": [
    "Labour Law & Employee Welfare Management",
    "Public Health & Social Welfare Research",
    "Human Rights & NGO Legal Advocacy",
  ],
  "B.A. (Maithili)": ["Maithili Content Writing & Copywriting using AI Tools"],
  "B.A. (Mathematics)": ["Financial Mathematics & Stock Market Basics"],
  "B.A. (Music)": ["Music Production & Audio Engineering (DAW)"],
  "B.A. (Pali)": [
    "Buddhist Studies & Heritage Research",
    "Pali Content Writing & Copywriting using AI Tools",
  ],
  "B.A. (Persian)": ["Persian Content Writing & Copywriting using AI Tools"],
  "B.A. (Philosophy)": ["Mental Health & Philosophical Counseling"],
  "B.A. (Political Science)": ["Political Journalism & Digital News Media"],
  "B.A. (Prakrit)": [
    "Jain Studies & Heritage Research",
    "Prakrit Content Writing & Copywriting using AI Tools",
  ],
  "B.A. (Psychology)": ["AI Ethics & Responsible Technology Policy Research"],
  "B.A. (Rural Economics)": ["Microfinance & Rural Banking"],
  "B.A. (Sanskrit)": ["Sanskrit Content Writing & Copywriting using AI Tools"],
  "B.A. (Sociology)": ["Public Health & Social Welfare Research"],
  "B.A. (Statistics)": ["Financial Mathematics & Stock Market Basics"],
  "B.A. (Urdu)": ["Urdu Content Writing & Copywriting using AI Tools"],
  Statistics: ["Financial Mathematics & Stock Market Basics"],
};

/** Normalise raw subject strings (case/whitespace/punctuation tolerant). */
function normalizeKey(raw: string | undefined | null): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*aih\s*/i, " - aih ");
}

/**
 * Look up internship domains for a subject. Returns empty if no mapping.
 */
export function getDomainsForSubject(subject: string | undefined | null): string[] {
  if (!subject) return [];
  const target = normalizeKey(subject);
  for (const [key, domains] of Object.entries(SUBJECT_DOMAIN_MAP)) {
    if (normalizeKey(key) === target) return [...domains];
  }
  for (const [key, domains] of Object.entries(SUBJECT_DOMAIN_MAP)) {
    const parenMatch = key.toLowerCase().match(/\(([^)]+)\)/);
    if (parenMatch) {
      const inner = parenMatch[1].replace(/\s*&\s*/g, " and ").toLowerCase();
      const t = target.replace(/\s*&\s*/g, " and ");
      if (t.includes(inner) || inner.includes(t.replace(/^b\.com\s+/, ""))) {
        return [...domains];
      }
    }
    if (/b\.com/.test(key.toLowerCase()) && /b\.com/.test(target)) {
      if (/account|finance/.test(target) && /account|finance/.test(key.toLowerCase())) {
        return [...domains];
      }
      if (/hrm|human resource/.test(target) && /hrm/.test(key.toLowerCase())) {
        return [...domains];
      }
      if (/marketing/.test(target) && /marketing/.test(key.toLowerCase())) {
        return [...domains];
      }
    }
  }
  return [];
}

/**
 * Domain dropdown options: mapped domains for the subject when available,
 * otherwise all domains from the database.
 */
export function getDomainOptionsForSubject(
  subject: string | undefined | null,
  dbDomainNames: string[]
): string[] {
  const mapped = getDomainsForSubject(subject);
  if (mapped.length > 0) return mapped;
  return dbDomainNames;
}

export function getAllMappedSubjects(): string[] {
  return Object.keys(SUBJECT_DOMAIN_MAP);
}

export type UgStreamKey = "B.A." | "B.Sc." | "B.Com.";

/**
 * Unique internship domains for a UG stream (aggregated from SUBJECT_DOMAIN_MAP).
 */
export function getDomainsForUgStream(stream: UgStreamKey): string[] {
  const prefixes: Record<UgStreamKey, RegExp> = {
    "B.A.": /^b\.?\s*a\.?\b/i,
    "B.Sc.": /^b\.?\s*sc\.?\b/i,
    "B.Com.": /^b\.?\s*com\.?\b/i,
  };
  const re = prefixes[stream];
  const set = new Set<string>();
  for (const [subject, domains] of Object.entries(SUBJECT_DOMAIN_MAP)) {
    if (!re.test(subject.trim())) continue;
    for (const d of domains) {
      const name = String(d || "").trim();
      if (name) set.add(name);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

