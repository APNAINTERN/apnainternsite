import { supabase } from "@/integrations/supabase/client";

/** Canonical field keys the upload UI maps source columns onto. */
export const ROSTER_FIELDS = [
  { key: "full_name", label: "Full name", required: true },
  { key: "registration_number", label: "Registration / Roll number" },
  { key: "email", label: "Email", recommended: true },
  { key: "phone", label: "Phone (10 digits)", recommended: true },
  { key: "course", label: "Course / Internship domain" },
  { key: "degree", label: "Degree (UG / PG / B.A. etc.)" },
  { key: "department", label: "Department" },
  { key: "subject", label: "Subject / Major" },
  { key: "class_semester", label: "Semester" },
  { key: "academic_session", label: "Academic session" },
  { key: "gender", label: "Gender" },
  { key: "dob", label: "Date of birth" },
  { key: "parent_name", label: "Parent / Guardian name" },
  { key: "internship_mode", label: "Internship mode" },
] as const;

export type RosterFieldKey = (typeof ROSTER_FIELDS)[number]["key"];

export type RosterRowInput = Partial<Record<RosterFieldKey, string>> & {
  metadata?: Record<string, unknown>;
};

export type RosterMatchStatus = "none" | "matched" | "ambiguous" | "claimed";

export type RosterMatchPayload = {
  status: RosterMatchStatus;
  data?: {
    id: string;
    full_name?: string | null;
    registration_number?: string | null;
    email?: string | null;
    phone?: string | null;
    course?: string | null;
    degree?: string | null;
    department?: string | null;
    subject?: string | null;
    class_semester?: string | null;
    academic_session?: string | null;
    gender?: string | null;
    dob?: string | null;
    parent_name?: string | null;
    internship_mode?: string | null;
    metadata?: Record<string, unknown> | null;
  };
};

/** Heuristics to pre-fill the column mapping when the admin first opens a CSV. */
const COLUMN_HEURISTICS: Record<RosterFieldKey, RegExp[]> = {
  full_name: [
    /^name$/i,
    /full[\s_-]*name/i,
    /student[\s_-]*name/i,
    /candidate[\s_-]*name/i,
    /candidate/i,
    /^applicant$/i,
    /applicant[\s_-]*name/i,
  ],
  registration_number: [
    /reg(\.|istration)?[\s_-]*(no|number|num|id)/i,
    /roll[\s_-]*(no|number|num)/i,
    /enroll?ment[\s_-]*(no|number|id)/i,
    /admission[\s_-]*(no|number|id)/i,
    /univ[\s_-]*(reg|roll)/i,
    /college[\s_-]*(id|no|number)/i,
  ],
  email: [/^e[\s_-]*mail$/i, /email/i, /mail[\s_-]*id/i, /gmail/i],
  phone: [/phone/i, /mobile/i, /contact[\s_-]*(no|number)?/i, /whats?app/i, /^ph$/i, /^cell/i],
  course: [
    /^course$/i,
    /internship[\s_-]*domain/i,
    /domain/i,
    /programme/i,
    /^program$/i,
  ],
  degree: [/degree/i, /qualification/i, /^class$/i, /^stream$/i, /^level$/i],
  department: [/department/i, /dept/i, /branch/i, /faculty/i, /discipline/i],
  subject: [
    /subject/i,
    /major/i,
    /specialisation/i,
    /specialization/i,
    /honou?rs/i,
  ],
  class_semester: [/sem(ester)?/i, /^sem$/i, /^year$/i, /yr/i],
  academic_session: [/session/i, /batch/i, /academic[\s_-]*year/i, /admission[\s_-]*year/i],
  gender: [/gender/i, /^sex$/i],
  dob: [/dob/i, /birth/i, /date[\s_-]*of[\s_-]*birth/i],
  parent_name: [/parent/i, /father/i, /guardian/i, /mother/i, /^fathers/i, /family[\s_-]*member/i],
  internship_mode: [/^mode$/i, /internship[\s_-]*mode/i, /online|offline|hybrid/i],
};

