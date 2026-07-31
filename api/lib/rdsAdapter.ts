/**
 * Minimal Supabase-shaped client for server routes → AWS RDS.
 * Covers payment enrollment, registration checks, and local auth admin.
 */
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { callRpcAuto, query } from "../../aws/server/db";
import { verifyToken } from "../../aws/server/local-jwt";

const IDENT = /^[a-z_][a-z0-9_]*$/i;

type DbError = { message?: string; code?: string };
type DbResult<T> = { data: T; error: DbError | null };

type Filter =
  | { kind: "eq"; col: string; val: unknown }
  | { kind: "ilike"; col: string; val: unknown }
  | { kind: "not_null"; col: string };

class RdsTableQuery {
  private table: string;
  private columns = "*";
  private filters: Filter[] = [];
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;
  private single = false;

  constructor(table: string) {
    if (!IDENT.test(table)) throw new Error(`Invalid table: ${table}`);
    this.table = table;
  }

  select(cols: string) {
    this.columns = cols?.trim() || "*";
    return this;
  }

  eq(col: string, val: unknown) {
    this.filters.push({ kind: "eq", col, val });
    return this;
  }

  ilike(col: string, val: unknown) {
    this.filters.push({ kind: "ilike", col, val });
    return this;
  }

  not(col: string, op: string, val: unknown) {
    if (op === "is" && val === null) {
      this.filters.push({ kind: "not_null", col });
    }
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col;
    this.orderAsc = opts?.ascending !== false;
    return this;
  }

  limit(n: number) {
    this.limitN = n;
    return this;
  }

  maybeSingle() {
    this.single = true;
    this.limitN = 1;
    return this.executeOne();
  }

  private async executeOne(): Promise<DbResult<Record<string, unknown> | null>> {
    const rows = await this.runSelect();
    if (rows.length === 0) return { data: null, error: null };
    return { data: rows[0], error: null };
  }

