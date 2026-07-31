import type { SupabaseClient } from "@supabase/supabase-js";
import { publicStorageObjectUrl, resolveStorageUrl } from "@/lib/storageUrl";
import type { RequestStatus } from "@/lib/staffLeaveApi";
import { REQUEST_STATUS_LABELS } from "@/lib/staffLeaveApi";

const BUCKET = "logos";
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export type RequirementCategory =
  | "equipment"
  | "access"
  | "software"
  | "stationery"
  | "travel"
  | "other";

export type StaffRequirementRequest = {
  id: string;
  staff_id: string;
  title: string;
  category: RequirementCategory;
  description: string;
  attachment_url: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  status: RequestStatus;
  admin_remarks: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export const REQUIREMENT_CATEGORY_LABELS: Record<RequirementCategory, string> = {
  equipment: "Equipment",
  access: "Access / Permissions",
  software: "Software",
  stationery: "Stationery",
  travel: "Travel",
  other: "Other",
};

export { REQUEST_STATUS_LABELS };

function mapRequirement(row: Record<string, unknown>): StaffRequirementRequest {
  const path = (row.attachment_path as string) || null;
  const rawUrl = (row.attachment_url as string) || null;
  const resolved = path
    ? publicStorageObjectUrl(BUCKET, path)
    : resolveStorageUrl(rawUrl || "") || rawUrl;
  return {
    id: String(row.id),
    staff_id: String(row.staff_id),
    title: String(row.title || ""),
    category: (row.category as RequirementCategory) || "other",
    description: String(row.description || ""),
    attachment_url: resolved || null,
    attachment_path: path,
    attachment_name: (row.attachment_name as string) || null,
    status: (row.status as RequestStatus) || "pending",
    admin_remarks: (row.admin_remarks as string) || null,
    reviewed_by: (row.reviewed_by as string) || null,
    reviewed_at: (row.reviewed_at as string) || null,
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || ""),
  };
}

async function uploadAttachment(
  client: SupabaseClient,
  folder: string,
  file: File,
  userId: string
): Promise<{ url: string; path: string; name: string }> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error("Attachment must be 10 MB or smaller.");
  }
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `staff-requests/${folder}/${userId}/${Date.now()}-${safeName}`;
  const { error } = await client.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  const { data: pub } = client.storage.from(BUCKET).getPublicUrl(path);
  const url =
    publicStorageObjectUrl(BUCKET, path) ||
    resolveStorageUrl(pub.publicUrl) ||
    pub.publicUrl;
  return { url, path, name: file.name };
}

export async function listOwnRequirementRequests(
  client: SupabaseClient,
  staffId: string
): Promise<StaffRequirementRequest[]> {
  const { data, error } = await client
    .from("staff_requirement_requests")
    .select("*")
    .eq("staff_id", staffId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map(mapRequirement);
}

export async function listAllRequirementRequests(
  client: SupabaseClient,
  opts?: {
    staffId?: string;
    status?: RequestStatus | "all";
    category?: RequirementCategory | "all";
    limit?: number;
  }
): Promise<StaffRequirementRequest[]> {
  let q = client
    .from("staff_requirement_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 500);
  if (opts?.staffId) q = q.eq("staff_id", opts.staffId);
  if (opts?.status && opts.status !== "all") q = q.eq("status", opts.status);
  if (opts?.category && opts.category !== "all") q = q.eq("category", opts.category);
  const { data, error } = await q;
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map(mapRequirement);
}

export async function createRequirementRequest(
  client: SupabaseClient,
  input: {
    staffId: string;
    title: string;
    category: RequirementCategory;
    description: string;
    file?: File | null;
  }
): Promise<StaffRequirementRequest> {
  if (!input.title.trim()) throw new Error("Title is required.");
  if (!input.description.trim()) throw new Error("Description is required.");

  let attachment_url: string | null = null;
  let attachment_path: string | null = null;
  let attachment_name: string | null = null;
  if (input.file) {
    const up = await uploadAttachment(client, "requirements", input.file, input.staffId);
    attachment_url = up.url;
    attachment_path = up.path;
    attachment_name = up.name;
  }

  const { data, error } = await client
    .from("staff_requirement_requests")
    .insert({
      staff_id: input.staffId,
      title: input.title.trim(),
      category: input.category,
      description: input.description.trim(),
      attachment_url,
      attachment_path,
      attachment_name,
      status: "pending",
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapRequirement(data as Record<string, unknown>);
}

export async function reviewRequirementRequest(
  client: SupabaseClient,
  id: string,
  input: {
    status: "approved" | "rejected";
    adminRemarks?: string;
    reviewedBy: string;
  }
): Promise<void> {
  const { error } = await client
    .from("staff_requirement_requests")
    .update({
      status: input.status,
      admin_remarks: input.adminRemarks?.trim() || null,
      reviewed_by: input.reviewedBy,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}