/**
 * Inspect actual cell values to detect field types when header names aren't
 * obvious.
 *
 * Important: The registration form treats "Degree" as UG / PG only, while what
 * college rosters carry (e.g. "B.Com", "B.A.", "M.A.") is what the form treats
 * as Department. So values like "B.Com" map to **department** here; degree is
 * derived from the department at fill time.
 */
function detectFieldByValues(values: string[]): RosterFieldKey | null {
  const sample = values.map((v) => String(v ?? "").trim()).filter(Boolean).slice(0, 30);
  if (sample.length < 3) return null;
  const ratio = (test: (v: string) => boolean) =>
    sample.filter(test).length / sample.length;

  if (ratio((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) > 0.6) return "email";
  if (ratio((v) => /^\+?\d[\d\s\-()]{8,14}\d$/.test(v) && v.replace(/\D/g, "").length >= 10) > 0.6)
    return "phone";
  if (ratio((v) => /^(male|female|other|m|f|trans(gender)?)$/i.test(v)) > 0.6) return "gender";

  // "B.Com" / "B.A." / "B.Sc" / "M.Com" / "M.A." / "M.Sc" type values are
  // departments in our form's vocabulary (degree gets derived from them).
  if (
    ratio((v) =>
      /^(b\.?\s*(com|a|sc|ba|bs)|m\.?\s*(com|a|sc|ba|bs))$/i.test(v) ||
      /^(bachelor|master|under[\s_-]*graduate|post[\s_-]*graduate|undergrad|postgrad)/i.test(v)
    ) > 0.5
  )
    return "department";

  // UG / PG / BSc/BA etc. as the literal pair maps to degree.
  if (ratio((v) => /^(ug|pg|under[\s_-]*graduate|post[\s_-]*graduate)$/i.test(v)) > 0.5)
    return "degree";

  if (ratio((v) => /^(sem(ester)?\.?\s*)?[1-8](st|nd|rd|th)?$/i.test(v)) > 0.5)
    return "class_semester";
  if (ratio((v) => /^\d{4}\s*[-–]\s*\d{2,4}$/.test(v)) > 0.6) return "academic_session";
  if (
    ratio((v) =>
      /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$|^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(v)
    ) > 0.6
  )
    return "dob";
  if (ratio((v) => /^(online|offline|hybrid|blended)$/i.test(v)) > 0.6) return "internship_mode";

  return null;
}

/**
 * Header-only auto-map. Kept for backwards compatibility.
 */
export function autoMapColumns(headers: string[]): Record<RosterFieldKey, string | ""> {
  const out: Record<string, string | ""> = {};
  const usedHeaders = new Set<string>();
  for (const field of ROSTER_FIELDS) {
    out[field.key] = "";
    const patterns = COLUMN_HEURISTICS[field.key];
    if (!patterns) continue;
    const hit = headers.find(
      (h) => !usedHeaders.has(h) && patterns.some((p) => p.test(h.trim()))
    );
    if (hit) {
      out[field.key] = hit;
      usedHeaders.add(hit);
    }
  }
  return out as Record<RosterFieldKey, string | "">;
}

/**
 * Smarter auto-map that looks at column values too. Use this whenever the
 * caller has access to a few sample rows from the file. It runs the header
 * heuristic first, then a value-pattern fallback for fields that didn't match.
 */
export function autoMapColumnsSmart(
  headers: string[],
  rows: Record<string, string>[]
): Record<RosterFieldKey, string | ""> {
  const out: Record<RosterFieldKey, string | ""> = autoMapColumns(headers);
  const usedHeaders = new Set<string>(Object.values(out).filter(Boolean) as string[]);

  // For each remaining header, try to infer the field by inspecting its values.
  for (const header of headers) {
    if (usedHeaders.has(header)) continue;
    const values = rows.map((r) => r[header] || "").slice(0, 30);
    const guessed = detectFieldByValues(values);
    if (guessed && !out[guessed]) {
      out[guessed] = header;
      usedHeaders.add(header);
    }
  }

  return out;
}

export function normalisePhone(raw: string | undefined | null): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

// =============================================================================
// Value normalisers — translate raw CSV values to the exact options the public
// registration form's Select / RadioGroup widgets expect. Used by the
// auto-fill effect; the underlying DB row is left untouched.
// =============================================================================

const DEPARTMENT_CANON: Record<string, string> = {
  "b.a.": "B.A.",
  "b.a": "B.A.",
  ba: "B.A.",
  "b.sc": "B.Sc",
  "b.sc.": "B.Sc",
  bsc: "B.Sc",
  "b.com": "B.Com",
  "b.com.": "B.Com",
  bcom: "B.Com",
  "m.a.": "M.A.",
  "m.a": "M.A.",
  ma: "M.A.",
  "m.sc": "M.Sc",
  "m.sc.": "M.Sc",
  msc: "M.Sc",
  "m.com": "M.Com",
  "m.com.": "M.Com",
  mcom: "M.Com",
};

const POSTGRAD_PATTERNS = [
  /^m\.?\s?(com|a|sc|ba|bs)/i,
  /post\s*[- ]?graduate/i,
  /^pg$/i,
  /master/i,
];

const SESSION_OPTIONS = ["2023-2027", "2024-2028", "2025-2029"];

/** Normalise raw CSV text by lowering + stripping all spaces/punct. */
function norm(s: string | undefined | null): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "");
}

