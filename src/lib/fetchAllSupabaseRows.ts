import type { PostgrestFilterBuilder } from "@supabase/postgrest-js";
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
type Query = PostgrestFilterBuilder<any, any, any, any[], string, unknown, "GET">;

export type FetchAllSupabaseRowsOptions = {
  select?: string;
  orderBy?: string;
  ascending?: boolean;
  /** Stable tiebreaker column (default `id`). Required on each row. */
  tieBreaker?: string;
  pageSize?: number;
  maxRows?: number;
  /** Extra filters (search, eq, etc.) applied on every page. */
  modify?: (query: Query) => Query;
};

function quoteFilterValue(value: unknown): string {
  if (value === null || value === undefined) return '""';
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const s = String(value);
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function applyKeysetCursor(
  query: Query,
  orderBy: string,
  tieBreaker: string,
  ascending: boolean,
  cursor: { primary: unknown; tie: unknown }
) {
  const p = quoteFilterValue(cursor.primary);
  const t = quoteFilterValue(cursor.tie);
  if (ascending) {
    return query.or(`${orderBy}.gt.${p},and(${orderBy}.eq.${p},${tieBreaker}.gt.${t})`);
  }
  return query.or(`${orderBy}.lt.${p},and(${orderBy}.eq.${p},${tieBreaker}.lt.${t})`);
}

async function fetchAllPaginated<T extends Row>(
  buildBase: () => Query,
  options?: FetchAllSupabaseRowsOptions
): Promise<T[]> {
  const select = options?.select ?? "*";
  const orderBy = options?.orderBy ?? "created_at";
  const ascending = options?.ascending ?? false;
  const tieBreaker = options?.tieBreaker ?? "id";
  const pageSize = options?.pageSize ?? 1000;
  const maxRows = options?.maxRows ?? 200_000;
  const modify = options?.modify;

  const all: T[] = [];
  let cursor: { primary: unknown; tie: unknown } | null = null;
  let useOffsetFallback = false;

  for (let page = 0; page < Math.ceil(maxRows / pageSize); page++) {
    let query = buildBase()
      .select(select)
      .order(orderBy, { ascending, nullsFirst: false })
      .order(tieBreaker, { ascending })
      .limit(pageSize);

    if (modify) query = modify(query);

    if (useOffsetFallback) {
      query = query.range(all.length, all.length + pageSize - 1);
    } else if (cursor) {
      query = applyKeysetCursor(query, orderBy, tieBreaker, ascending, cursor);
    }

    const { data, error } = await query;
    if (error) throw error;

    const batch = (data || []) as T[];
    if (!batch.length) break;

    all.push(...batch);
    if (batch.length < pageSize || all.length >= maxRows) break;

    if (useOffsetFallback) continue;

    const last = batch[batch.length - 1] as Row;
    const primary = last[orderBy];
    const tie = last[tieBreaker];
    const primaryMissing =
      primary == null || (typeof primary === "string" && primary.trim() === "");
    const tieMissing = tie == null || (typeof tie === "string" && tie.trim() === "");

    if (primaryMissing || tieMissing) {
      // Some tables (e.g. students.created_at as text) have blank values — fall back to offset pages.
      useOffsetFallback = true;
      continue;
    }
    cursor = { primary, tie };
  }

  return all;
}

/** Paginate past PostgREST max-rows (often 1000) using stable keyset pagination. */
export async function fetchAllSupabaseRows<T extends Row = Row>(
  supabase: SupabaseClient,
  table: string,
  options?: FetchAllSupabaseRowsOptions
): Promise<T[]> {
  return fetchAllPaginated<T>(() => supabase.from(table) as unknown as Query, options);
}

/** Same as fetchAllSupabaseRows but for RPC returning a table-shaped row set. */
export async function fetchAllSupabaseRpcRows<T extends Row = Row>(
  supabase: SupabaseClient,
  rpcName: string,
  options?: FetchAllSupabaseRowsOptions & { args?: Record<string, unknown> }
): Promise<T[]> {
  const args = options?.args;
  return fetchAllPaginated<T>(
    () => (args ? supabase.rpc(rpcName, args) : supabase.rpc(rpcName)) as unknown as Query,
    options
  );
}

/** Exact row count for a table (ignores PostgREST default 1000-row page cap). */
export async function fetchSupabaseExactCount(
  supabase: SupabaseClient,
  table: string,
  modify?: FetchAllSupabaseRowsOptions["modify"]
): Promise<number> {
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (modify) query = modify(query as unknown as Query) as typeof query;
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}
