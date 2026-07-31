import { createClient } from '@supabase/supabase-js';
import { AUTH_STORAGE_KEY, createPersistingAuthStorage } from '@/lib/studentAuthSession';
import { usePollingInsteadOfRealtime } from '@/lib/siteApi';

/**
 * App data client: supabase-js protocol against local Express shim (auth/rest/storage → RDS + S3).
 * Run with `npm run dev` or `npm run dev:frontend:awsrds` — URL is forced to http://localhost:8080.
 */
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "local-anon-key";

if (typeof window !== "undefined" && SUPABASE_URL.includes("supabase.co")) {
  console.warn(
    "[ezyintern] VITE_SUPABASE_URL still points at live Supabase:",
    SUPABASE_URL,
    "— for local AWS use npm run dev:frontend:awsrds (URL forced to http://localhost:8080)"
  );
}

const disableRealtime = usePollingInsteadOfRealtime();

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    detectSessionInUrl: true,
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
    storage: createPersistingAuthStorage(),
    storageKey: AUTH_STORAGE_KEY,
  },
});

// Lambda / local API has no Phoenix realtime. Block socket connect to stop wss 400 storms
// that freeze the Staff/Admin UI after login.
if (disableRealtime && typeof window !== "undefined") {
  try {
    const rt = supabase.realtime as unknown as {
      disconnect?: () => void;
      connect?: () => void;
      channels?: unknown[];
    };
    rt.disconnect?.();
    rt.connect = () => {
      /* no-op: realtime unsupported on execute-api */
    };
  } catch {
    /* ignore */
  }
}
