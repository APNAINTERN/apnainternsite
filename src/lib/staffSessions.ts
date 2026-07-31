import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY_STORAGE = "ezy_staff_device_session_key";

export type StaffAuthSession = {
  id: string;
  user_id: string;
  session_key: string;
  device_label: string | null;
  user_agent: string | null;
  ip_hint: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
};

export type StaffActivityRow = {
  id: string;
  user_id: string;
  event_type: string;
  detail: string | null;
  created_at: string;
  /** Display name when listing all staff activity */
  user_name?: string | null;
  user_email?: string | null;
};

function randomKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  }
  return `sk_${Date.now()}_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

export function getOrCreateStaffSessionKey(): string {
  try {
    const existing = localStorage.getItem(SESSION_KEY_STORAGE);
    if (existing && existing.length >= 8) return existing;
    const key = randomKey();
    localStorage.setItem(SESSION_KEY_STORAGE, key);
    return key;
  } catch {
    return randomKey();
  }
}

export function guessDeviceLabel(): string {
  if (typeof navigator === "undefined") return "Unknown device";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad/i.test(ua)) return "iOS device";
  if (/Android/i.test(ua)) return "Android device";
  if (/Mac OS/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Linux/i.test(ua)) return "Linux";
  return "Web browser";
}

export async function touchStaffSession(): Promise<void> {
  const key = getOrCreateStaffSessionKey();
  await supabase.rpc("staff_touch_session", {
    p_session_key: key,
    p_device_label: guessDeviceLabel(),
    p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
    p_ip_hint: null,
  });
}

export async function logStaffActivity(eventType: string, detail?: string): Promise<void> {
  await supabase.rpc("staff_log_activity", {
    p_event_type: eventType,
    p_detail: detail ?? null,
  });
}

export async function listStaffSessions(): Promise<StaffAuthSession[]> {
  const { data, error } = await supabase
    .from("staff_auth_sessions")
    .select("*")
    .is("revoked_at", null)
    .order("last_seen_at", { ascending: false });
  if (error) throw error;
  return (data || []) as StaffAuthSession[];
}

export async function listStaffActivity(limit = 50): Promise<StaffActivityRow[]> {
  const { data, error } = await supabase
    .from("staff_activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data || []) as StaffActivityRow[];
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  if (userIds.length === 0) return rows;

  const nameById = new Map<string, { name: string | null; email: string | null }>();
  const { data: staffRows } = await supabase
    .from("admin_staff")
    .select("id, full_name, email")
    .in("id", userIds);
  for (const s of staffRows || []) {
    nameById.set(String(s.id), {
      name: (s.full_name as string) || null,
      email: (s.email as string) || null,
    });
  }

  return rows.map((r) => {
    const info = nameById.get(r.user_id);
    return {
      ...r,
      user_name: info?.name || null,
      user_email: info?.email || null,
    };
  });
}

export async function revokeStaffSession(sessionKey: string): Promise<void> {
  const { error } = await supabase.rpc("staff_revoke_session", { p_session_key: sessionKey });
  if (error) throw error;
}

export async function revokeOtherStaffSessions(): Promise<void> {
  const key = getOrCreateStaffSessionKey();
  const { error } = await supabase.rpc("staff_revoke_other_sessions", {
    p_keep_session_key: key,
  });
  if (error) throw error;
}

export function isCurrentStaffSession(sessionKey: string): boolean {
  try {
    return localStorage.getItem(SESSION_KEY_STORAGE) === sessionKey;
  } catch {
    return false;
  }
}
