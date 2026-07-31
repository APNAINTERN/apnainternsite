/** Parse json/jsonb columns that RDS may return as strings. */
export function parseJsonField(val: unknown): Record<string, unknown> {
  if (val == null) return {};
  if (typeof val === "object" && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  if (typeof val === "string") {
    const t = val.trim();
    if (!t) return {};
    try {
      const parsed = JSON.parse(t) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}
