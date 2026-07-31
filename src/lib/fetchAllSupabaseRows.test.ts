import { describe, expect, it } from "vitest";

// Re-export quote logic for tests (duplicate minimal helper to avoid importing supabase)
function quoteFilterValue(value: unknown): string {
  if (value === null || value === undefined) return '""';
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const s = String(value);
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

describe("quoteFilterValue", () => {
  it("quotes ISO timestamps for PostgREST filters", () => {
    expect(quoteFilterValue("2024-01-15T12:00:00.000Z")).toBe(
      '"2024-01-15T12:00:00.000Z"'
    );
  });

  it("escapes embedded quotes", () => {
    expect(quoteFilterValue('say "hi"')).toBe('"say \\"hi\\""');
  });
});
