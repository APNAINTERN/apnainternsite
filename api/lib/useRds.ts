/** True when server APIs should use DATABASE_URL (RDS) instead of live Supabase. */
export function useRds(): boolean {
  return (
    Boolean(process.env.DATABASE_URL?.trim()) &&
    String(process.env.LOCAL_SUPABASE || "true").toLowerCase() !== "false"
  );
}
