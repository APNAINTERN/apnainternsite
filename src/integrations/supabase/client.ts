import { createClient } from '@supabase/supabase-js';
import { AUTH_STORAGE_KEY, createPersistingAuthStorage } from '@/lib/studentAuthSession';
import { usePollingInsteadOfRealtime } from '@/lib/siteApi';
import { awsThrottledFetch, isAwsLambdaApiUrl } from '@/lib/awsFetchThrottle';
import { assertSupabaseConfig, isHostedSupabaseUrl, resolveSupabaseAnonKey, resolveSupabaseUrl } from '@/lib/supabaseEnv';
import { isDirectLambdaApiUrl, usesAwsApiProxy } from '@/lib/awsApiOrigin';

/**
 * App data client: supabase-js protocol against Supabase cloud or local Express shim.
 * Run with `npm run dev` or `npm run dev:frontend:awsrds` — awsrds mode uses localhost:8080.
 */
const SUPABASE_URL = resolveSupabaseUrl();
const SUPABASE_PUBLISHABLE_KEY = resolveSupabaseAnonKey();

assertSupabaseConfig(SUPABASE_URL);

if (typeof window !== "undefined" && isHostedSupabaseUrl(SUPABASE_URL)) {
  console.warn(
    "[apnaintern] VITE_SUPABASE_URL still points at hosted Supabase:",
    SUPABASE_URL,
    "— migrate to AWS: set VITE_SUPABASE_URL to your Lambda URL and redeploy Vercel."
  );
} else if (
  typeof window !== "undefined" &&
  (isDirectLambdaApiUrl(SUPABASE_URL) || usesAwsApiProxy(SUPABASE_URL))
) {
  console.info("[apnaintern] Using AWS API (RDS backend):", SUPABASE_URL);
}

const disableRealtime = usePollingInsteadOfRealtime();
const useAwsThrottle = isAwsLambdaApiUrl(SUPABASE_URL);

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    detectSessionInUrl: true,
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
    storage: createPersistingAuthStorage(),
    storageKey: AUTH_STORAGE_KEY,
  },
  global: useAwsThrottle ? { fetch: awsThrottledFetch } : undefined,
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
