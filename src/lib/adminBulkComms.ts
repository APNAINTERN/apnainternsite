import { matchesInternshipModeFilter } from "@/lib/internshipMode";

export type CommsRecipient = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  user_email?: string | null;
  user_name?: string | null;
  college_name?: string | null;
  university_name?: string | null;
  internship_domain?: string | null;
  internship_mode?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** Domain for enrolled students or leads (payment metadata / draft payload). */
export function commsRecipientDomain(item: CommsRecipient): string {
  if (item.internship_domain?.trim()) return item.internship_domain.trim();
  const meta = item.metadata;
  if (!meta) return "";
  return String(
    meta.internship_domain ?? meta.domain ?? meta.course ?? ""
  ).trim();
}

type CollegeRow = { id: string; name: string; university_id: string };
type UniRow = { id: string; name: string };

export function filterCommsRecipients(
  list: CommsRecipient[],
  opts: {
    uniFilters: string[];
    collegeFilters: string[];
    domainFilter: string;
    modeFilter: string;
    colleges: CollegeRow[];
    unis: UniRow[];
    type: "enrolled" | "unenrolled";
  }
): CommsRecipient[] {
  let result = list;

  if (opts.domainFilter !== "all") {
    result = result.filter((s) => commsRecipientDomain(s) === opts.domainFilter);
  }

  if (opts.modeFilter !== "all") {
    result = result.filter((s) => matchesInternshipModeFilter(s, opts.modeFilter));
  }

  if (opts.uniFilters.length > 0) {
    const uniIds = opts.unis.filter((u) => opts.uniFilters.includes(u.name)).map((u) => u.id);
    const collegeNames = opts.colleges
      .filter((c) => uniIds.includes(c.university_id))
      .map((c) => c.name);

    if (opts.type === "enrolled") {
      result = result.filter(
        (s) =>
          (s.university_name != null && opts.uniFilters.includes(s.university_name)) ||
          (s.college_name != null && collegeNames.includes(s.college_name))
      );
    } else {
      result = result.filter((s) => {
        const meta = s.metadata;
        const college = String(meta?.college ?? meta?.college_name ?? "");
        const uni = String(meta?.university ?? meta?.university_name ?? "");
        return opts.uniFilters.includes(uni) || collegeNames.includes(college);
      });
    }
  }

  if (opts.collegeFilters.length > 0) {
    if (opts.type === "enrolled") {
      result = result.filter(
        (s) => s.college_name != null && opts.collegeFilters.includes(s.college_name)
      );
    } else {
      result = result.filter((s) => {
        const meta = s.metadata;
        const college = String(meta?.college ?? meta?.college_name ?? "");
        return opts.collegeFilters.includes(college);
      });
    }
  }

  return result;
}

export function searchCommsRecipients(list: CommsRecipient[], term: string): CommsRecipient[] {
  const t = term.trim().toLowerCase();
  if (!t) return list;
  return list.filter((s) => {
    const name = (s.full_name || s.user_name || "").toLowerCase();
    const email = (s.email || s.user_email || "").toLowerCase();
    return name.includes(t) || email.includes(t);
  });
}
