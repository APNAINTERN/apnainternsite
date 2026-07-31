import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ClassTargetFilters,
  filtersToTargetArrays,
  describeClassTargets,
} from "@/lib/classLinkTargeting";

export type NotificationRow = {
  id?: string;
  title?: string;
  message?: string;
  target_type?: string;
  target_user_id?: string | null;
  target_universities?: string[] | null;
  target_colleges?: string[] | null;
  target_domains?: string[] | null;
  target_modes?: string[] | null;
  status?: string;
  recipient_count?: number | null;
  class_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type StudentNotification = {
  id: string;
  title: string;
  message: string;
  created_at: string;
  read_at: string | null;
  is_read: boolean;
  class_id: string | null;
};

export function formatNotificationError(error: unknown): string {
  if (!error || typeof error !== "object") return "Notification action failed.";
  const e = error as { message?: string; details?: string; hint?: string; code?: string };
  const parts = [e.message, e.details, e.hint].filter(Boolean);
  const msg = parts.join(" — ") || "Notification action failed.";
  if (
    /admin_publish_notification|admin_notify_class_published|admin_list_notifications|notification_deliveries/i.test(
      msg
    ) ||
    e.code === "PGRST202"
  ) {
    return `${msg} Run supabase/migrations/20260605120000_notification_management.sql in Supabase SQL Editor, then reload API schema.`;
  }
  return msg;
}

export function buildNotificationTargetPayload(
  filters: ClassTargetFilters,
  opts?: { specificUserId?: string | null }
): {
  target_type: "all" | "specific" | "filtered";
  target_user_id: string | null;
  target_universities: string[] | null;
  target_colleges: string[] | null;
  target_domains: string[] | null;
  target_modes: string[] | null;
} {
  if (opts?.specificUserId) {
    return {
      target_type: "specific",
      target_user_id: opts.specificUserId,
      target_universities: null,
      target_colleges: null,
      target_domains: null,
      target_modes: null,
    };
  }

  const arrays = filtersToTargetArrays(filters);
  const isAll =
    filters.universities.length === 0 &&
    filters.colleges.length === 0 &&
    filters.domain === "all" &&
    filters.mode === "all";

  if (isAll) {
    return {
      target_type: "all",
      target_user_id: null,
      target_universities: null,
      target_colleges: null,
      target_domains: null,
      target_modes: null,
    };
  }

  return {
    target_type: "filtered",
    target_user_id: null,
    target_universities: arrays.target_universities,
    target_colleges: arrays.target_colleges,
    target_domains: arrays.target_domains,
    target_modes: arrays.target_modes,
  };
}

export function describeNotificationTargets(n: NotificationRow): string {
  if (n.target_type === "all") return "All students";
  if (n.target_type === "specific") return "Specific student";
  return describeClassTargets({
    target_universities: n.target_universities,
    target_colleges: n.target_colleges,
    target_domains: n.target_domains,
    target_modes: n.target_modes,
    domain_id: null,
    internship_domains: null,
  });
}

/** One-line label for table cells. */
export function notificationTargetSummaryShort(n: NotificationRow): string {
  if (n.target_type === "all") return "All students";
  if (n.target_type === "specific") return "1 student";
  const uniCount = n.target_universities?.length ?? 0;
  const collegeCount = n.target_colleges?.length ?? 0;
  const domainCount = n.target_domains?.length ?? 0;
  const modeCount = n.target_modes?.length ?? 0;
  if (uniCount === 0 && collegeCount === 0 && domainCount === 0 && modeCount === 0) return "All students";
  const parts: string[] = [];
  if (uniCount) parts.push(`${uniCount} university${uniCount === 1 ? "" : "ies"}`);
  if (collegeCount) parts.push(`${collegeCount} college${collegeCount === 1 ? "" : "s"}`);
  if (domainCount) parts.push(`${domainCount} domain${domainCount === 1 ? "" : "s"}`);
  if (modeCount) parts.push(`${modeCount} mode${modeCount === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

export async function countNotificationTargets(
  supabase: SupabaseClient,
  filters: ClassTargetFilters,
  opts?: { specificUserId?: string | null }
): Promise<number> {
  const target = buildNotificationTargetPayload(filters, opts);
  const { data, error } = await supabase.rpc("admin_count_notification_targets", {
    p_target_type: target.target_type,
    p_target_user_id: target.target_user_id,
    p_universities: target.target_universities,
    p_colleges: target.target_colleges,
    p_domains: target.target_domains,
    p_modes: target.target_modes,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function publishNotification(
  supabase: SupabaseClient,
  payload: {
    title: string;
    message: string;
    filters: ClassTargetFilters;
    createdBy?: string | null;
    status?: "draft" | "published";
    specificUserId?: string | null;
    classId?: string | null;
  }
) {
  const target = buildNotificationTargetPayload(payload.filters, {
    specificUserId: payload.specificUserId,
  });
  const row = {
    title: payload.title.trim(),
    message: payload.message.trim(),
    status: payload.status ?? "published",
    created_by: payload.createdBy ?? null,
    class_id: payload.classId ?? null,
    ...target,
  };

  const { data, error } = await supabase.rpc("admin_publish_notification", { p_row: row });
  if (error) throw error;
  return data as string;
}

export async function updateNotificationDraft(
  supabase: SupabaseClient,
  id: string,
  payload: {
    title: string;
    message: string;
    filters: ClassTargetFilters;
    specificUserId?: string | null;
  }
) {
  const target = buildNotificationTargetPayload(payload.filters, {
    specificUserId: payload.specificUserId,
  });
  const { error } = await supabase.rpc("admin_update_notification_draft", {
    p_id: id,
    p_row: {
      title: payload.title.trim(),
      message: payload.message.trim(),
      ...target,
    },
  });
  if (error) throw error;
}

export async function publishNotificationDraft(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.rpc("admin_publish_notification_draft", { p_id: id });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function fetchAdminNotifications(
  supabase: SupabaseClient,
  limit = 100
): Promise<NotificationRow[]> {
  const { data, error } = await supabase.rpc("admin_list_notifications", {
    p_limit: limit,
  });
  if (!error && Array.isArray(data)) {
    return data as NotificationRow[];
  }

  const { data: rows, error: directErr } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (directErr) throw directErr;
  return (rows || []) as NotificationRow[];
}

export async function deleteNotification(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("notifications").delete().eq("id", id);
  if (error) throw error;
}

export async function notifyClassPublished(supabase: SupabaseClient, classId: string) {
  const { data, error } = await supabase.rpc("admin_notify_class_published", {
    p_class_id: classId,
  });
  if (error) throw error;
  return data as string;
}

export async function fetchStudentNotifications(
  supabase: SupabaseClient,
  userId: string
): Promise<StudentNotification[]> {
  const { data, error } = await supabase.rpc("list_notifications_for_student");
  if (!error && Array.isArray(data)) {
    return data as StudentNotification[];
  }

  const { data: legacy, error: legacyErr } = await supabase
    .from("notifications")
    .select("*")
    .or(`target_type.eq.all,target_user_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(20);

  if (legacyErr) throw legacyErr;
  return (legacy || []).map((n) => ({
    id: n.id,
    title: n.title,
    message: n.message,
    created_at: n.created_at,
    read_at: null,
    is_read: false,
    class_id: n.class_id ?? null,
  }));
}

export async function fetchUnreadNotificationCount(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc("student_unread_notification_count");
  if (!error) return Number(data ?? 0);
  return 0;
}

export async function markNotificationRead(
  supabase: SupabaseClient,
  notificationId: string
) {
  const { error } = await supabase.rpc("student_mark_notification_read", {
    p_notification_id: notificationId,
  });
  if (error) throw error;
}
