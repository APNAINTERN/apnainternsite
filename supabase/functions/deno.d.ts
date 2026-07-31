/** Minimal Deno globals for Supabase Edge Functions (IDE type-check only). */
declare namespace Deno {
  namespace env {
    function get(key: string): string | undefined;
  }
}
