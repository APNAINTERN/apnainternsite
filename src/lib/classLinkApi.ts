import type { SupabaseClient } from "@supabase/supabase-js";
import { inferLinkTypeFromUrl } from "@/lib/classLinkTargeting";

export type ClassLinkFormPayload = {
  title: string;
  description: string;
  url: string;
  scheduled_at: string;
  link_type: string;
  domain_id?: string | null;
  target_universities?: string[] | null;
  target_colleges?: string[] | null;
  target_domains?: string[] | null;
  is_active?: boolean;
  created_by?: string | null;
};

export function formatClassLinkError(error: unknown): string {
  if (!error || typeof error !== "object") return "Failed to save class.";
  const e = error as { message?: string; details?: string; hint?: string; code?: string };
  const parts = [e.message, e.details, e.hint].filter(Boolean);
  const msg = parts.join(" — ") || "Failed to save class.";
  if (e.code === "PGRST204" || /column.*does not exist/i.test(msg)) {
    return `${msg} Run supabase/hotfix_class_link_management.sql in Supabase SQL Editor, then reload the API schema (Settings → API → Reload).`;
  }
  if (/admin_insert_class_link|admin_update_class_link/i.test(msg)) {
    return `${msg} Run supabase/migrations/20260604190000_admin_class_link_rpc.sql (or hotfix) in Supabase SQL Editor.`;
  }
  return msg;
}

export function buildClassLinkRpcRow(
  values: {
    title: string;
    description: string;
    url: string;
    scheduledAt: string;
    linkType: string;
    target_universities: string[] | null;
    target_colleges: string[] | null;
    target_domains: string[] | null;
    is_active?: boolean;
    created_by?: string | null;
  }
): ClassLinkFormPayload {
  const linkType =
    values.linkType === "auto" ? inferLinkTypeFromUrl(values.url.trim()) : values.linkType;

  const row: ClassLinkFormPayload = {
    title: values.title.trim(),
    description: values.description.trim(),
    url: values.url.trim(),
    link_type: linkType,
    scheduled_at: new Date(values.scheduledAt).toISOString(),
    domain_id: null,
  };

  if (values.is_active !== undefined) {
    row.is_active = values.is_active;
  }

  if (values.target_universities?.length) {
    row.target_universities = values.target_universities;
  }
  if (values.target_colleges?.length) {
    row.target_colleges = values.target_colleges;
  }
  if (values.target_domains?.length) {
    row.target_domains = values.target_domains;
  }
  if (values.created_by) {
    row.created_by = values.created_by;
  }

  return row;
}

/** Minimal columns only — works before hotfix / schema reload. */
export async function insertClassLinkLegacy(
  supabase: SupabaseClient,
  row: ClassLinkFormPayload,
  domainId: string | null
) {
  const legacyType = row.link_type === "youtube" ? "youtube" : "meet";
  const minimal: Record<string, unknown> = {
    title: row.title,
    link_type: legacyType,
    url: row.url,
    scheduled_at: row.scheduled_at,
    domain_id: domainId,
  };

  let result = await supabase.from("classes").insert(minimal);
  if (!result.error) return result;

  const msg = String(result.error.message || "");
  if (/is_active|schema cache/i.test(msg)) {
    return result;
  }

  const withActive = { ...minimal, is_active: row.is_active ?? true };
  return supabase.from("classes").insert(withActive);
}

function shouldFallbackClassInsert(error: unknown): boolean {
  const code = String((error as { code?: string })?.code || "");
  const msg = formatClassLinkError(error);
  return (
    code === "PGRST202" ||
    code === "PGRST204" ||
    /schema cache/i.test(msg) ||
    /column.*does not exist/i.test(msg) ||
    /admin_insert_class_link/i.test(msg) ||
    /could not find the function/i.test(msg)
  );
}

export async function insertClassLink(
  supabase: SupabaseClient,
  row: ClassLinkFormPayload,
  opts?: { legacyDomainId?: string | null }
) {
  const minimalRow = {
    title: row.title,
    link_type: row.link_type,
    url: row.url,
    scheduled_at: row.scheduled_at,
    domain_id: opts?.legacyDomainId ?? row.domain_id ?? null,
  };

  const { data, error } = await supabase.rpc("admin_insert_class_link", { p_row: row });
  if (!error) return { data, error: null as null, warning: undefined as string | undefined };

  if (shouldFallbackClassInsert(error)) {
    const minimalRpc = await supabase.rpc("admin_insert_class_link_minimal", {
      p_row: minimalRow,
    });
    if (!minimalRpc.error) {
      return {
        data: minimalRpc.data,
        error: null,
        warning:
          "Class saved (basic mode). Run supabase/hotfix_class_link_management.sql in Supabase, then reload API schema.",
      };
    }

    const legacy = await insertClassLinkLegacy(supabase, row, opts?.legacyDomainId ?? null);
    if (!legacy.error) {
      return {
        data: legacy.data,
        error: null,
        warning:
          "Class saved (basic mode). Run supabase/hotfix_class_link_management.sql in Supabase, then reload API schema.",
      };
    }
    return { data: null, error: legacy.error || minimalRpc.error || error, warning: undefined };
  }

  return { data: null, error, warning: undefined };
}

export async function updateClassLink(
  supabase: SupabaseClient,
  id: string,
  row: ClassLinkFormPayload
) {
  const { error } = await supabase.rpc("admin_update_class_link", {
    p_id: id,
    p_row: row,
  });
  if (!error) return { error: null };

  const direct = await supabase.from("classes").update(row).eq("id", id);
  return { error: direct.error || error };
}
