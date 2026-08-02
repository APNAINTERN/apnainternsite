import { supabase } from "@/integrations/supabase/client";

export type SiteSettingsRow = {
  id?: number;
  notice_enabled?: boolean;
  notice_title?: string;
  notice_message?: string;
  show_on_home?: boolean;
  show_on_registration?: boolean;
  show_on_login?: boolean;
  reg_min_delay?: number;
  reg_max_delay?: number;
  whatsapp_link_enabled?: boolean;
  whatsapp_link_url?: string;
  support_phone?: string;
  show_support_phone_on_footer?: boolean;
  contact_support_phones?: string;
  updated_at?: string;
};

export const DEFAULT_SITE_SETTINGS: SiteSettingsRow = {
  notice_enabled: false,
  notice_title: "Important Notice",
  notice_message: "",
  show_on_home: true,
  show_on_registration: true,
  show_on_login: false,
  reg_min_delay: 0,
  reg_max_delay: 0,
  whatsapp_link_enabled: false,
  whatsapp_link_url: "",
  support_phone: "",
  show_support_phone_on_footer: false,
  contact_support_phones: "",
};

export async function fetchSiteSettings(): Promise<SiteSettingsRow | null> {
  const { data } = await supabase
    .from("site_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (!data) return null;
  return { ...DEFAULT_SITE_SETTINGS, ...data };
}

export function parseContactPhones(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[\n,]+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function phoneToTelHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("91") && digits.length === 12 ? `tel:+${digits}` : `tel:${digits}`;
}
