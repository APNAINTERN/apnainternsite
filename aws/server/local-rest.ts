/**
 * Minimal PostgREST-compatible shim over RDS for local testing.
 * GET/POST/PATCH/DELETE /rest/v1/:table
 * POST /rest/v1/rpc/:name
 */
import type { Request, Response } from "express";
import type { QueryResult, QueryResultRow } from "pg";
import { callRpcAuto, query, withJwtSession } from "./db";
import { getRpcDef } from "./rpc-registry";
import { callRpc } from "./db";
import { verifyToken } from "./local-jwt";

function jwtFromRequest(req: Request) {
  const h = String(req.headers.authorization || "");
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const payload = verifyToken(m[1]);
  if (!payload?.sub) return null;
  return {
    sub: String(payload.sub),
    email: payload.email ? String(payload.email) : undefined,
    role: payload.role ? String(payload.role) : "authenticated",
  };
}

const IDENT = /^[a-z_][a-z0-9_]*$/i;

/** Tables we allow through the local PostgREST shim (public schema only). */
const BLOCKED = new Set(["pg_catalog", "information_schema"]);

/** Prefer real Postgres SQLSTATE from node-pg; do not invent unique-violation codes. */
function pgErrorPayload(err: unknown): { message: string; code: string } {
  const message = err instanceof Error ? err.message : String(err);
  const codeRaw = (err as { code?: unknown } | null)?.code;
  const code =
    typeof codeRaw === "string" && /^[0-9A-Z]{5}$/i.test(codeRaw) ? codeRaw : "XX000";
  return { message, code };
}

function parseSelect(raw: unknown): string {
  if (raw == null || raw === "" || raw === "*") return "*";
  const s = String(raw);
  // Parse PostgREST select lists with embeds: "a,b,related(c,d),e"
  // Only keep top-level identifiers (skip resource embeds).
  const topLevel: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") {
      depth += 1;
      cur += ch;
      continue;
    }
    if (ch === ")") {
      depth = Math.max(0, depth - 1);
      cur += ch;
      continue;
    }
    if (ch === "," && depth === 0) {
      topLevel.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) topLevel.push(cur.trim());

  const cols = topLevel
    .map((p) => p.replace(/\s+/g, ""))
    .filter((p) => p && !p.includes("(") && IDENT.test(p));

  if (!cols.length) return "*";
  return cols.map((c) => `"${c}"`).join(", ");
}

type Op =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "like"
  | "ilike"
  | "is"
  | "in";

function parseFilterValue(op: Op, raw: string): unknown {
  if (op === "is") {
    if (raw === "null") return null;
    if (raw === "true") return true;
    if (raw === "false") return false;
    return raw;
  }
  if (op === "in") {
    // (a,b,c) or ("a","b")
    const inner = raw.replace(/^\(/, "").replace(/\)$/, "");
    return inner.split(",").map((x) => x.trim().replace(/^"|"$/g, ""));
  }
  return raw;
}