/** "BCOM" / "Bachelor of Commerce" / "B.Com." → "B.Com". */
export function normalizeDepartment(raw: string | undefined | null): string {
  if (!raw) return "";
  const key = norm(raw);
  if (DEPARTMENT_CANON[key]) return DEPARTMENT_CANON[key];

  // Free-form fallbacks
  if (/bachelor.*commerce|^bcom/i.test(raw)) return "B.Com";
  if (/bachelor.*art|^ba\b/i.test(raw)) return "B.A.";
  if (/bachelor.*science|^bsc/i.test(raw)) return "B.Sc";
  if (/master.*commerce|^mcom/i.test(raw)) return "M.Com";
  if (/master.*art|^ma\b/i.test(raw)) return "M.A.";
  if (/master.*science|^msc/i.test(raw)) return "M.Sc";
  return "";
}

/** "B.Com" / "MA" → "UG" / "PG". Empty if unknown. */
export function normalizeDegree(raw: string | undefined | null): "UG" | "PG" | "" {
  if (!raw) return "";
  const trimmed = String(raw).trim();
  if (/^ug$/i.test(trimmed) || /under\s*[- ]?graduate/i.test(trimmed)) return "UG";
  if (POSTGRAD_PATTERNS.some((p) => p.test(trimmed))) return "PG";
  if (/^b[\s.]/i.test(trimmed)) return "UG";
  if (/^m[\s.]/i.test(trimmed)) return "PG";
  const dept = normalizeDepartment(raw);
  if (dept.startsWith("B.")) return "UG";
  if (dept.startsWith("M.")) return "PG";
  return "";
}

const SUBJECT_HINTS_BCOM = [
  /accoun?ting/i,
  /commerce/i,
  /finance/i,
  /marketing/i,
  /h\.?\s?r\.?\s?m/i,
  /business/i,
];
const SUBJECT_HINTS_BSC = [
  /physics/i,
  /chemistry/i,
  /math/i,
  /biology/i,
  /zoology/i,
  /botany/i,
  /geology/i,
  /computer\s*science/i,
  /electronics/i,
];
const SUBJECT_HINTS_BA = [
  /history/i,
  /political/i,
  /sociology/i,
  /english/i,
  /hindi/i,
  /economics/i,
  /psychology/i,
  /philosophy/i,
  /geography/i,
  /sanskrit/i,
  /urdu/i,
  /maithili/i,
  /persian/i,
];

