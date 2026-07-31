import type { SupabaseClient } from "@supabase/supabase-js";
import { publicStorageObjectUrl, resolveStorageUrl } from "@/lib/storageUrl";

const CMS_BUCKET = "logos";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export type SocialLinks = {
  linkedin?: string;
  twitter?: string;
  instagram?: string;
  facebook?: string;
  youtube?: string;
  website?: string;
};

export type SiteSampleCertificate = {
  id: string;
  title: string;
  description?: string | null;
  file_url: string;
  file_path?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  sort_order: number;
  is_active: boolean;
  created_at?: string | null;
};

export type SiteExpertMember = {
  id: string;
  full_name: string;
  designation: string;
  title: string;
  bio?: string | null;
  photo_url?: string | null;
  photo_path?: string | null;
  social_links: SocialLinks;
  sort_order: number;
  is_active: boolean;
  created_at?: string | null;
};

export type SiteMou = {
  id: string;
  org_name: string;
  description?: string | null;
  logo_url?: string | null;
  logo_path?: string | null;
  website_url?: string | null;
  sort_order: number;
  is_active: boolean;
  created_at?: string | null;
};

export type SiteOfflineProgram = {
  id: string;
  title: string;
  description?: string | null;
  duration?: string | null;
  location?: string | null;
  highlights: string[];
  image_url?: string | null;
  image_path?: string | null;
  sort_order: number;
  is_active: boolean;
  created_at?: string | null;
};

export type SiteTestimonial = {
  id: string;
  full_name: string;
  designation?: string | null;
  review: string;
  rating: number;
  photo_url?: string | null;
  photo_path?: string | null;
  sort_order: number;
  is_active: boolean;
  created_at?: string | null;
};

function resolveMediaUrl(
  bucket: string,
  path: string | null | undefined,
  url: string | null | undefined
): string {
  if (path && String(path).trim()) {
    return publicStorageObjectUrl(bucket, String(path)) || resolveStorageUrl(url || "") || url || "";
  }
  return resolveStorageUrl(url || "") || url || "";
}

function asStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x || "").trim()).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return asStringArray(parsed);
    } catch {
      return raw
        .split(/\n|,/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function asSocialLinks(raw: unknown): SocialLinks {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as SocialLinks;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as SocialLinks;
    } catch {
      /* ignore */
    }
  }
  return {};
}