function buildWhere(
  queryObj: Record<string, unknown>
): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const parts: string[] = [];
  const reserved = new Set([
    "select",
    "order",
    "limit",
    "offset",
    "on_conflict",
    "columns",
    "or",
  ]);

  for (const [key, val] of Object.entries(queryObj)) {
    if (reserved.has(key)) continue;
    if (!IDENT.test(key)) continue;
    const v = Array.isArray(val) ? val[0] : val;
    if (v == null) continue;
    const str = String(v);
    const m = str.match(
      /^(eq|neq|gt|gte|lt|lte|like|ilike|is|in)\.(.+)$/
    );
    if (!m) {
      // bare value → eq
      params.push(str);
      parts.push(`"${key}" = $${params.length}`);
      continue;
    }
    const op = m[1] as Op;
    const raw = m[2];
    const parsed = parseFilterValue(op, raw);
    if (op === "is") {
      if (parsed === null) parts.push(`"${key}" IS NULL`);
      else if (parsed === true) parts.push(`"${key}" IS TRUE`);
      else if (parsed === false) parts.push(`"${key}" IS FALSE`);
      else {
        params.push(parsed);
        parts.push(`"${key}" = $${params.length}`);
      }
      continue;
    }
    if (op === "in") {
      const arr = parsed as unknown[];
      params.push(arr);
      // Always compare as text. RDS has mixed id types (students.id / beu_details.student_id
      // are text; some tables use uuid). Casting *_id filters to uuid[] breaks text columns
      // ("operator does not exist: text = uuid").
      parts.push(`"${key}"::text = ANY($${params.length}::text[])`);
      continue;
    }
    const sqlOp: Record<string, string> = {
      eq: "=",
      neq: "<>",
      gt: ">",
      gte: ">=",
      lt: "<",
      lte: "<=",
      like: "LIKE",
      ilike: "ILIKE",
    };
    params.push(parsed);
    parts.push(`"${key}" ${sqlOp[op]} $${params.length}`);
  }

  // PostgREST or=… including keyset cursors:
  //   created_at.lt."2026-01-01",and(created_at.eq."2026-01-01",id.lt."abc")
  const orRaw = queryObj.or;
  if (orRaw) {
    const s = String(Array.isArray(orRaw) ? orRaw[0] : orRaw);
    const inner = s.replace(/^\(/, "").replace(/\)$/, "");
    const orParts: string[] = [];

    const pushSimple = (chunk: string) => {
      const mm = chunk
        .trim()
        .match(/^([a-z0-9_]+)\.(eq|neq|gt|gte|lt|lte|ilike|like)\.(.+)$/i);
      if (!mm || !IDENT.test(mm[1])) return;
      const [, col, op, rawVal] = mm;
      let val = rawVal;
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1).replace(/\\"/g, '"');
      }
      params.push(val);
      const sqlOp =
        op === "eq"
          ? "="
          : op === "neq"
            ? "<>"
            : op === "gt"
              ? ">"
              : op === "gte"
                ? ">="
                : op === "lt"
                  ? "<"
                  : op === "lte"
                    ? "<="
                    : op.toUpperCase();
      orParts.push(`"${col}" ${sqlOp} $${params.length}`);
    };

    // Split top-level commas, keeping and(...) groups intact
    let depth = 0;
    let buf = "";
    const chunks: string[] = [];
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if (ch === "(") depth++;
      if (ch === ")") depth = Math.max(0, depth - 1);
      if (ch === "," && depth === 0) {
        if (buf.trim()) chunks.push(buf.trim());
        buf = "";
        continue;
      }
      buf += ch;
    }
    if (buf.trim()) chunks.push(buf.trim());

    for (const chunk of chunks) {
      const andMatch = chunk.match(/^and\((.+)\)$/i);
      if (andMatch) {
        const andInner = andMatch[1];
        const andBits: string[] = [];
        let d2 = 0;
        let b2 = "";
        const andChunks: string[] = [];
        for (let i = 0; i < andInner.length; i++) {
          const ch = andInner[i];
          if (ch === "(") d2++;
          if (ch === ")") d2 = Math.max(0, d2 - 1);
          if (ch === "," && d2 === 0) {
            if (b2.trim()) andChunks.push(b2.trim());
            b2 = "";
            continue;
          }
          b2 += ch;
        }
        if (b2.trim()) andChunks.push(b2.trim());

        const before = orParts.length;
        for (const ac of andChunks) {
          const mm = ac
            .trim()
            .match(/^([a-z0-9_]+)\.(eq|neq|gt|gte|lt|lte|ilike|like)\.(.+)$/i);
          if (!mm || !IDENT.test(mm[1])) continue;
          const [, col, op, rawVal] = mm;
          let val = rawVal;
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1).replace(/\\"/g, '"');
          }
          params.push(val);
          const sqlOp =
            op === "eq"
              ? "="
              : op === "neq"
                ? "<>"
                : op === "gt"
                  ? ">"
                  : op === "gte"
                    ? ">="
                    : op === "lt"
                      ? "<"
                      : op === "lte"
                        ? "<="
                        : op.toUpperCase();
          andBits.push(`"${col}" ${sqlOp} $${params.length}`);
        }
        if (andBits.length) orParts.push(`(${andBits.join(" AND ")})`);
        else void before;
        continue;
      }
      pushSimple(chunk);
    }

    if (orParts.length) parts.push(`(${orParts.join(" OR ")})`);
  }

  return { sql: parts.length ? parts.join(" AND ") : "", params };
}

