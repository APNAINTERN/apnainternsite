/**
 * Display names for colleges (DB may store long formal titles).
 */

/** LNMU: "Prof. Chandra Shekhar Jha … PDKJ …" → "PDKJ College". */
export function displayCollegeName(name: string | null | undefined): string {
  if (!name) return "";
  const n = String(name).trim();
  if (!n) return "";

  if (/prof\.?\s*chandra\s*shekhar\s*jha/i.test(n) && /pdkj/i.test(n)) {
    return "PDKJ College";
  }

  const stripped = n
    .replace(/^prof\.?\s*chandra\s*shekhar\s*jha[\s,:-]*/i, "")
    .trim();
  if (/^pdkj(\s+college)?$/i.test(stripped)) {
    return "PDKJ College";
  }

  return n;
}
