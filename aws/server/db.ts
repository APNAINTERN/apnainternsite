/**
 * Shared Postgres pool for Lambda / local API → AWS RDS.
 * Prefer DATABASE_URL (from .env.awsrds.local or Lambda env).
 */
import { Pool, type QueryResultRow } from "pg";

let pool: Pool | null = null;

function normalizeDatabaseUrl(raw: string): { connectionString: string; useSsl: boolean } {
  const useSsl =
    /sslmode=require/i.test(raw) ||
    /rds\.amazonaws\.com/i.test(raw) ||
    process.env.PGSSLMODE === "require";

  // node-pg treats sslmode=require in the URL as verify-full and fails on RDS
  // managed certs. Strip it and pass ssl: { rejectUnauthorized: false } instead.
  const connectionString = raw
    .replace(/([?&])sslmode=[^&]*/gi, "$1")
    .replace(/[?&]$/, "")
    .replace(/\?&/, "?");

  return { connectionString, useSsl };
}

export function getPool(): Pool {
  if (pool) return pool;

  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    throw new Error("DATABASE_URL is not set — cannot query RDS");
  }

  const { connectionString, useSsl } = normalizeDatabaseUrl(raw);

  pool = new Pool({
    connectionString,
    // Lambda: allow a few concurrent REST queries per warm container (admin UI bursts).
    max: process.env.AWS_LAMBDA_FUNCTION_NAME ? 5 : 10,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });

  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) {
  return getPool().query<T>(text, params);
}

export type JwtClaims = { sub: string; email?: string; role?: string };

async function applyJwtClaims(client: import("pg").PoolClient, jwt: JwtClaims | null) {
  if (!jwt?.sub) return;
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [jwt.sub]);
  await client.query(`SELECT set_config('request.jwt.claim.role', $1, true)`, [
    jwt.role || "authenticated",
  ]);
  if (jwt.email) {
    await client.query(`SELECT set_config('request.jwt.claim.email', $1, true)`, [jwt.email]);
  }
}

/**
 * Run queries in a transaction with request.jwt.claim.* set so auth.uid() and RLS
 * policies work the same as Supabase PostgREST (used by REST shim + RPC).
 */
