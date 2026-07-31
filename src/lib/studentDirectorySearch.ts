import type { PostgrestFilterBuilder } from "@supabase/postgrest-js";

/** Strip characters that break PostgREST `.or()` / `ilike` filters. */
export function sanitizeStudentSearchTerm(raw: string): string {
  return raw.replace(/[%_,]/g, " ").replace(/\s+/g, " ").trim();
}

/** Apply name/email/ID search across student directory columns. */
export function applyStudentDirectorySearch<T extends PostgrestFilterBuilder<any, any, any, any[], string, unknown, "GET">>(
  query: T,
  rawTerm: string
): T {
  const term = sanitizeStudentSearchTerm(rawTerm);
  if (!term) return query;

  const escaped = term.replace(/"/g, '\\"');
  const pattern = `%${escaped}%`;

  return query.or(
    [
      `full_name.ilike."${pattern}"`,
      `email.ilike."${pattern}"`,
      `registration_id.ilike."${pattern}"`,
      `contact_number.ilike."${pattern}"`,
      `roll_number.ilike."${pattern}"`,
      `college_name.ilike."${pattern}"`,
      `parent_name.ilike."${pattern}"`,
    ].join(",")
  ) as T;
}
