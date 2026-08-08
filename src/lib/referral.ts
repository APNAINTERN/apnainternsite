import type { SupabaseClient } from "@supabase/supabase-js";

export const REFERRAL_SESSION_KEY = "registration_referral_code";
export const REFERRAL_CLICK_SESSION_KEY = "referral_click_session_id";

export const REFERRAL_TYPE_OPTIONS = [
  { value: "student_ambassador", label: "Student Ambassador" },
  { value: "influencer", label: "Influencer" },
  { value: "partner", label: "Partner" },
  { value: "other", label: "Other" },
] as const;

export type ReferralType = (typeof REFERRAL_TYPE_OPTIONS)[number]["value"];

export function referralTypeLabel(value: string | null | undefined): string {
  const hit = REFERRAL_TYPE_OPTIONS.find((o) => o.value === value);
  return hit?.label ?? "Other";
}

/** Client-side filter for admin referral partner table (name, email, phone, code). */
export function referralPartnerMatchesSearch(
  row: {
    full_name?: string | null;
    email?: string | null;
    contact_number?: string | null;
    referral_code?: string | null;
    city?: string | null;
    college_name?: string | null;
  },
  rawQuery: string
): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;

  const name = (row.full_name || "").toLowerCase();
  const email = (row.email || "").toLowerCase();
  const code = (row.referral_code || "").toLowerCase();
  const city = (row.city || "").toLowerCase();
  const college = (row.college_name || "").toLowerCase();

  if (
    name.includes(q) ||
    email.includes(q) ||
    code.includes(q) ||
    city.includes(q) ||
    college.includes(q)
  ) {
    return true;
  }

  const qDigits = q.replace(/\D/g, "");
  if (qDigits.length < 3) return false;

  const contactDigits = (row.contact_number || "").replace(/\D/g, "");
  if (contactDigits.includes(qDigits)) return true;

  const q10 = qDigits.slice(-10);
  const c10 = contactDigits.slice(-10);
  return q10.length >= 3 && c10.length >= 3 && c10.includes(q10);
}

function clickSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = sessionStorage.getItem(REFERRAL_CLICK_SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(REFERRAL_CLICK_SESSION_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

/** First-touch: only set when absent (call from Register page or RegistrationForm mount). */
export function captureReferralFromUrl(): void {
  if (typeof window === "undefined") return;
  try {
    const ref = new URLSearchParams(window.location.search).get("ref")?.trim();
    if (!ref) return;
    const normalized = ref.slice(0, 80).toLowerCase();
    if (!sessionStorage.getItem(REFERRAL_SESSION_KEY)) {
      sessionStorage.setItem(REFERRAL_SESSION_KEY, normalized);
    }
  } catch {
    /* sessionStorage blocked */
  }
}

/** Log a referral link click (fire-and-forget). Call after captureReferralFromUrl. */
export function logReferralClickFromUrl(client: SupabaseClient): void {
  if (typeof window === "undefined") return;
  try {
    const ref = new URLSearchParams(window.location.search).get("ref")?.trim();
    if (!ref) return;
    const sessionId = clickSessionId();
    void client.rpc("log_referral_click", {
      p_code: ref,
      p_session_id: sessionId || null,
    });
  } catch {
    /* non-fatal */
  }
}

export function peekStoredReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(REFERRAL_SESSION_KEY)?.trim();
    return v && v.length > 0 ? v.slice(0, 80).toLowerCase() : null;
  } catch {
    return null;
  }
}

import { getPublicSiteOrigin } from "@/lib/publicSiteOrigin";

export function getPublicRegisterUrlWithRef(referralCode: string): string {
  const code = encodeURIComponent(referralCode.trim());
  const origin = getPublicSiteOrigin();
  return `${origin}/register?ref=${code}`;
}

export function buildWhatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function buildTelegramShareUrl(url: string, text?: string): string {
  const params = new URLSearchParams({ url });
  if (text) params.set("text", text);
  return `https://t.me/share/url?${params.toString()}`;
}

export function generateReferralCode(): string {
  const hex = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `ref_${hex}`.toLowerCase();
}

/** Only codes that match an active partner row are stored on `students` (invalid refs are ignored).
 * When university/college are provided, also requires the partner to be assigned to that institution
 * (partners with no assignments remain unrestricted for backward compatibility).
 */
export async function resolveValidReferralCode(
  client: SupabaseClient,
  raw: string | null | undefined,
  opts?: { universityName?: string | null; collegeName?: string | null }
): Promise<string | null> {
  const code = raw?.trim();
  if (!code) return null;

  const uni = opts?.universityName?.trim() || null;
  const college = opts?.collegeName?.trim() || null;

  if (uni || college) {
    const { data, error } = await client.rpc("resolve_referral_attribution", {
      p_code: code,
      p_university_name: uni,
      p_college_name: college,
    });
    if (!error) {
      return typeof data === "string" && data.length > 0 ? data : null;
    }
    // Older DBs without the RPC: fall through to code-only validation.
    if (!/resolve_referral_attribution|does not exist|42883/i.test(error.message || "")) {
      console.warn("resolve_referral_attribution:", error.message);
    }
  }

  const { data, error } = await client.rpc("validate_referral_code", { p_code: code });
  if (error) {
    console.warn("resolveValidReferralCode:", error.message);
    return null;
  }
  return typeof data === "string" && data.length > 0 ? data : null;
}

export type ReferralAssignmentInput = {
  partnerId: string;
  universityIds: string[];
  /** College IDs; when a university has none selected, a university-wide row is stored. */
  collegeIds: string[];
  colleges: Array<{ id: string; university_id: string }>;
};

/** Build rows for referral_partner_assignments from selected university + college IDs. */
export function buildReferralAssignmentRows(input: ReferralAssignmentInput): Array<{
  partner_id: string;
  university_id: string;
  college_id: string | null;
}> {
  const collegeByUni = new Map<string, string[]>();
  for (const cid of input.collegeIds) {
    const col = input.colleges.find((c) => String(c.id) === String(cid));
    if (!col) continue;
    const uid = String(col.university_id);
    const list = collegeByUni.get(uid) || [];
    list.push(String(col.id));
    collegeByUni.set(uid, list);
  }

  const rows: Array<{ partner_id: string; university_id: string; college_id: string | null }> = [];
  for (const uid of input.universityIds) {
    const uniId = String(uid);
    const specific = collegeByUni.get(uniId) || [];
    if (specific.length === 0) {
      rows.push({ partner_id: input.partnerId, university_id: uniId, college_id: null });
    } else {
      for (const collegeId of specific) {
        rows.push({ partner_id: input.partnerId, university_id: uniId, college_id: collegeId });
      }
    }
  }
  return rows;
}

export function exportReferralStudentsCsv(
  rows: Array<{
    full_name?: string | null;
    contact_number?: string | null;
    college_name?: string | null;
    status?: string | null;
    created_at?: string | null;
    email?: string | null;
    registration_id?: string | null;
  }>,
  filename = "referral-students.csv"
): void {
  const header = ["Name", "Email", "Mobile", "College", "Status", "Applied Date", "Registration ID"];
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [
    header.join(","),
    ...rows.map((s) =>
      [
        s.full_name,
        s.email,
        s.contact_number,
        s.college_name,
        s.status,
        s.created_at ? new Date(s.created_at).toLocaleDateString() : "",
        s.registration_id,
      ]
        .map((x) => escape(String(x ?? "")))
        .join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
