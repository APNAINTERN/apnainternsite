import { studentInternshipMode } from "@/lib/internshipMode";

export type ClassLinkRow = {
  id?: string;
  title?: string | null;
  description?: string | null;
  link_type?: string | null;
  url?: string | null;
  scheduled_at?: string | null;
  domain_id?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  target_universities?: string[] | null;
  target_colleges?: string[] | null;
  target_domains?: string[] | null;
  target_modes?: string[] | null;
  internship_domains?: { name?: string | null } | null;
};

export type ClassTargetFilters = {
  /** Empty = all universities */
  universities: string[];
  /** Empty = all colleges (scoped to selected universities when any) */
  colleges: string[];
  domain: string;
  mode: string;
};

export const emptyClassTargetFilters = (): ClassTargetFilters => ({
  universities: [],
  colleges: [],
  domain: "all",
  mode: "all",
});

export function collegesForUniversityNames(
  colleges: CollegeRow[],
  unis: UniRow[],
  universityNames: string[]
): CollegeRow[] {
  if (universityNames.length === 0) return colleges;
  return colleges.filter((c) =>
    universityNames.includes(unis.find((u) => u.id === c.university_id)?.name || "")
  );
}

export function pruneCollegesForUniversities(
  colleges: CollegeRow[],
  unis: UniRow[],
  universityNames: string[],
  selectedCollegeNames: string[]
): string[] {
  const allowed = collegesForUniversityNames(colleges, unis, universityNames).map((c) => c.name);
  return selectedCollegeNames.filter((n) => allowed.includes(n));
}

export type ClassTargetStudent = {
  university_name?: string | null;
  college_name?: string | null;
  internship_domain?: string | null;
  course?: string | null;
  internship_mode?: string | null;
  metadata?: Record<string, unknown> | null;
};

type CollegeRow = { id: string; name: string; university_id: string };
type UniRow = { id: string; name: string };

function hasValues(values?: string[] | null): boolean {
  return Array.isArray(values) && values.length > 0;
}

export function filtersToTargetArrays(filters: ClassTargetFilters): {
  target_universities: string[] | null;
  target_colleges: string[] | null;
  target_domains: string[] | null;
  target_modes: string[] | null;
} {
  return {
    target_universities: filters.universities.length > 0 ? filters.universities : null,
    target_colleges: filters.colleges.length > 0 ? filters.colleges : null,
    target_domains: filters.domain !== "all" ? [filters.domain] : null,
    target_modes: filters.mode !== "all" ? [filters.mode] : null,
  };
}

export function describeClassTargets(
  cls: Pick<
    ClassLinkRow,
    "target_universities" | "target_colleges" | "target_domains" | "target_modes" | "domain_id" | "internship_domains"
  >
): string {
  const parts: string[] = [];
  if (hasValues(cls.target_universities)) {
    parts.push(`Universities: ${cls.target_universities!.join(", ")}`);
  }
  if (hasValues(cls.target_colleges)) {
    parts.push(`Colleges: ${cls.target_colleges!.join(", ")}`);
  }
  if (hasValues(cls.target_domains)) {
    parts.push(`Domains: ${cls.target_domains!.join(", ")}`);
  } else if (cls.domain_id && cls.internship_domains?.name) {
    parts.push(`Domain: ${cls.internship_domains.name}`);
  }
  if (hasValues(cls.target_modes)) {
    parts.push(`Modes: ${cls.target_modes!.join(", ")}`);
  }
  return parts.length ? parts.join(" · ") : "All students";
}

