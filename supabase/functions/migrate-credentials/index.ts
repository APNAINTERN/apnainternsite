/**
 * ONE-TIME Lovable Cloud credential bridge for AWS migration.
 *
 * Deploy only on Lovable Cloud, fetch credentials once, DELETE immediately.
 * See aws/LOVABLE_CREDENTIAL_BRIDGE.md
 */
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-migrate-access-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Use POST with header x-migrate-access-key" }, 405);
  }

  const expectedKey = Deno.env.get("MIGRATE_ACCESS_KEY")?.trim();
  const providedKey = req.headers.get("x-migrate-access-key")?.trim();

  if (!expectedKey) {
    return json(
      {
        error:
          "Set MIGRATE_ACCESS_KEY in Lovable Secrets before calling this function.",
      },
      503
    );
  }

  if (!providedKey || providedKey !== expectedKey) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseDbUrl = Deno.env.get("SUPABASE_DB_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseDbUrl || !serviceRoleKey) {
    return json(
      {
        error:
          "SUPABASE_DB_URL or SUPABASE_SERVICE_ROLE_KEY not available in this environment.",
        hint: "This function must run on Lovable Cloud (not local supabase start).",
        has_url: Boolean(supabaseUrl),
        has_db_url: Boolean(supabaseDbUrl),
        has_service_role: Boolean(serviceRoleKey),
      },
      500
    );
  }

  return json({
    warning:
      "DELETE this edge function immediately after copying values. Rotate secrets after migration.",
    supabase_url: supabaseUrl,
    supabase_db_url: supabaseDbUrl,
    service_role_key: serviceRoleKey,
  });
});
