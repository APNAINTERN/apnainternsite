import type { SupabaseClient } from "@supabase/supabase-js";
import { publicStorageObjectUrl, resolveStorageUrl } from "@/lib/storageUrl";

const GALLERY_BUCKET = "logos";
const CONSULT_BUCKET = "consent-forms";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;

export type SiteGalleryImage = {
  id: string;
  title: string;
  caption?: string | null;
  image_url: string;
  image_path?: string | null;
  sort_order: number;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SiteConsultLetter = {
  id: number;
  file_url: string | null;
  file_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  updated_at?: string | null;
};

export async function fetchPublicGalleryImages(
  client: SupabaseClient
): Promise<SiteGalleryImage[]> {
  const { data, error } = await client
    .from("site_gallery_images")
    .select("id, title, caption, image_url, image_path, sort_order, is_active, created_at, updated_at")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  const rows = ((data || []) as SiteGalleryImage[]).map((row) => {
    const fromPath =
      row.image_path != null && String(row.image_path).trim() !== ""
        ? publicStorageObjectUrl(GALLERY_BUCKET, String(row.image_path))
        : null;
    return {
      ...row,
      image_url: fromPath || resolveStorageUrl(row.image_url) || row.image_url,
    };
  });
  return rows.sort((a, b) => {
    const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (so !== 0) return so;
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });
}

export async function fetchAdminGalleryImages(
  client: SupabaseClient
): Promise<SiteGalleryImage[]> {
  const { data, error } = await client
    .from("site_gallery_images")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data || []) as SiteGalleryImage[]).map((row) => {
    const fromPath =
      row.image_path != null && String(row.image_path).trim() !== ""
        ? publicStorageObjectUrl(GALLERY_BUCKET, String(row.image_path))
        : null;
    return {
      ...row,
      image_url: fromPath || resolveStorageUrl(row.image_url) || row.image_url,
    };
  });
}

export async function uploadGalleryImage(
  client: SupabaseClient,
  file: File,
  createdBy: string,
  meta: { title: string; caption?: string; sortOrder?: number }
): Promise<SiteGalleryImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please upload an image file (JPG, PNG, WebP, etc.).");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image must be 8 MB or smaller.");
  }
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `gallery/${createdBy}/${Date.now()}-${safeName}`;
  const { error: upErr } = await client.storage.from(GALLERY_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (upErr) {
    if (/bucket not found/i.test(upErr.message)) {
      throw new Error('Storage bucket "logos" is missing. Run npm run aws:s3:provision.');
    }
    throw upErr;
  }
  const { data: pub } = client.storage.from(GALLERY_BUCKET).getPublicUrl(path);
  const imageUrl =
    publicStorageObjectUrl(GALLERY_BUCKET, path) ||
    resolveStorageUrl(pub.publicUrl) ||
    pub.publicUrl;

  const { data, error } = await client
    .from("site_gallery_images")
    .insert({
      title: meta.title.trim() || file.name,
      caption: meta.caption?.trim() || null,
      image_url: imageUrl,
      image_path: path,
      sort_order: meta.sortOrder ?? 0,
      is_active: true,
      created_by: createdBy && /^[0-9a-f-]{36}$/i.test(createdBy) ? createdBy : null,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return {
    ...(data as SiteGalleryImage),
    image_url: resolveStorageUrl((data as SiteGalleryImage).image_url) || (data as SiteGalleryImage).image_url,
  };
}

export async function updateGalleryImage(
  client: SupabaseClient,
  id: string,
  patch: Partial<{ title: string; caption: string | null; sort_order: number; is_active: boolean }>
): Promise<void> {
  const { error } = await client
    .from("site_gallery_images")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteGalleryImage(
  client: SupabaseClient,
  row: SiteGalleryImage
): Promise<void> {
  if (row.image_path) {
    await client.storage.from(GALLERY_BUCKET).remove([row.image_path]);
  }
  const { error } = await client.from("site_gallery_images").delete().eq("id", row.id);
  if (error) throw error;
}

export async function fetchConsultLetter(
  client: SupabaseClient
): Promise<SiteConsultLetter | null> {
  const { data, error } = await client
    .from("site_consult_letter")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as SiteConsultLetter;
  const fromPath =
    row.file_path != null && String(row.file_path).trim() !== ""
      ? publicStorageObjectUrl(CONSULT_BUCKET, String(row.file_path))
      : null;
  const resolved =
    fromPath ||
    (row.file_url ? resolveStorageUrl(row.file_url) || row.file_url : null);
  // Cache-bust so browsers pick up replacements of the fixed path
  const bust = row.updated_at ? `?v=${encodeURIComponent(String(row.updated_at))}` : "";
  return {
    ...row,
    file_url: resolved ? `${resolved.split("?")[0]}${bust}` : null,
  };
}

/** Upload replaces the previous consult letter (same singleton row + fixed storage path). */
export async function uploadConsultLetter(
  client: SupabaseClient,
  file: File,
  uploadedBy: string
): Promise<SiteConsultLetter> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Consult letter must be a PDF file.");
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new Error("PDF must be 20 MB or smaller.");
  }

  const existing = await fetchConsultLetter(client);
  if (existing?.file_path) {
    await client.storage.from(CONSULT_BUCKET).remove([existing.file_path]);
  }

  const path = `consult-letter/consult-letter.pdf`;
  const { error: upErr } = await client.storage.from(CONSULT_BUCKET).upload(path, file, {
    upsert: true,
    contentType: "application/pdf",
  });
  if (upErr) {
    if (/bucket not found/i.test(upErr.message)) {
      throw new Error('Storage bucket "consent-forms" is missing. Run npm run aws:s3:provision.');
    }
    throw upErr;
  }

  const { data: pub } = client.storage.from(CONSULT_BUCKET).getPublicUrl(path);
  // Clean public URL + cache-bust (query must NOT be part of the S3 object key)
  const clean =
    publicStorageObjectUrl(CONSULT_BUCKET, path) ||
    resolveStorageUrl(pub.publicUrl) ||
    pub.publicUrl;
  const fileUrl = `${String(clean).split("?")[0]}?v=${Date.now()}`;

  const { data, error } = await client
    .from("site_consult_letter")
    .upsert(
      {
        id: 1,
        file_url: fileUrl,
        file_path: path,
        file_name: file.name,
        mime_type: "application/pdf",
        uploaded_by: uploadedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    .select("*")
    .single();
  if (error) throw error;
  const mapped = await fetchConsultLetter(client);
  return mapped || {
    ...(data as SiteConsultLetter),
    file_url: resolveStorageUrl((data as SiteConsultLetter).file_url || "") || (data as SiteConsultLetter).file_url,
  };
}

export async function removeConsultLetter(client: SupabaseClient): Promise<void> {
  const existing = await fetchConsultLetter(client);
  if (existing?.file_path) {
    await client.storage.from(CONSULT_BUCKET).remove([existing.file_path]);
  }
  const { error } = await client
    .from("site_consult_letter")
    .update({
      file_url: null,
      file_path: null,
      file_name: null,
      mime_type: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) throw error;
}