/**
 * Subject was free text in the CSV — best-effort infer of department from it.
 * Only used when the roster row doesn't explicitly carry a department.
 */
export function inferDepartmentFromSubject(subject: string | undefined | null): string {
  if (!subject) return "";
  if (SUBJECT_HINTS_BCOM.some((p) => p.test(subject))) return "B.Com";
  if (SUBJECT_HINTS_BSC.some((p) => p.test(subject))) return "B.Sc";
  if (SUBJECT_HINTS_BA.some((p) => p.test(subject))) return "B.A.";
  return "";
}

/**
 * For B.Com, the form's Subject dropdown has a fixed three-option list. Match
 * common roster values (e.g. "ACCOUNTING") to one of those options. For other
 * departments the form accepts free text, so we just title-case the raw value.
 */
export function normalizeSubject(
  raw: string | undefined | null,
  department: string | undefined | null
): string {
  if (!raw) return "";
  const v = String(raw).trim();
  if (department === "B.Com") {
    if (/accoun?ting|finance/i.test(v)) return "B.Com Accounting and Finance";
    if (/h\.?\s?r\.?\s?m|human\s*resource/i.test(v)) return "B.Com (HRM)";
    if (/marketing/i.test(v)) return "B.Com (Marketing)";
  }
  // B.A. / B.Sc lists already include the prefix (e.g. "B.A. (Economics)").
  // Try to match if the raw value already contains the prefix; otherwise leave
  // as title case for the form's free-text input.
  return v
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** "1" / "I" / "Sem 1" / "1st" / "Semester 1" → "Semester 1". */
export function normalizeSemester(raw: string | undefined | null): string {
  if (!raw) return "";
  const v = String(raw).trim();
  const romanMap: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8" };
  const lower = v.toLowerCase().replace(/\./g, "");
  if (romanMap[lower]) return `Semester ${romanMap[lower]}`;
  const m = v.match(/(\d+)/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 8) return `Semester ${n}`;
  }
  return "";
}

/** "2024-28" / "2024-2028" / "2024-29" → "2024-2028" (only if it matches one of the form's options). */
export function normalizeSession(raw: string | undefined | null): string {
  if (!raw) return "";
  const v = String(raw).trim().replace(/\s+/g, "");
  const m = v.match(/^(\d{4})\s*[-–]\s*(\d{2,4})$/);
  if (!m) return "";
  let start = parseInt(m[1], 10);
  let endRaw = m[2];
  let end = parseInt(endRaw, 10);
  if (endRaw.length === 2) end = Math.floor(start / 100) * 100 + end;
  const candidate = `${start}-${end}`;
  if (SESSION_OPTIONS.includes(candidate)) return candidate;
  // If end < start, treat as 4-year UG by default.
  if (end <= start) end = start + 4;
  const remap = `${start}-${end}`;
  return SESSION_OPTIONS.includes(remap) ? remap : "";
}

/** "MALE" / "m" → "Male". Anything else (incl. "Other"/"Trans") returns "". */
export function normalizeGender(raw: string | undefined | null): "Male" | "Female" | "" {
  if (!raw) return "";
  const v = String(raw).trim().toLowerCase();
  if (/^m(ale)?$/.test(v)) return "Male";
  if (/^f(emale)?$/.test(v)) return "Female";
  return "";
}

/** "ONLINE" / "offline" / "hybrid" → "Online" / "Offline" / "Hybrid". */
export function normalizeInternshipMode(raw: string | undefined | null): string {
  if (!raw) return "";
  const v = String(raw).trim().toLowerCase();
  if (v.startsWith("on")) return "Online";
  if (v.startsWith("off")) return "Offline";
  if (v.startsWith("hy") || v.startsWith("bl")) return "Hybrid";
  return "";
}

/**
 * Roll-number hints used by Marwari-style identifiers, e.g.
 *   "MWC/23-27/SEM I/ACC/35"  →  session 2023-2027, semester 1, subject ACC
 *   "MWC/24-28/SEM III/BOT/12" →  session 2024-2028, semester 3, subject BOT
 *
 * Returns whatever pieces it can confidently parse; missing pieces are "".
 */