function parseOrder(raw: unknown): string {
  if (!raw) return "";
  const s = String(Array.isArray(raw) ? raw[0] : raw);
  // col.asc,col2.desc.nullslast
  const bits: string[] = [];
  for (const part of s.split(",")) {
    const [col, dir] = part.trim().split(".");
    if (!IDENT.test(col)) continue;
    bits.push(`"${col}" ${dir?.toLowerCase() === "desc" ? "DESC" : "ASC"}`);
  }
  return bits.length ? ` ORDER BY ${bits.join(", ")}` : "";
}

function preferReturn(req: Request): boolean {
  const p = String(req.headers.prefer || "");
  return /return=representation/i.test(p);
}

/**
 * Encode write values for Postgres. JS arrays/objects must be JSON text + jsonb cast
 * (node-pg otherwise sends arrays as PG arrays → "invalid input syntax for type json").
 */
function bindWriteValue(
  val: unknown,
  paramIndex: number
): { placeholder: string; value: unknown } {
  if (val === null || val === undefined) {
    return { placeholder: `$${paramIndex}`, value: null };
  }
  if (typeof val === "boolean" || typeof val === "number" || typeof val === "string") {
    return { placeholder: `$${paramIndex}`, value: val };
  }
  if (val instanceof Date) {
    return { placeholder: `$${paramIndex}`, value: val.toISOString() };
  }
  // objects & arrays → jsonb (also assignable to text columns that store JSON)
  return {
    placeholder: `$${paramIndex}::jsonb`,
    value: JSON.stringify(val),
  };
}

function tableName(param: string): string {
  if (!IDENT.test(param) || BLOCKED.has(param)) {
    throw new Error(`Invalid table: ${param}`);
  }
  return param;
}

type RestQueryFn = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) => Promise<QueryResult<T>>;

/** Run REST SQL with JWT claims when Authorization is present (RLS / auth.uid()). */
async function withRestDb<T>(req: Request, fn: (q: RestQueryFn) => Promise<T>): Promise<T> {
  const jwt = jwtFromRequest(req);
  if (!jwt?.sub) return fn(query);
  return withJwtSession(jwt, (client) => fn((text, params) => client.query(text, params)));
}

