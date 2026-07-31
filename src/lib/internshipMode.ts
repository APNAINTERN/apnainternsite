import { normalizeInternshipMode } from "@/lib/collegeRoster";
import { isBnmuStudent } from "@/lib/feeRules";
import { BNMU_INTERNSHIP_MODE } from "@/lib/internshipProgramme";

export const INTERNSHIP_MODE_FILTER_OPTIONS = [
  { value: "all", label: "All Modes" },
  { value: "Online", label: "Online" },
  { value: "Offline", label: "Offline" },
  { value: "Hybrid", label: "Hybrid" },
] as const;

export type InternshipModeFilter = (typeof INTERNSHIP_MODE_FILTER_OPTIONS)[number]["value"];

/** Resolved mode for a student or lead row (defaults to Online when unset). */
export function studentInternshipMode(row: {
  internship_mode?: unknown;
  metadata?: unknown;
  university_name?: unknown;
}): string {
  const meta =
    typeof row.metadata === "object" && row.metadata !== null && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const uni = String(row.university_name ?? meta.university_name ?? meta.university ?? "").trim();
  if (isBnmuStudent(uni)) return BNMU_INTERNSHIP_MODE;
  const raw = row.internship_mode ?? meta.internship_mode ?? meta.internshipMode;
  return normalizeInternshipMode(String(raw ?? "")) || "Online";
}

export function matchesInternshipModeFilter(
  row: {
    internship_mode?: unknown;
    metadata?: unknown;
    university_name?: unknown;
    beu_mode?: unknown;
  },
  modeFilter: string
): boolean {
  if (!modeFilter || modeFilter === "all") return true;
  if (row.beu_mode != null && String(row.beu_mode).trim()) {
    return String(row.beu_mode).trim() === modeFilter;
  }
  return studentInternshipMode(row) === modeFilter;
}