async function uploadCmsFile(
  client: SupabaseClient,
  folder: string,
  file: File,
  userId: string,
  opts?: { imagesOnly?: boolean; allowPdf?: boolean }
): Promise<{ path: string; url: string; mime: string; name: string }> {
  const imagesOnly = opts?.imagesOnly !== false && !opts?.allowPdf;
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  if (imagesOnly && !isImage) throw new Error("Please upload an image (JPG, PNG, WebP).");
  if (opts?.allowPdf && !isImage && !isPdf) throw new Error("Please upload an image or PDF.");
  if (isImage && file.size > MAX_IMAGE_BYTES) throw new Error("Image must be 8 MB or smaller.");
  if (isPdf && file.size > MAX_FILE_BYTES) throw new Error("PDF must be 20 MB or smaller.");

  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `home-cms/${folder}/${userId}/${Date.now()}-${safeName}`;
  const { error: upErr } = await client.storage.from(CMS_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (upErr) {
    if (/bucket not found/i.test(upErr.message)) {
      throw new Error('Storage bucket "logos" is missing. Run npm run aws:s3:provision.');
    }
    throw upErr;
  }
  const { data: pub } = client.storage.from(CMS_BUCKET).getPublicUrl(path);
  const url =
    publicStorageObjectUrl(CMS_BUCKET, path) ||
    resolveStorageUrl(pub.publicUrl) ||
    pub.publicUrl;
  return { path, url, mime: file.type || (isPdf ? "application/pdf" : "image/*"), name: file.name };
}

async function removeStoragePath(client: SupabaseClient, path?: string | null) {
  if (path) await client.storage.from(CMS_BUCKET).remove([path]);
}

function uuidOrNull(id: string | null | undefined) {
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

// ── Sample certificates ──────────────────────────────────────────────────────

function mapSampleCert(row: Record<string, unknown>): SiteSampleCertificate {
  return {
    id: String(row.id),
    title: String(row.title || ""),
    description: (row.description as string) || null,
    file_url: resolveMediaUrl(CMS_BUCKET, row.file_path as string, row.file_url as string),
    file_path: (row.file_path as string) || null,
    file_name: (row.file_name as string) || null,
    mime_type: (row.mime_type as string) || null,
    sort_order: Number(row.sort_order) || 0,
    is_active: row.is_active !== false,
    created_at: (row.created_at as string) || null,
  };
}

export async function fetchPublicSampleCertificates(client: SupabaseClient) {
  const { data, error } = await client
    .from("site_sample_certificates")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map(mapSampleCert);
}

export async function fetchAdminSampleCertificates(client: SupabaseClient) {
  const { data, error } = await client
    .from("site_sample_certificates")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map(mapSampleCert);
}

export async function uploadSampleCertificate(
  client: SupabaseClient,
  file: File,
  userId: string,
  meta: { title: string; description?: string; sortOrder?: number }
) {
  const up = await uploadCmsFile(client, "sample-certs", file, userId, {
    imagesOnly: false,
    allowPdf: true,
  });
  const { data, error } = await client
    .from("site_sample_certificates")
    .insert({
      title: meta.title.trim() || file.name,
      description: meta.description?.trim() || null,
      file_url: up.url,
      file_path: up.path,
      file_name: up.name,
      mime_type: up.mime,
      sort_order: meta.sortOrder ?? 0,
      is_active: true,
      created_by: uuidOrNull(userId),
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapSampleCert(data as Record<string, unknown>);
}

export async function updateSampleCertificate(
  client: SupabaseClient,
  id: string,
  patch: Partial<{
    title: string;
    description: string | null;
    sort_order: number;
    is_active: boolean;
  }>
) {
  const { error } = await client
    .from("site_sample_certificates")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteSampleCertificate(client: SupabaseClient, row: SiteSampleCertificate) {
  await removeStoragePath(client, row.file_path);
  const { error } = await client.from("site_sample_certificates").delete().eq("id", row.id);
  if (error) throw error;
}

// ── Expert team ──────────────────────────────────────────────────────────────

function mapExpert(row: Record<string, unknown>): SiteExpertMember {
  return {
    id: String(row.id),
    full_name: String(row.full_name || ""),
    designation: String(row.designation || ""),
    title: String(row.title || ""),
    bio: (row.bio as string) || null,
    photo_url: resolveMediaUrl(CMS_BUCKET, row.photo_path as string, row.photo_url as string) || null,
    photo_path: (row.photo_path as string) || null,
    social_links: asSocialLinks(row.social_links),
    sort_order: Number(row.sort_order) || 0,
    is_active: row.is_active !== false,
    created_at: (row.created_at as string) || null,
  };
}

export async function fetchPublicExpertTeam(client: SupabaseClient) {
  const { data, error } = await client
    .from("site_expert_team")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map(mapExpert);
}

export async function fetchAdminExpertTeam(client: SupabaseClient) {
  const { data, error } = await client
    .from("site_expert_team")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map(mapExpert);
}

export async function createExpertMember(
  client: SupabaseClient,
  userId: string,
  meta: {
    full_name: string;
    designation: string;
    title: string;
    bio?: string;
    social_links?: SocialLinks;
    sortOrder?: number;
    file?: File | null;
  }
) {
  let photo_url: string | null = null;
  let photo_path: string | null = null;
  if (meta.file) {
    const up = await uploadCmsFile(client, "team", meta.file, userId, { imagesOnly: true });
    photo_url = up.url;
    photo_path = up.path;
  }
  const { data, error } = await client
    .from("site_expert_team")
    .insert({
      full_name: meta.full_name.trim(),
      designation: meta.designation.trim(),
      title: meta.title.trim(),
      bio: meta.bio?.trim() || null,
      photo_url,
      photo_path,
      social_links: meta.social_links || {},
      sort_order: meta.sortOrder ?? 0,
      is_active: true,
      created_by: uuidOrNull(userId),
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapExpert(data as Record<string, unknown>);
}

export async function updateExpertMember(
  client: SupabaseClient,
  id: string,
  patch: Partial<{
    full_name: string;
    designation: string;
    title: string;
    bio: string | null;
    social_links: SocialLinks;
    sort_order: number;
    is_active: boolean;
    photo_url: string | null;
    photo_path: string | null;
  }>
) {
  const { error } = await client
    .from("site_expert_team")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function replaceExpertPhoto(
  client: SupabaseClient,
  row: SiteExpertMember,
  file: File,
  userId: string
) {
  const up = await uploadCmsFile(client, "team", file, userId, { imagesOnly: true });
  await removeStoragePath(client, row.photo_path);
  await updateExpertMember(client, row.id, { photo_url: up.url, photo_path: up.path });
}

export async function deleteExpertMember(client: SupabaseClient, row: SiteExpertMember) {
  await removeStoragePath(client, row.photo_path);
  const { error } = await client.from("site_expert_team").delete().eq("id", row.id);
  if (error) throw error;
}

// ── MOUs ─────────────────────────────────────────────────────────────────────

function mapMou(row: Record<string, unknown>): SiteMou {
  return {
    id: String(row.id),
    org_name: String(row.org_name || ""),
    description: (row.description as string) || null,
    logo_url: resolveMediaUrl(CMS_BUCKET, row.logo_path as string, row.logo_url as string) || null,
    logo_path: (row.logo_path as string) || null,
    website_url: (row.website_url as string) || null,
    sort_order: Number(row.sort_order) || 0,
    is_active: row.is_active !== false,
    created_at: (row.created_at as string) || null,
  };
}

export async function fetchPublicMous(client: SupabaseClient) {
  const { data, error } = await client
    .from("site_mous")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map(mapMou);
}

export async function fetchAdminMous(client: SupabaseClient) {
  const { data, error } = await client
    .from("site_mous")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map(mapMou);
}

export async function createMou(
  client: SupabaseClient,
  userId: string,
  meta: {
    org_name: string;
    description?: string;
    website_url?: string;
    sortOrder?: number;
    file?: File | null;
  }
) {
  let logo_url: string | null = null;
  let logo_path: string | null = null;
  if (meta.file) {
    const up = await uploadCmsFile(client, "mou", meta.file, userId, { imagesOnly: true });
    logo_url = up.url;
    logo_path = up.path;
  }
  const { data, error } = await client
    .from("site_mous")
    .insert({
      org_name: meta.org_name.trim(),
      description: meta.description?.trim() || null,
      website_url: meta.website_url?.trim() || null,
      logo_url,
      logo_path,
      sort_order: meta.sortOrder ?? 0,
      is_active: true,
      created_by: uuidOrNull(userId),
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapMou(data as Record<string, unknown>);
}

export async function updateMou(
  client: SupabaseClient,
  id: string,
  patch: Partial<{
    org_name: string;
    description: string | null;
    website_url: string | null;
    sort_order: number;
    is_active: boolean;
    logo_url: string | null;
    logo_path: string | null;
  }>
) {
  const { error } = await client
    .from("site_mous")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function replaceMouLogo(
  client: SupabaseClient,
  row: SiteMou,
  file: File,
  userId: string
) {
  const up = await uploadCmsFile(client, "mou", file, userId, { imagesOnly: true });
  await removeStoragePath(client, row.logo_path);
  await updateMou(client, row.id, { logo_url: up.url, logo_path: up.path });
}

export async function deleteMou(client: SupabaseClient, row: SiteMou) {
  await removeStoragePath(client, row.logo_path);
  const { error } = await client.from("site_mous").delete().eq("id", row.id);
  if (error) throw error;
}

// ── Offline programs ─────────────────────────────────────────────────────────

function mapOffline(row: Record<string, unknown>): SiteOfflineProgram {
  return {
    id: String(row.id),
    title: String(row.title || ""),
    description: (row.description as string) || null,
    duration: (row.duration as string) || null,
    location: (row.location as string) || null,
    highlights: asStringArray(row.highlights),
    image_url: resolveMediaUrl(CMS_BUCKET, row.image_path as string, row.image_url as string) || null,
    image_path: (row.image_path as string) || null,
    sort_order: Number(row.sort_order) || 0,
    is_active: row.is_active !== false,
    created_at: (row.created_at as string) || null,
  };
}

export async function fetchPublicOfflinePrograms(client: SupabaseClient) {
  const { data, error } = await client
    .from("site_offline_programs")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map(mapOffline);
}

export async function fetchAdminOfflinePrograms(client: SupabaseClient) {
  const { data, error } = await client
    .from("site_offline_programs")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map(mapOffline);
}

export async function createOfflineProgram(
  client: SupabaseClient,
  userId: string,
  meta: {
    title: string;
    description?: string;
    duration?: string;
    location?: string;
    highlights?: string[];
    sortOrder?: number;
    file?: File | null;
  }
) {
  let image_url: string | null = null;
  let image_path: string | null = null;
  if (meta.file) {
    const up = await uploadCmsFile(client, "offline", meta.file, userId, { imagesOnly: true });
    image_url = up.url;
    image_path = up.path;
  }
  const { data, error } = await client
    .from("site_offline_programs")
    .insert({
      title: meta.title.trim(),
      description: meta.description?.trim() || null,
      duration: meta.duration?.trim() || null,
      location: meta.location?.trim() || null,
      highlights: meta.highlights || [],
      image_url,
      image_path,
      sort_order: meta.sortOrder ?? 0,
      is_active: true,
      created_by: uuidOrNull(userId),
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapOffline(data as Record<string, unknown>);
}

export async function updateOfflineProgram(
  client: SupabaseClient,
  id: string,
  patch: Partial<{
    title: string;
    description: string | null;
    duration: string | null;
    location: string | null;
    highlights: string[];
    sort_order: number;
    is_active: boolean;
    image_url: string | null;
    image_path: string | null;
  }>
) {
  const { error } = await client
    .from("site_offline_programs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function replaceOfflineImage(
  client: SupabaseClient,
  row: SiteOfflineProgram,
  file: File,
  userId: string
) {
  const up = await uploadCmsFile(client, "offline", file, userId, { imagesOnly: true });
  await removeStoragePath(client, row.image_path);
  await updateOfflineProgram(client, row.id, { image_url: up.url, image_path: up.path });
}

export async function deleteOfflineProgram(client: SupabaseClient, row: SiteOfflineProgram) {
  await removeStoragePath(client, row.image_path);
  const { error } = await client.from("site_offline_programs").delete().eq("id", row.id);
  if (error) throw error;
}

// ── Testimonials ─────────────────────────────────────────────────────────────

function mapTestimonial(row: Record<string, unknown>): SiteTestimonial {
  return {
    id: String(row.id),
    full_name: String(row.full_name || ""),
    designation: (row.designation as string) || null,
    review: String(row.review || ""),
    rating: Math.min(5, Math.max(1, Number(row.rating) || 5)),
    photo_url: resolveMediaUrl(CMS_BUCKET, row.photo_path as string, row.photo_url as string) || null,
    photo_path: (row.photo_path as string) || null,
    sort_order: Number(row.sort_order) || 0,
    is_active: row.is_active !== false,
    created_at: (row.created_at as string) || null,
  };
}

export async function fetchPublicTestimonials(client: SupabaseClient) {
  const { data, error } = await client
    .from("site_testimonials")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map(mapTestimonial);
}

export async function fetchAdminTestimonials(client: SupabaseClient) {
  const { data, error } = await client
    .from("site_testimonials")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map(mapTestimonial);
}

export async function createTestimonial(
  client: SupabaseClient,
  userId: string,
  meta: {
    full_name: string;
    designation?: string;
    review: string;
    rating: number;
    sortOrder?: number;
    file?: File | null;
  }
) {
  let photo_url: string | null = null;
  let photo_path: string | null = null;
  if (meta.file) {
    const up = await uploadCmsFile(client, "testimonials", meta.file, userId, { imagesOnly: true });
    photo_url = up.url;
    photo_path = up.path;
  }
  const { data, error } = await client
    .from("site_testimonials")
    .insert({
      full_name: meta.full_name.trim(),
      designation: meta.designation?.trim() || null,
      review: meta.review.trim(),
      rating: Math.min(5, Math.max(1, meta.rating || 5)),
      photo_url,
      photo_path,
      sort_order: meta.sortOrder ?? 0,
      is_active: true,
      created_by: uuidOrNull(userId),
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapTestimonial(data as Record<string, unknown>);
}

export async function updateTestimonial(
  client: SupabaseClient,
  id: string,
  patch: Partial<{
    full_name: string;
    designation: string | null;
    review: string;
    rating: number;
    sort_order: number;
    is_active: boolean;
    photo_url: string | null;
    photo_path: string | null;
  }>
) {
  const { error } = await client
    .from("site_testimonials")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function replaceTestimonialPhoto(
  client: SupabaseClient,
  row: SiteTestimonial,
  file: File,
  userId: string
) {
  const up = await uploadCmsFile(client, "testimonials", file, userId, { imagesOnly: true });
  await removeStoragePath(client, row.photo_path);
  await updateTestimonial(client, row.id, { photo_url: up.url, photo_path: up.path });
}

export async function deleteTestimonial(client: SupabaseClient, row: SiteTestimonial) {
  await removeStoragePath(client, row.photo_path);
  const { error } = await client.from("site_testimonials").delete().eq("id", row.id);
  if (error) throw error;
}

export function isPdfMime(mime?: string | null, name?: string | null) {
  return (
    String(mime || "").toLowerCase().includes("pdf") ||
    String(name || "").toLowerCase().endsWith(".pdf")
  );
}
