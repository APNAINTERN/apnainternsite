import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveStorageUrl } from "@/lib/storageUrl";
import { updateOwnStudentProfile } from "@/lib/updateOwnStudentProfile";

export const CONSENT_LETTER_MAX_BYTES = 10 * 1024 * 1024;

const CONSENT_ACCEPT_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

export function getStudentConsentLetterUrl(student: {
  metadata?: Record<string, unknown> | string | null;
}): string | null {
  let meta: Record<string, unknown> | null = null;
  if (student.metadata && typeof student.metadata === "object" && !Array.isArray(student.metadata)) {
    meta = student.metadata as Record<string, unknown>;
  } else if (typeof student.metadata === "string" && student.metadata.trim()) {
    try {
      const parsed = JSON.parse(student.metadata) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        meta = parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  const url = meta?.consent_form_url;
  if (typeof url === "string" && url.trim()) return resolveStorageUrl(url.trim());
  return null;
}

export function getStudentLogbookUrl(student: {
  metadata?: Record<string, unknown> | null;
}): string | null {
  const meta = student.metadata || {};
  for (const key of ["logbook_url", "log_book_url", "internship_logbook_url"]) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return resolveStorageUrl(value.trim());
  }
  return null;
}

export function isAllowedConsentLetterFile(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  if (type && CONSENT_ACCEPT_MIME.has(type)) return true;
  return /\.(pdf|png|jpe?g|webp|gif)$/i.test(file.name || "");
}

function consentContentType(file: File, ext: string): string {
  const t = (file.type || "").toLowerCase();
  if (t && CONSENT_ACCEPT_MIME.has(t)) return t === "image/jpg" ? "image/jpeg" : t;
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
  };
  return map[ext.toLowerCase()] || "application/octet-stream";
}

export async function uploadConsentLetterToStorage(
  client: SupabaseClient,
  file: File,
  pathKey: string,
  opts?: { documentKind?: "consent" | "noc" }
): Promise<string> {
  const ext = (file.name.split(".").pop() || "pdf").replace(/[^a-zA-Z0-9]/g, "") || "pdf";
  // Avoid @ and other reserved chars — they commonly cause storage 400 InvalidKey.
  const safeKey = pathKey.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "upload";
  const prefix = opts?.documentKind === "noc" ? "noc" : "consent";
  const filePath = `${prefix}/${safeKey}-${Date.now()}.${ext}`;
  const contentType = consentContentType(file, ext);

  const errors: string[] = [];
  for (const bucket of ["consent-forms", "logos"] as const) {
    const { error } = await client.storage.from(bucket).upload(filePath, file, {
      upsert: false,
      contentType,
      cacheControl: "3600",
    });
    if (!error) {
      const { data } = client.storage.from(bucket).getPublicUrl(filePath);
      if (data?.publicUrl) return data.publicUrl;
      errors.push(`${bucket}: upload ok but public URL missing`);
      continue;
    }
    errors.push(`${bucket}: ${error.message || error.name || "upload failed"}`);
  }

  throw new Error(
    `Could not upload ${opts?.documentKind === "noc" ? "NoC" : "consent letter"}. ${errors.join(" | ")}`
  );
}

export async function saveStudentConsentLetter(
  client: SupabaseClient,
  userId: string,
  profile: Record<string, unknown> | null | undefined,
  file: File
): Promise<string> {
  if (file.size > CONSENT_LETTER_MAX_BYTES) {
    throw new Error("Consent letter must be 10 MB or smaller.");
  }
  if (!isAllowedConsentLetterFile(file)) {
    throw new Error("Use a PDF or image file (PNG, JPG, WEBP, GIF).");
  }

  const email = String(profile?.email || userId);
  const url = await uploadConsentLetterToStorage(client, file, email);
  const meta =
    profile?.metadata && typeof profile.metadata === "object" && !Array.isArray(profile.metadata)
      ? { ...(profile.metadata as Record<string, unknown>) }
      : {};

  await updateOwnStudentProfile(client, userId, {
    metadata: { ...meta, consent_form_url: url },
  });

  return url;
}

/** Admin Directory: attach/replace a student's consent letter (per-student metadata). */
export async function saveAdminStudentConsentLetter(
  client: SupabaseClient,
  student: {
    id: string;
    email?: string | null;
    metadata?: unknown;
  },
  file: File
): Promise<string> {
  if (file.size > CONSENT_LETTER_MAX_BYTES) {
    throw new Error("Consent letter must be 10 MB or smaller.");
  }
  if (!isAllowedConsentLetterFile(file)) {
    throw new Error("Use a PDF or image file (PNG, JPG, WEBP, GIF).");
  }

  let meta: Record<string, unknown> = {};
  const raw = student.metadata;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    meta = { ...(raw as Record<string, unknown>) };
  } else if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        meta = { ...(parsed as Record<string, unknown>) };
      }
    } catch {
      /* ignore */
    }
  }

  const email = String(student.email || student.id);
  const url = await uploadConsentLetterToStorage(client, file, email);
  const nextMeta = { ...meta, consent_form_url: url };

  const { error } = await client
    .from("students")
    .update({ metadata: nextMeta })
    .eq("id", student.id);
  if (error) {
    // RDS may store metadata as text
    const { error: err2 } = await client
      .from("students")
      .update({ metadata: JSON.stringify(nextMeta) })
      .eq("id", student.id);
    if (err2) throw err2;
  }

  return url;
}

function consentDownloadFilename(url: string, studentName: string): string {
  const extMatch = url.split("?")[0].match(/\.(pdf|png|jpe?g|webp|gif)$/i);
  const ext = extMatch ? extMatch[1].toLowerCase().replace("jpeg", "jpg") : "pdf";
  const safeName = studentName.replace(/\s+/g, "_").replace(/[^\w.-]/g, "") || "Student";
  return `Consent_Letter_${safeName}.${ext}`;
}

export async function downloadConsentLetterFile(
  url: string,
  studentName: string
): Promise<void> {
  const filename = consentDownloadFilename(url, studentName);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
