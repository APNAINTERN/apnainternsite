/** Server-side helpers for API/INT/{year}/{5-digit seq} enrollment IDs. */

export const REGISTRATION_ID_PENDING_SUFFIX = "PENDING";

export function formatRegistrationId(year: number, seq: number): string {
  return `API/INT/${year}/${String(seq).padStart(5, "0")}`;
}

export function parseNewFormatRegistrationSeq(
  regId: string | null | undefined,
  year?: number
): number | null {
  const r = String(regId ?? "").trim();
  const match = r.match(/^API\/INT\/(\d{4})\/(\d+)$/i);
  if (!match) return null;
  const y = parseInt(match[1], 10);
  if (year != null && y !== year) return null;
  const seq = parseInt(match[2], 10);
  return Number.isFinite(seq) && seq > 0 ? seq : null;
}

export function maxNewFormatSeq(
  rows: Array<{ registration_id?: string | null }>,
  year: number
): number {
  let max = 0;
  for (const row of rows) {
    const seq = parseNewFormatRegistrationSeq(row.registration_id, year);
    if (seq != null && seq > max) max = seq;
  }
  return max;
}

export function nextRegistrationIdFromRows(
  rows: Array<{ registration_id?: string | null }>,
  year?: number
): string {
  const currentYear = year ?? new Date().getFullYear();
  const max = maxNewFormatSeq(rows, currentYear);
  return formatRegistrationId(currentYear, max + 1);
}

export function bumpRegistrationId(regId: string): string {
  const parts = String(regId).trim().split("/");
  if (parts.length === 4 && parts[0] === "API" && parts[1] === "INT") {
    const year = parseInt(parts[2], 10);
    const seq = parseInt(parts[3], 10);
    if (Number.isFinite(year) && Number.isFinite(seq)) {
      return formatRegistrationId(year, seq + 1);
    }
  }
  return formatRegistrationId(new Date().getFullYear(), 1);
}
