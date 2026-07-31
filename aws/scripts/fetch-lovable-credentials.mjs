#!/usr/bin/env node
/**
 * Fetch Lovable Cloud DB URI + service role via temporary migrate-credentials edge function.
 * Does NOT write .env automatically — paste output locally yourself.
 *
 * Usage:
 *   export MIGRATE_ACCESS_KEY='your-random-secret'
 *   node aws/scripts/fetch-lovable-credentials.mjs \
 *     --url https://unqfphgjilxpbzajcdjl.supabase.co/functions/v1/migrate-credentials
 */
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    url: { type: "string" },
    key: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  console.log(`Usage:
  MIGRATE_ACCESS_KEY=secret node aws/scripts/fetch-lovable-credentials.mjs \\
    --url https://PROJECT.supabase.co/functions/v1/migrate-credentials

Options:
  --url   Edge function URL (required)
  --key   Access key (or set MIGRATE_ACCESS_KEY env var)
`);
  process.exit(0);
}

const url = values.url?.trim();
const accessKey = (values.key || process.env.MIGRATE_ACCESS_KEY || "").trim();

if (!url) {
  console.error("❌ Missing --url (edge function URL after Lovable deploy)");
  process.exit(1);
}
if (!accessKey) {
  console.error("❌ Missing access key: set MIGRATE_ACCESS_KEY or --key");
  process.exit(1);
}

console.log("→ Calling migrate-credentials (POST)...\n");

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-migrate-access-key": accessKey,
  },
  body: "{}",
});

const text = await res.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  console.error("❌ Non-JSON response:", res.status, text.slice(0, 500));
  process.exit(1);
}

if (!res.ok) {
  console.error("❌ Request failed:", res.status, data);
  process.exit(1);
}

if (data.warning) {
  console.warn("⚠️ ", data.warning, "\n");
}

console.log("Add these lines to your local .env (never commit):\n");
console.log(`SUPABASE_URL=${data.supabase_url}`);
console.log(`SUPABASE_DB_URL=${data.supabase_db_url}`);
console.log(`SUPABASE_SERVICE_ROLE_KEY=${data.service_role_key}`);
console.log("\nThen DELETE the migrate-credentials function in Lovable immediately.");