  async then<TResult1 = DbResult<Record<string, unknown>[]>, TResult2 = never>(
    onfulfilled?: ((value: DbResult<Record<string, unknown>[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    try {
      const rows = await this.runSelect();
      const result: DbResult<Record<string, unknown>[]> = { data: rows, error: null };
      return onfulfilled ? onfulfilled(result) : (result as unknown as TResult1);
    } catch (err) {
      const result: DbResult<Record<string, unknown>[]> = {
        data: [],
        error: { message: err instanceof Error ? err.message : String(err) },
      };
      if (onrejected) return onrejected(err);
      return onfulfilled ? onfulfilled(result) : (result as unknown as TResult1);
    }
  }

  private colSql(cols: string): string {
    if (cols === "*") return "*";
    return cols
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => {
        if (!IDENT.test(c)) throw new Error(`Invalid column: ${c}`);
        return `"${c}"`;
      })
      .join(", ");
  }

  private async runSelect(): Promise<Record<string, unknown>[]> {
    const values: unknown[] = [];
    const where: string[] = [];
    for (const f of this.filters) {
      if (!IDENT.test(f.col)) throw new Error(`Invalid column: ${f.col}`);
      if (f.kind === "eq") {
        values.push(f.val);
        where.push(`"${f.col}" = $${values.length}`);
      } else if (f.kind === "ilike") {
        values.push(f.val);
        where.push(`"${f.col}" ILIKE $${values.length}`);
      } else if (f.kind === "not_null") {
        where.push(`"${f.col}" IS NOT NULL`);
      }
    }

    let sql = `SELECT ${this.colSql(this.columns)} FROM public."${this.table}"`;
    if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
    if (this.orderCol) {
      if (!IDENT.test(this.orderCol)) throw new Error(`Invalid order column: ${this.orderCol}`);
      sql += ` ORDER BY "${this.orderCol}" ${this.orderAsc ? "ASC" : "DESC"} NULLS LAST`;
    }
    if (this.limitN != null) sql += ` LIMIT ${Math.max(1, this.limitN)}`;

    const { rows } = await query<Record<string, unknown>>(sql, values);
    return rows;
  }

  async insert(row: Record<string, unknown>): Promise<DbResult<null>> {
    try {
      const cols = Object.keys(row).filter((k) => IDENT.test(k));
      if (!cols.length) return { data: null, error: { message: "No columns" } };
      const values = cols.map((c) => row[c]);
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      await query(
        `INSERT INTO public."${this.table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`,
        values
      );
      return { data: null, error: null };
    } catch (err) {
      return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
    }
  }

  update(patch: Record<string, unknown>) {
    return new RdsUpdateQuery(this.table, this.filters, patch);
  }

  delete() {
    return new RdsDeleteQuery(this.table, this.filters);
  }

  upsert(
    row: Record<string, unknown>,
    opts?: { onConflict?: string }
  ): Promise<DbResult<null>> {
    return upsertRow(this.table, row, opts?.onConflict);
  }
}

class RdsDeleteQuery {
  constructor(
    private table: string,
    private filters: Filter[]
  ) {}

  eq(col: string, val: unknown) {
    this.filters.push({ kind: "eq", col, val });
    return this;
  }

  async then<TResult1 = DbResult<null>, TResult2 = never>(
    onfulfilled?: ((value: DbResult<null>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    try {
      const values: unknown[] = [];
      const where: string[] = [];
      for (const f of this.filters) {
        if (f.kind === "eq") {
          values.push(f.val);
          where.push(`"${f.col}" = $${values.length}`);
        }
      }
      if (!where.length) return { data: null, error: { message: "DELETE requires filters" } } as TResult1;
      await query(
        `DELETE FROM public."${this.table}" WHERE ${where.join(" AND ")}`,
        values
      );
      const result = { data: null, error: null };
      return onfulfilled ? onfulfilled(result) : (result as unknown as TResult1);
    } catch (err) {
      const result = { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
      if (onrejected) return onrejected(err);
      return onfulfilled ? onfulfilled(result) : (result as unknown as TResult1);
    }
  }
}

async function upsertRow(
  table: string,
  row: Record<string, unknown>,
  onConflict?: string
): Promise<DbResult<null>> {
  try {
    const cols = Object.keys(row).filter((k) => IDENT.test(k));
    if (!cols.length) return { data: null, error: { message: "No columns" } };
    const values = cols.map((c) => row[c]);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const conflictCols = (onConflict || "id")
      .split(",")
      .map((c) => c.trim())
      .filter((c) => IDENT.test(c));
    const updates = cols
      .filter((c) => !conflictCols.includes(c))
      .map((c) => `"${c}" = EXCLUDED."${c}"`)
      .join(", ");

    const sql = `INSERT INTO public."${table}" (${cols.map((c) => `"${c}"`).join(", ")})
      VALUES (${placeholders})
      ON CONFLICT (${conflictCols.map((c) => `"${c}"`).join(", ")})
      DO UPDATE SET ${updates || `"${conflictCols[0]}" = EXCLUDED."${conflictCols[0]}"`}`;
    await query(sql, values);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
  }
}

async function signOutUser(_userId: string, _scope?: string): Promise<DbResult<null>> {
  // Local JWT mode: no server-side refresh token table; client clears storage.
  return { data: null, error: null };
}

class RdsUpdateQuery {
  constructor(
    private table: string,
    private filters: Filter[],
    private patch: Record<string, unknown>
  ) {}

  eq(col: string, val: unknown) {
    this.filters.push({ kind: "eq", col, val });
    return this;
  }

  async then<TResult1 = DbResult<null>, TResult2 = never>(
    onfulfilled?: ((value: DbResult<null>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    try {
      const cols = Object.keys(this.patch).filter((k) => IDENT.test(k));
      if (!cols.length) return { data: null, error: { message: "No columns" } } as TResult1;

      const values: unknown[] = cols.map((c) => this.patch[c]);
      const sets = cols.map((c, i) => `"${c}" = $${i + 1}`);
      const where: string[] = [];
      for (const f of this.filters) {
        if (f.kind === "eq") {
          values.push(f.val);
          where.push(`"${f.col}" = $${values.length}`);
        }
      }
      if (!where.length) return { data: null, error: { message: "UPDATE requires filters" } } as TResult1;

      await query(
        `UPDATE public."${this.table}" SET ${sets.join(", ")} WHERE ${where.join(" AND ")}`,
        values
      );
      const result = { data: null, error: null };
      return onfulfilled ? onfulfilled(result) : (result as unknown as TResult1);
    } catch (err) {
      const result = { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
      if (onrejected) return onrejected(err);
      return onfulfilled ? onfulfilled(result) : (result as unknown as TResult1);
    }
  }
}

async function createAuthUser(opts: {
  email: string;
  password: string;
  email_confirm?: boolean;
  user_metadata?: Record<string, unknown>;
}): Promise<DbResult<{ user: { id: string } }>> {
  const email = opts.email.trim().toLowerCase();
  const { rows: existing } = await query<{ id: string }>(
    `SELECT id FROM auth.users WHERE lower(email) = $1 LIMIT 1`,
    [email]
  );
  if (existing[0]) {
    return {
      data: null,
      error: { message: "User already registered", code: "user_already_exists" },
    };
  }

  const hash = await bcrypt.hash(opts.password, 10);
  const meta = JSON.stringify(opts.user_metadata || {});
  const { rows } = await query<{ id: string }>(
    `INSERT INTO auth.users (
       id, instance_id, aud, role, email, encrypted_password,
       email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
       created_at, updated_at, is_sso_user, is_anonymous
     ) VALUES (
       gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', $1, $2,
       CASE WHEN $3 THEN now() ELSE NULL END,
       '{"provider":"email","providers":["email"]}'::jsonb, $4::jsonb,
       now(), now(), false, false
     )
     RETURNING id`,
    [email, hash, opts.email_confirm !== false, meta]
  );
  const userId = rows[0]?.id;
  if (!userId) return { data: null, error: { message: "signup_failed" } };

  try {
    await query(
      `INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::jsonb, 'email', $4, now(), now(), now())
       ON CONFLICT DO NOTHING`,
      [randomUUID(), userId, JSON.stringify({ sub: userId, email }), email]
    );
  } catch {
    /* optional */
  }

  return { data: { user: { id: userId } }, error: null };
}

async function getUserFromToken(
  token: string
): Promise<DbResult<{ user: { id: string; email?: string | null } }>> {
  const payload = verifyToken(token);
  if (!payload?.sub) {
    return { data: null, error: { message: "Invalid or expired session" } };
  }
  const { rows } = await query<{ id: string; email: string | null }>(
    `SELECT id, email FROM auth.users WHERE id = $1::uuid LIMIT 1`,
    [String(payload.sub)]
  );
  const row = rows[0];
  if (!row) {
    return {
      data: { user: { id: String(payload.sub), email: String(payload.email || "") } },
      error: null,
    };
  }
  return { data: { user: { id: row.id, email: row.email } }, error: null };
}

export type ServerDbLike = {
  from: (table: string) => RdsTableQuery;
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => Promise<{ data: unknown; error: DbError | null }>;
  auth: {
    admin: {
      createUser: (opts: {
        email: string;
        password: string;
        email_confirm?: boolean;
        user_metadata?: Record<string, unknown>;
      }) => Promise<DbResult<{ user: { id: string } }>>;
      signOut: (userId: string, scope?: string) => Promise<DbResult<null>>;
    };
    getUser: (token: string) => Promise<DbResult<{ user: { id: string; email?: string | null } }>>;
  };
};

export function createRdsAdapter(): ServerDbLike {
  return {
    from(table: string) {
      return new RdsTableQuery(table);
    },
    async rpc(fn, args = {}) {
      try {
        const data = await callRpcAuto(fn, args);
        return { data, error: null };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Only missing functions — not "operator does not exist: text = uuid"
        const code =
          /function .* does not exist|42883/i.test(message) &&
          !/operator does not exist/i.test(message)
            ? "PGRST202"
            : undefined;
        return { data: null, error: { message, code } };
      }
    },
    auth: {
      admin: {
        createUser: createAuthUser,
        signOut: signOutUser,
      },
      getUser: getUserFromToken,
    },
  };
}