export async function restGet(req: Request, res: Response) {
  try {
    await withRestDb(req, async (q) => {
      const table = tableName(String(req.params.table));
      const { sql: where, params } = buildWhere(req.query as Record<string, unknown>);

      // PostgREST HEAD + count=exact (used by supabase .select('*', { count: 'exact', head: true }))
      if (req.method === "HEAD") {
        let countSql = `SELECT count(*)::int AS c FROM public."${table}"`;
        if (where) countSql += ` WHERE ${where}`;
        const { rows: countRows } = await q(countSql, params);
        const total = Number(countRows[0]?.c ?? 0);
        res.setHeader("Content-Range", `0-0/${total}`);
        res.status(200).end();
        return;
      }

      const cols = parseSelect(req.query.select);
      const order = parseOrder(req.query.order);
      const limit = Math.min(Number(req.query.limit) || 1000, 5000);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const prefer = String(req.headers.prefer || "");
      const wantCount = /count=exact/i.test(prefer);

      let total: number | null = null;
      if (wantCount) {
        let countSql = `SELECT count(*)::int AS c FROM public."${table}"`;
        if (where) countSql += ` WHERE ${where}`;
        const { rows: countRows } = await q(countSql, params);
        total = Number(countRows[0]?.c ?? 0);
      }

      let sql = `SELECT ${cols} FROM public."${table}"`;
      if (where) sql += ` WHERE ${where}`;
      sql += order;
      sql += ` LIMIT ${limit} OFFSET ${offset}`;

      const { rows } = await q(sql, params);

      const accept = String(req.headers.accept || "");
      if (/vnd\.pgrst\.object/.test(accept)) {
        if (!rows.length) {
          res.status(406).json({
            code: "PGRST116",
            details: "The result contains 0 rows",
            hint: null,
            message: "JSON object requested, multiple (or no) rows returned",
          });
          return;
        }
        res.json(rows[0]);
        return;
      }

      const rangeTotal = total ?? rows.length;
      const start = rows.length ? offset : 0;
      const end = rows.length ? offset + rows.length - 1 : 0;
      res.setHeader("Content-Range", `${start}-${end}/${rangeTotal}`);
      if (wantCount) res.setHeader("Prefer-Count", "exact");
      res.json(rows);
    });
  } catch (err) {
    console.error("[rest/GET]", err);
    res.status(400).json(pgErrorPayload(err));
  }
}

export async function restPost(req: Request, res: Response) {
  try {
    await withRestDb(req, async (q) => {
      const table = tableName(String(req.params.table));
      const body = req.body;
      const rowsIn = Array.isArray(body) ? body : [body];
      if (!rowsIn.length || typeof rowsIn[0] !== "object") {
        res.status(400).json({ message: "Invalid body" });
        return;
      }

      const prefer = String(req.headers.prefer || "");
      const upsert =
        /resolution=merge-duplicates/i.test(prefer) ||
        /resolution=ignore-duplicates/i.test(prefer) ||
        Boolean(String(req.query.on_conflict || "").trim());
      const ignoreDuplicates = /resolution=ignore-duplicates/i.test(prefer);
      const onConflict = String(req.query.on_conflict || "").trim();

      const cols = Object.keys(rowsIn[0] as object).filter((k) => IDENT.test(k));
      if (!cols.length) {
        res.status(400).json({ message: "No columns" });
        return;
      }

      const values: unknown[] = [];
      const valueSql: string[] = [];
      rowsIn.forEach((row) => {
        const placeholders: string[] = [];
        for (const c of cols) {
          const bound = bindWriteValue((row as Record<string, unknown>)[c], values.length + 1);
          values.push(bound.value);
          placeholders.push(bound.placeholder);
        }
        valueSql.push(`(${placeholders.join(",")})`);
      });

      let sql = `INSERT INTO public."${table}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES ${valueSql.join(",")}`;
      if (upsert && onConflict) {
        const conflictCols = onConflict
          .split(",")
          .map((c) => c.trim())
          .filter((c) => IDENT.test(c));
        if (conflictCols.length) {
          if (ignoreDuplicates) {
            sql += ` ON CONFLICT (${conflictCols.map((c) => `"${c}"`).join(",")}) DO NOTHING`;
          } else {
            const updates = cols
              .filter((c) => !conflictCols.includes(c))
              .map((c) => `"${c}" = EXCLUDED."${c}"`)
              .join(", ");
            sql += ` ON CONFLICT (${conflictCols.map((c) => `"${c}"`).join(",")}) DO UPDATE SET ${updates || `"${conflictCols[0]}" = EXCLUDED."${conflictCols[0]}"`}`;
          }
        }
      }
      if (preferReturn(req)) {
        sql += ` RETURNING *`;
      }

      const result = await q(sql, values);
      if (preferReturn(req)) {
        const accept = String(req.headers.accept || "");
        if (/vnd\.pgrst\.object/.test(accept) || !Array.isArray(body)) {
          res.status(201).json(result.rows[0] ?? null);
          return;
        }
        res.status(201).json(result.rows);
        return;
      }
      res.status(201).json(null);
    });
  } catch (err) {
    console.error("[rest/POST]", err);
    res.status(400).json(pgErrorPayload(err));
  }
}

