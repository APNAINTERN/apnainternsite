import type { SupabaseClient } from "@supabase/supabase-js";
import { coalesce } from "@/lib/requestCoalesce";
import { awsApiFetch, isAwsLambdaApiUrl } from "@/lib/awsFetchThrottle";
import { resolveSupabaseAnonKey, resolveSupabaseUrl } from "@/lib/supabaseEnv";
import { siteApiUrl } from "@/lib/siteApi";

/** Roles embedded in JWT/session app_metadata by AWS auth shim (avoids extra REST call). */
export function readRolesFromUser(user: { id: string; app_metadata?: Record<string, unknown> } | null | undefined, userId: string): string[] | null {
  if (!user || user.id !== userId) return null;
  const raw = user.app_metadata?.roles;
  if (!Array.isArray(raw) || !raw.length) return null;
  return raw.map((r) => String(r));
}

const PORTAL_ROLES = new Set([
  "super_admin",
  "admin",
  "staff",
  "college_admin",
  "referral_partner",
]);

export function hasPortalRole(roles: string[]): boolean {
  return roles.some((r) => PORTAL_ROLES.has(r));
}

/** Coalesced role list for post-login routing (single round-trip via local REST → RDS). */
export async function fetchRolesForUser(
  client: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data: { session } } = await client.auth.getSession();
  const fromSession = readRolesFromUser(session?.user, userId);
  if (fromSession?.length) return fromSession;

  return coalesce(
    `roles:${userId}`,
    async () => {
      try {
        const { data: { user } } = await client.auth.getUser();
        const fromUser = readRolesFromUser(user, userId);
        if (fromUser?.length) return fromUser;
      } catch {
        /* getUser optional when offline/throttled */
      }

      const { data, error } = await client
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (error) throw error;
      return (data || []).map((r) => r.role);
    },
    300_000
  );
}

export async function fetchCybercafeExists(
  client: SupabaseClient,
  userId: string
): Promise<boolean> {
  return coalesce(
    `cybercafe:${userId}`,
    async () => {
      try {
        const { data, error } = await client
          .from("cybercafe_profiles")
          .select("id")
          .eq("id", userId)
          .maybeSingle();
        if (error) {
          console.warn("[portalAuth] cybercafe_profiles:", error.message);
          return false;
        }
        return Boolean(data?.id);
      } catch (err) {
        console.warn("[portalAuth] cybercafe_profiles fetch failed:", err);
        return false;
      }
    },
    120_000
  );
}

export type AdminCoreBootstrap = {
  universities: unknown[];
  colleges: unknown[];
  certificates: unknown[];
  internship_domains: unknown[];
  classes: unknown[];
  system_settings: unknown[];
  admin_permissions: unknown | null;
  assignments: unknown[];
  cybercafe_profiles: unknown[];
  admin_staff: unknown[];
};

/** One Lambda invocation for admin shell tables (avoids 10+ parallel REST calls). */
export async function fetchAdminCoreBootstrap(
  accessToken: string,
  userId: string
): Promise<AdminCoreBootstrap> {
  if (!isAwsLambdaApiUrl(resolveSupabaseUrl())) {
    throw new Error("fetchAdminCoreBootstrap requires AWS API URL");
  }

  const res = await awsApiFetch(siteApiUrl("/api/data/batch-select"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: resolveSupabaseAnonKey(),
    },
    body: JSON.stringify({
      queries: [
        { key: "universities", table: "universities", order: { column: "name", ascending: true }, limit: 5000 },
        {
          key: "colleges",
          table: "colleges",
          columns: "id, name, university_id",
          order: { column: "name", ascending: true },
          limit: 5000,
        },
        {
          key: "certificates",
          table: "certificates",
          order: { column: "created_at", ascending: false },
          limit: 100,
        },
        { key: "internship_domains", table: "internship_domains", order: { column: "name", ascending: true }, limit: 5000 },
        {
          key: "classes",
          table: "classes",
          order: { column: "scheduled_at", ascending: true },
          limit: 5000,
        },
        { key: "system_settings", table: "system_settings", limit: 100 },
        {
          key: "admin_permissions",
          table: "admin_permissions",
          filters: [{ op: "eq", column: "user_id", value: userId }],
          single: true,
        },
        {
          key: "assignments",
          table: "assignments",
          order: { column: "created_at", ascending: false },
          limit: 5000,
        },
        {
          key: "cybercafe_profiles",
          table: "cybercafe_profiles",
          order: { column: "created_at", ascending: false },
          limit: 5000,
        },
        {
          key: "admin_staff",
          table: "admin_staff",
          order: { column: "created_at", ascending: false },
          limit: 5000,
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Admin bootstrap failed (${res.status}): ${text || res.statusText}`);
  }

  const payload = (await res.json()) as { results?: AdminCoreBootstrap; error?: string };
  if (!payload.results) {
    throw new Error(payload.error || "Admin bootstrap returned no results");
  }
  return payload.results;
}
