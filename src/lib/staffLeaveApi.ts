import type { SupabaseClient } from "@supabase/supabase-js";
import { publicStorageObjectUrl, resolveStorageUrl } from "@/lib/storageUrl";

const BUCKET = "logos";
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export type LeaveType = "casual" | "sick" | "earned" | "unpaid" | "other";
export type RequestStatus = "pending" | "approved" | "rejected";

export type StaffLeaveRequest = {
  id: string;
  staff_id: string;
  leave_type: LeaveType;
  from_date: string;
  to_date: string;
  reason: string;
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

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  casual: "Casual Leave",
  sick: "Sick Leave",
  earned: "Earned Leave",
  unpaid: "Unpaid Leave",
  other: "Other",
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

function mapLeave(row: Record<string, unknown>): StaffLeaveRequest {
  const path = (row.attachment_path as string) || null;
  const rawUrl = (row.attachment_url as string) || null;
  const resolved = path
    ? publicStorageObjectUrl(BUCKET, path)
    : resolveStorageUrl(rawUrl || "") || rawUrl;
  return {
    id: String(row.id),
    staff_id: String(row.staff_id),
    leave_type: (row.leave_type as LeaveType) || "casual",
    from_date: String(row.from_date || ""),
    to_date: String(row.to_date || ""),
    reason: String(row.reason || ""),
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

export async function listOwnLeaveRequests(
  client: SupabaseClient,
  staffId: string
): Promise<StaffLeaveRequest[]> {
  const { data, error } = await client
    .from("staff_leave_requests")
    .select("*")
    .eq("staff_id", staffId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map(mapLeave);
}

export async function listAllLeaveRequests(
  client: SupabaseClient,
  opts?: {
    staffId?: string;
    status?: RequestStatus | "all";
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }
): Promise<StaffLeaveRequest[]> {
  let q = client
    .from("staff_leave_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 500);
  if (opts?.staffId) q = q.eq("staff_id", opts.staffId);
  if (opts?.status && opts.status !== "all") q = q.eq("status", opts.status);
  if (opts?.fromDate) q = q.gte("from_date", opts.fromDate);
  if (opts?.toDate) q = q.lte("to_date", opts.toDate);
  const { data, error } = await q;
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map(mapLeave);
}

export async function createLeaveRequest(
  client: SupabaseClient,
  input: {
    staffId: string;
    leaveType: LeaveType;
    fromDate: string;
    toDate: string;
    reason: string;
    file?: File | null;
  }
): Promise<StaffLeaveRequest> {
  if (!input.fromDate || !input.toDate) throw new Error("From and To dates are required.");
  if (input.toDate < input.fromDate) throw new Error("To date must be on or after From date.");
  if (!input.reason.trim()) throw new Error("Reason is required.");

  let attachment_url: string | null = null;
  let attachment_path: string | null = null;
  let attachment_name: string | null = null;
  if (input.file) {
    const up = await uploadAttachment(client, "leave", input.file, input.staffId);
    attachment_url = up.url;
    attachment_path = up.path;
    attachment_name = up.name;
  }

  const { data, error } = await client
    .from("staff_leave_requests")
    .insert({
      staff_id: input.staffId,
      leave_type: input.leaveType,
      from_date: input.fromDate,
      to_date: input.toDate,
      reason: input.reason.trim(),
      attachment_url,
      attachment_path,
      attachment_name,
      status: "pending",
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapLeave(data as Record<string, unknown>);
}

export async function reviewLeaveRequest(
  client: SupabaseClient,
  id: string,
  input: {
    status: "approved" | "rejected";
    adminRemarks?: string;
    reviewedBy: string;
  }
): Promise<void> {
  const { error } = await client
    .from("staff_leave_requests")
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