export function parseRollNumberHints(raw: string | undefined | null): {
  session: string;
  semester: string;
  subjectCode: string;
} {
  const out = { session: "", semester: "", subjectCode: "" };
  if (!raw) return out;
  const v = String(raw).trim();

  // Session: NN-NN  (eg "23-27")
  const sMatch = v.match(/(\b\d{2})\s*[-–]\s*(\d{2}\b)/);
  if (sMatch) {
    out.session = normalizeSession(`20${sMatch[1]}-20${sMatch[2]}`);
  }

  // Semester: "SEM I", "SEM 3", "SEM-II"
  const semMatch = v.match(/sem(?:ester)?[\s\-_/]*([ivx]+|\d+)/i);
  if (semMatch) {
    out.semester = normalizeSemester(semMatch[1]);
  }

  // Subject code: a 2-6 letter alpha token in any segment. Pick the first
  // segment whose code maps to a known canonical subject. Common Marwari
  // roll patterns: "PSY/1", "ENG/2", "MWC/SEM I/ACC/35", "MWC/23-27/BOT/12".
  const segments = v.split(/[\s\-/]+/).filter(Boolean);
  for (const seg of segments) {
    if (!/^[A-Za-z]{2,6}$/.test(seg)) continue;
    if (subjectCodeToCanonical(seg)) {
      out.subjectCode = seg.toUpperCase();
      break;
    }
  }

  return out;
}

const SUBJECT_CODE_MAP: Record<string, { subject: string; department: string }> = {
  // B.Com
  ACC: { subject: "B.Com Accounting and Finance", department: "B.Com" },
  ACCO: { subject: "B.Com Accounting and Finance", department: "B.Com" },
  ACCT: { subject: "B.Com Accounting and Finance", department: "B.Com" },
  HRM: { subject: "B.Com (HRM)", department: "B.Com" },
  MKT: { subject: "B.Com (Marketing)", department: "B.Com" },
  MKTG: { subject: "B.Com (Marketing)", department: "B.Com" },
  // B.Sc
  BOT: { subject: "B.Sc (Botany)", department: "B.Sc" },
  CHE: { subject: "B.Sc (Chemistry)", department: "B.Sc" },
  CHEM: { subject: "B.Sc (Chemistry)", department: "B.Sc" },
  GEOL: { subject: "B.Sc (Geology)", department: "B.Sc" },
  GLG: { subject: "B.Sc (Geology)", department: "B.Sc" },
  MTH: { subject: "B.Sc (Mathematics)", department: "B.Sc" },
  MATH: { subject: "B.Sc (Mathematics)", department: "B.Sc" },
  PHY: { subject: "B.Sc (Physics)", department: "B.Sc" },
  ZOO: { subject: "B.Sc (Zoology)", department: "B.Sc" },
  // B.A.
  ENG: { subject: "B.A. (English)", department: "B.A." },
  HIN: { subject: "B.A. (Hindi)", department: "B.A." },
  HIS: { subject: "B.A. (History)", department: "B.A." },
  HIST: { subject: "B.A. (History)", department: "B.A." },
  POL: { subject: "B.A. (Political Science)", department: "B.A." },
  POLS: { subject: "B.A. (Political Science)", department: "B.A." },
  SOC: { subject: "B.A. (Sociology)", department: "B.A." },
  ECO: { subject: "B.A. (Economics)", department: "B.A." },
  PSY: { subject: "B.A. (Psychology)", department: "B.A." },
  PHI: { subject: "B.A. (Philosophy)", department: "B.A." },
  PHIL: { subject: "B.A. (Philosophy)", department: "B.A." },
  GEO: { subject: "B.A. (Geography)", department: "B.A." },
  SAN: { subject: "B.A. (Sanskrit)", department: "B.A." },
  SKT: { subject: "B.A. (Sanskrit)", department: "B.A." },
  URD: { subject: "B.A. (Urdu)", department: "B.A." },
  URDU: { subject: "B.A. (Urdu)", department: "B.A." },
  MAI: { subject: "B.A. (Maithili)", department: "B.A." },
  MAITH: { subject: "B.A. (Maithili)", department: "B.A." },
  PER: { subject: "B.A. (Persian)", department: "B.A." },
  BEN: { subject: "B.A. (Bengali)", department: "B.A." },
  HOM: { subject: "B.A. (Home Science)", department: "B.A." },
  HSC: { subject: "B.A. (Home Science)", department: "B.A." },
  BHO: { subject: "B.A. (Bhojpuri)", department: "B.A." },
  DRA: { subject: "B.A. (Dramatics)", department: "B.A." },
  DRAM: { subject: "B.A. (Dramatics)", department: "B.A." },
  LAW: { subject: "B.A. (Law)", department: "B.A." },
  LSW: { subject: "B.A. (LSW)", department: "B.A." },
  MUS: { subject: "B.A. (Music)", department: "B.A." },
  PAL: { subject: "B.A. (Pali)", department: "B.A." },
  PRA: { subject: "B.A. (Prakrit)", department: "B.A." },
  AIH: { subject: "B.A. (Ancient Indian History - AIH)", department: "B.A." },
  ARA: { subject: "B.A. (Arabic)", department: "B.A." },
  ANT: { subject: "B.A. (Anthropology)", department: "B.A." },
  ANTH: { subject: "B.A. (Anthropology)", department: "B.A." },
  RUR: { subject: "B.A. (Rural Economics)", department: "B.A." },
  STA: { subject: "B.A. (Statistics)", department: "B.A." },
  STAT: { subject: "B.A. (Statistics)", department: "B.A." },
};