export async function restPatch(req: Request, res: Response) {
  try {
    await withRestDb(req, async (q) => {
      const table = tableName(String(req.params.table));
      const patch = req.body && typeof req.body === "object" ? req.body : {};
      const cols = Object.keys(patch).filter((k) => IDENT.test(k));
      if (!cols.length) {
        res.status(400).json({ message: "No columns to update" });
        return;
      }
      const { sql: where, params } = buildWhere(req.query as Record<string, unknown>);
      if (!where) {
        res.status(400).json({ message: "PATCH requires filters" });
        return;
      }
      const sets: string[] = [];
      const values: unknown[] = [];
      for (const c of cols) {
        const bound = bindWriteValue((patch as Record<string, unknown>)[c], values.length + 1);
        values.push(bound.value);
        sets.push(`"${c}" = ${bound.placeholder}`);
      }
      const whereShifted = where.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + values.length}`);
      let sql = `UPDATE public."${table}" SET ${sets.join(", ")} WHERE ${whereShifted}`;
      if (preferReturn(req)) sql += ` RETURNING *`;
      const result = await q(sql, [...values, ...params]);
      if (preferReturn(req)) {
        const accept = String(req.headers.accept || "");
        if (/vnd\.pgrst\.object/.test(accept)) {
          res.json(result.rows[0] ?? null);
          return;
        }
        res.json(result.rows);
        return;
      }
      res.status(204).end();
    });
  } catch (err) {
    console.error("[rest/PATCH]", err);
    res.status(400).json(pgErrorPayload(err));
  }
}

export async function restDelete(req: Request, res: Response) {
  try {
    await withRestDb(req, async (q) => {
      const table = tableName(String(req.params.table));
      const { sql: where, params } = buildWhere(req.query as Record<string, unknown>);
      if (!where) {
        res.status(400).json({ message: "DELETE requires filters" });
        return;
      }
      let sql = `DELETE FROM public."${table}" WHERE ${where}`;
      if (preferReturn(req)) sql += ` RETURNING *`;
      const result = await q(sql, params);
      if (preferReturn(req)) {
        res.json(result.rows);
        return;
      }
      res.status(204).end();
    });
  } catch (err) {
    console.error("[rest/DELETE]", err);
    res.status(400).json(pgErrorPayload(err));
  }
}

export async function restRpc(req: Request, res: Response) {
  try {
    const name = String(req.params.name || "");
    if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
      res.status(400).json({ message: "Invalid RPC name" });
      return;
    }
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<
      string,
      unknown
    >;
    const jwt = jwtFromRequest(req);
    const def = getRpcDef(name);
    // Admin/student RPCs require a valid session JWT (sets auth.uid() on RDS).
    if (name.startsWith("admin_") || name.startsWith("student_")) {
      if (def?.auth === "public") {
        // registry-public student_* (e.g. repair) — allow without token
      } else if (!jwt) {
        res.status(401).json({ message: "JWT required" });
        return;
      }
    }
    const data = def
      ? await callRpc(name, def.args, body, jwt)
      : await callRpcAuto(name, body, jwt);
    res.json(data);
  } catch (err) {
    console.error("[rest/rpc]", err);
    res.status(400).json(pgErrorPayload(err));
  }
}

/** Stub storage so client does not fall through to supabase.co */
export function storageStub(_req: Request, res: Response) {
  res.status(501).json({
    statusCode: "501",
    error: "not_implemented",
    message: "Local mode: storage is not migrated yet. Use S3 in a later phase.",
  });
}