/** One-line label for table cells (avoids long target text in rows). */
export function classTargetSummaryShort(
  cls: Pick<
    ClassLinkRow,
    "target_universities" | "target_colleges" | "target_domains" | "target_modes" | "domain_id" | "internship_domains"
  >
): string {
  const uniCount = cls.target_universities?.length ?? 0;
  const collegeCount = cls.target_colleges?.length ?? 0;
  const domainCount =
    cls.target_domains?.length ?? (cls.domain_id && cls.internship_domains?.name ? 1 : 0);
  const modeCount = cls.target_modes?.length ?? 0;

  if (uniCount === 0 && collegeCount === 0 && domainCount === 0 && modeCount === 0) {
    return "All students";
  }

  const parts: string[] = [];
  if (uniCount) parts.push(`${uniCount} university${uniCount === 1 ? "" : "ies"}`);
  if (collegeCount) parts.push(`${collegeCount} college${collegeCount === 1 ? "" : "s"}`);
  if (domainCount) parts.push(`${domainCount} domain${domainCount === 1 ? "" : "s"}`);
  if (modeCount) parts.push(`${modeCount} mode${modeCount === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

export function classRowToFilters(cls: ClassLinkRow): ClassTargetFilters {
  return {
    universities: cls.target_universities ?? [],
    colleges: cls.target_colleges ?? [],
    domain: cls.target_domains?.[0] || cls.internship_domains?.name || "all",
    mode: cls.target_modes?.[0] || "all",
  };
}

export function studentMatchesClassTargets(
  student: ClassTargetStudent,
  cls: Pick<
    ClassLinkRow,
    "target_universities" | "target_colleges" | "target_domains" | "target_modes" | "domain_id" | "internship_domains"
  >,
  opts?: { colleges?: CollegeRow[]; unis?: UniRow[] }
): boolean {
  const universities = cls.target_universities;
  const colleges = cls.target_colleges;
  const domains = cls.target_domains;
  const modes = cls.target_modes;

  if (
    !hasValues(universities) &&
    !hasValues(colleges) &&
    !hasValues(domains) &&
    !hasValues(modes) &&
    !cls.domain_id
  ) {
    return true;
  }

  if (hasValues(modes)) {
    if (!modes!.includes(studentInternshipMode(student))) return false;
  }

  const studentDomain = (student.internship_domain || student.course || "").trim();
  if (hasValues(domains)) {
    if (!domains!.includes(studentDomain)) return false;
  } else if (cls.domain_id && cls.internship_domains?.name) {
    if (studentDomain !== cls.internship_domains.name) return false;
  }

  if (hasValues(colleges)) {
    if (!colleges!.includes((student.college_name || "").trim())) return false;
  }

  if (hasValues(universities)) {
    const uniNames = universities!;
    const studentUni = (student.university_name || "").trim();
    if (uniNames.includes(studentUni)) return true;

    const collegeNames =
      opts?.colleges && opts?.unis
        ? opts.colleges
            .filter((c) =>
              opts.unis!.some((u) => u.id === c.university_id && uniNames.includes(u.name))
            )
            .map((c) => c.name)
        : [];

    if (!collegeNames.includes((student.college_name || "").trim())) {
      return false;
    }
  }

  return true;
}

export function countStudentsForClassTargets(
  students: ClassTargetStudent[],
  filters: ClassTargetFilters,
  opts?: { colleges?: CollegeRow[]; unis?: UniRow[] }
): number {
  const target = filtersToTargetArrays(filters);
  const pseudoClass = {
    target_universities: target.target_universities,
    target_colleges: target.target_colleges,
    target_domains: target.target_domains,
    target_modes: target.target_modes,
    domain_id: null,
    internship_domains: null,
  };
  return students.filter((s) => studentMatchesClassTargets(s, pseudoClass, opts)).length;
}

/** Filter admin listing rows (classes, uploads) by audience + optional title search. */
export function rowMatchesAudienceListFilters(
  row: Pick<
    ClassLinkRow,
    "target_universities" | "target_colleges" | "target_domains" | "target_modes" | "title"
  >,
  filters: ClassTargetFilters,
  searchTerm = ""
): boolean {
  const q = searchTerm.trim().toLowerCase();
  if (q && !(row.title || "").toLowerCase().includes(q)) return false;

  if (filters.universities.length) {
    const targets = row.target_universities;
    if (targets?.length && !filters.universities.some((u) => targets.includes(u))) return false;
  }
  if (filters.colleges.length) {
    const targets = row.target_colleges;
    if (targets?.length && !filters.colleges.some((c) => targets.includes(c))) return false;
  }
  if (filters.domain !== "all") {
    const targets = row.target_domains;
    if (targets?.length && !targets.includes(filters.domain)) return false;
  }
  if (filters.mode !== "all") {
    const targets = row.target_modes;
    if (targets?.length && !targets.includes(filters.mode)) return false;
  }
  return true;
}

export function inferLinkTypeFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
  if (lower.includes("zoom.us") || lower.includes("zoom.com")) return "zoom";
  if (lower.includes("teams.microsoft.com") || lower.includes("teams.live.com")) return "teams";
  if (lower.includes("meet.google.com")) return "meet";
  return "url";
}

/** Resolve YouTube video id from common URL shapes. */
export function youtubeVideoId(url: string): string | null {
  const u = (url || "").trim();
  if (!u) return null;
  try {
    const parsed = new URL(u.startsWith("http") ? u : `https://${u}`);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace(/^\//, "").split("/")[0] || null;
    }
    const v = parsed.searchParams.get("v");
    if (v) return v;
    const embed = parsed.pathname.match(/\/embed\/([^/?#]+)/);
    if (embed?.[1]) return embed[1];
    const live = parsed.pathname.match(/\/live\/([^/?#]+)/);
    if (live?.[1]) return live[1];
  } catch {
    /* fall through */
  }
  if (u.includes("watch?v=")) return u.split("watch?v=")[1]?.split(/[?&#]/)[0] || null;
  if (u.includes("youtu.be/")) return u.split("youtu.be/")[1]?.split(/[?&#]/)[0] || null;
  return null;
}

/** Open in browser — watch/live page, not embed. */
export function classJoinUrl(url: string, linkType?: string | null): string {
  const u = (url || "").trim();
  if (!u) return "#";
  const type = linkType || inferLinkTypeFromUrl(u);
  if (type === "youtube") {
    const id = youtubeVideoId(u);
    if (id) return `https://www.youtube.com/watch?v=${id}`;
    return u.startsWith("http") ? u : `https://${u}`;
  }
  return u.startsWith("http") ? u : `https://${u}`;
}

/** iframe src for in-dashboard preview */
export function youtubeEmbedUrl(url: string): string {
  const id = youtubeVideoId(url);
  if (id) return `https://www.youtube.com/embed/${id}`;
  const u = (url || "").trim();
  if (u.includes("watch?v=")) return u.replace("watch?v=", "embed/");
  if (u.includes("youtu.be/")) {
    const fallbackId = u.split("youtu.be/")[1]?.split(/[?&#]/)[0];
    return fallbackId ? `https://www.youtube.com/embed/${fallbackId}` : u;
  }
  return u;
}

export function linkTypeLabel(linkType?: string | null): string {
  switch (linkType) {
    case "youtube":
      return "YouTube";
    case "meet":
      return "Google Meet";
    case "zoom":
      return "Zoom";
    case "teams":
      return "Microsoft Teams";
    case "url":
      return "Class Link";
    default:
      return "Session";
  }
}

export function toDatetimeLocalValue(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