/** Map a short subject code (eg "ACC", "BOT") to its canonical subject + dept. */
export function subjectCodeToCanonical(
  code: string | undefined | null
): { subject: string; department: string } | null {
  if (!code) return null;
  const key = String(code).trim().toUpperCase();
  return SUBJECT_CODE_MAP[key] || null;
}

/**
 * Derive a `Session N-NNNN` value from a date string in the CSV's Date column.
 * Most colleges treat July onward as the start of a new academic year, so:
 *   2023-07-05  →  2023-2027  (UG default = 4-year span)
 *   2024-01-15  →  2023-2027  (Jan still belongs to the year that started July)
 *   2025-07-15  →  2025-2029
 */
export function deriveSessionFromDate(raw: string | undefined | null): string {
  if (!raw) return "";
  const v = String(raw).trim();
  // Accept "YYYY-MM-DD", "DD/MM/YYYY", "DD-MM-YYYY", "MM/DD/YYYY".
  let year = 0;
  let month = 0;
  const ymd = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  const dmy = v.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (ymd) {
    year = parseInt(ymd[1], 10);
    month = parseInt(ymd[2], 10);
  } else if (dmy) {
    year = parseInt(dmy[3], 10);
    month = parseInt(dmy[1], 10);
  }
  if (!year || year < 2000) return "";

  // Pre-July counts as the previous academic year.
  const startYear = month >= 7 ? year : year - 1;
  return normalizeSession(`${startYear}-${startYear + 4}`);
}

/**
 * Anon-callable: returns at most one roster row when (college, email | phone)
 * matches uniquely. The caller must already know the email or phone.
 */
export async function matchCollegeRoster(
  collegeId: string,
  email: string,
  phone: string
): Promise<RosterMatchPayload> {
  if (!collegeId) return { status: "none" };
  const { data, error } = await supabase.rpc("match_college_roster", {
    p_college_id: collegeId,
    p_email: email || "",
    p_phone: normalisePhone(phone),
  });
  if (error) {
    console.warn("match_college_roster:", error.message);
    return { status: "none" };
  }
  return (data as RosterMatchPayload) ?? { status: "none" };
}
