/** Surface PostgREST / plain-object errors in UI toasts. */
export function formatUnknownError(err: unknown, fallback = "Something went wrong."): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err && typeof err === "object") {
    const o = err as { message?: unknown; error_description?: unknown; code?: unknown };
    const msg = String(o.message || o.error_description || "").trim();
    if (msg) {
      const code = o.code != null ? String(o.code).trim() : "";
      return code && !msg.includes(code) ? `${msg} (${code})` : msg;
    }
  }
  return fallback;
}
