import { supabase } from "@/integrations/supabase/client";
import { siteApiUrl } from "@/lib/siteApi";

/**
 * Mail uses `/api/send-mail`. Override with `VITE_SEND_MAIL_API_URL`, or set
 * `VITE_SITE_API_ORIGIN` when testing local frontend against AWS Lambda.
 */
export function getSendMailApiUrl(): string {
  if (typeof window === "undefined") return "/api/send-mail";
  const fromEnv = import.meta.env.VITE_SEND_MAIL_API_URL as string | undefined;
  if (fromEnv?.trim()) return fromEnv.trim();
  return siteApiUrl("/api/send-mail");
}

/** POST to send-mail with session Bearer token when the user is signed in (required for admin mail actions). */
export async function postSendMail(body: Record<string, unknown>): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
  } catch {
    /* optional session */
  }
  return fetch(getSendMailApiUrl(), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

export async function assertSendMailOk(res: Response): Promise<void> {
  if (res.ok) return;
  const text = await res.text().catch(() => "");
  let detail = "";
  try {
    const j = JSON.parse(text) as { message?: string; error?: string };
    // Prefer `error` — handler sets generic message + SMTP/nodemailer detail in error
    detail = (j.error || j.message || "").trim();
  } catch {
    if (text.trim()) detail = text.replace(/<[^>]+>/g, "").slice(0, 280).trim();
  }
  throw new Error(detail || `Email request failed (${res.status})`);
}