export async function withJwtSession<T>(
  jwt: JwtClaims | null,
  fn: (client: import("pg").PoolClient) => Promise<T>
): Promise<T> {
  if (!jwt?.sub) {
    throw new Error("withJwtSession requires jwt.sub");
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await applyJwtClaims(client, jwt);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function queryAsJwt<T extends QueryResultRow = QueryResultRow>(
  jwt: JwtClaims | null,
  text: string,
  params?: unknown[]
) {
  if (!jwt?.sub) return query<T>(text, params);
  return withJwtSession(jwt, (client) => client.query<T>(text, params));
}

/**
 * Bind RPC args for node-pg.
 * JS objects/arrays must not be sent raw to jsonb params — node-pg encodes
 * arrays as Postgres array literals → "invalid input syntax for type json".
 */
function bindRpcArg(
  val: unknown,
  pgType: string | undefined,
  paramIndex: number
): { placeholder: string; value: unknown } {
  const t = (pgType || "").toLowerCase();
  if (val === null || val === undefined) {
    return { placeholder: `$${paramIndex}`, value: null };
  }
  if (t === "jsonb" || t === "json") {
    return {
      placeholder: `$${paramIndex}::${t}`,
      value: typeof val === "string" ? val : JSON.stringify(val),
    };
  }
  // Heuristic when type unknown: plain objects / arrays-of-objects → jsonb
  if (
    typeof val === "object" &&
    !(val instanceof Date) &&
    !Buffer.isBuffer(val) &&
    (!Array.isArray(val) ||
      val.some((x) => x !== null && typeof x === "object" && !(x instanceof Date)))
  ) {
    return {
      placeholder: `$${paramIndex}::jsonb`,
      value: JSON.stringify(val),
    };
  }
  if (Array.isArray(val) && t.endsWith("[]")) {
    return { placeholder: `$${paramIndex}::${t}`, value: val };
  }
  return { placeholder: `$${paramIndex}`, value: val };
}

/**
 * Call a public.* Postgres function by name.
 * Args are passed positionally ($1,$2,...) in the order of `argOrder` keys,
 * using values from `args` (JSON body).
 */
export async function callRpc(
  fnName: string,
  argOrder: string[],
  args: Record<string, unknown> = {},
  jwt: JwtClaims | null = null
): Promise<unknown> {
  if (!/^[a-z_][a-z0-9_]*$/i.test(fnName)) {
    throw new Error(`Invalid RPC name: ${fnName}`);
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await applyJwtClaims(client, jwt);

    const { rows: metaRows } = await client.query<{
      proretset: boolean;
      proargnames: string[] | null;
      argtypes: string[] | null;
    }>(
      `SELECT p.proretset,
              p.proargnames,
              ARRAY(
                SELECT format_type(t, NULL)
                FROM unnest(p.proargtypes) AS t
              ) AS argtypes
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = $1 AND p.prokind = 'f'
       ORDER BY p.oid
       LIMIT 1`,
      [fnName]
    );
    const isSet = Boolean(metaRows[0]?.proretset);
    const pgNames = metaRows[0]?.proargnames || [];
    const pgTypes = metaRows[0]?.argtypes || [];
    const typeByName = new Map<string, string>();
    for (let i = 0; i < pgNames.length; i++) {
      if (pgNames[i]) typeByName.set(pgNames[i], pgTypes[i] || "");
    }

    const placeholders: string[] = [];
    const values: unknown[] = [];
    argOrder.forEach((key, i) => {
      const bound = bindRpcArg(
        key in args ? args[key] : null,
        typeByName.get(key),
        i + 1
      );
      placeholders.push(bound.placeholder);
      values.push(bound.value);
    });
    const ph = placeholders.join(", ");

    if (isSet) {
      // Wrap in a subquery so single-column TABLE(...)/SETOF basetype still
      // form a record (row_to_json(text) does not exist).
      const setSql =
        argOrder.length === 0
          ? `SELECT row_to_json(t) AS row FROM (SELECT * FROM public.${fnName}()) t`
          : `SELECT row_to_json(t) AS row FROM (SELECT * FROM public.${fnName}(${ph})) t`;
      const { rows } = await client.query<{ row: unknown }>(setSql, values);
      await client.query("COMMIT");
      return rows.map((r) => r.row);
    }

    const sql =
      argOrder.length === 0
        ? `SELECT public.${fnName}() AS result`
        : `SELECT public.${fnName}(${ph}) AS result`;
    const { rows } = await client.query<{ result: unknown }>(sql, values);
    await client.query("COMMIT");
    return rows[0]?.result ?? null;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Discover public function arg names from Postgres, then call it with named body args. */
export async function callRpcAuto(
  fnName: string,
  args: Record<string, unknown> = {},
  jwt: JwtClaims | null = null
): Promise<unknown> {
  if (!/^[a-z_][a-z0-9_]*$/i.test(fnName)) {
    throw new Error(`Invalid RPC name: ${fnName}`);
  }

  const { rows } = await query<{ args: string }>(
    `SELECT pg_get_function_identity_arguments(p.oid) AS args
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = $1 AND p.prokind = 'f'
     ORDER BY p.oid
     LIMIT 1`,
    [fnName]
  );

  if (!rows[0]) {
    throw new Error(`Function public.${fnName} does not exist on RDS`);
  }

  const identity = String(rows[0].args || "").trim();
  const argOrder: string[] = [];
  if (identity) {
    // "p_email text, p_plain text" → ["p_email","p_plain"]
    for (const part of identity.split(",")) {
      const name = part.trim().split(/\s+/)[0];
      if (name) argOrder.push(name);
    }
  }
  return callRpc(fnName, argOrder, args, jwt);
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
