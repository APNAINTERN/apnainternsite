/**
 * Run multiple whitelisted SELECTs in one Lambda invocation (admin bootstrap).
 */
import { query } from "./db";

const ALLOWED_TABLES = new Set([
  "user_roles",
  "cybercafe_profiles",
  "students",
  "payment_config",
  "profiles",
  "universities",
  "colleges",
  "internship_domains",
  "academic_info",
  "certificates",
  "system_settings",
  "site_settings",
  "attendance",
  "classes",
  "learning_materials",
  "admin_staff",
  "admin_permissions",
  "notifications",
  "assignments",
  "engineering_university_configs",
  "non_engineering_university_configs",
]);

const IDENT = /^[a-z_][a-z0-9_]*$/i;

type Filter =
  | { op: "eq"; column: string; value: unknown }
  | { op: "ilike"; column: string; value: unknown };

export type BatchQuerySpec = {
  key: string;
  table: string;
  columns?: string;
  filters?: Filter[];
  order?: { column: string; ascending?: boolean } | null;
  limit?: number;
  single?: boolean;
};

function parseColumns(raw: unknown): string {
  if (raw == null || raw === "*" || raw === "") return "*";
  const s = String(raw);
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return "*";
  for (const p of parts) {
    if (!IDENT.test(p)) throw new Error(`Invalid column: ${p}`);
  }
  return parts.map((p) => `"${p}"`).join(", ");
}

async function runOne(spec: BatchQuerySpec): Promise<unknown> {
  const table = String(spec.table || "").trim();
  if (!ALLOWED_TABLES.has(table) || !IDENT.test(table)) {
    throw new Error(`Table '${table}' is not allowed`);
  }

  const cols = parseColumns(spec.columns);
  const params: unknown[] = [];
  const where: string[] = [];
  for (const f of spec.filters || []) {
    if (!f || !IDENT.test(f.column)) throw new Error("Invalid filter column");
    params.push(f.value);
    const idx = params.length;
    if (f.op === "eq") where.push(`"${f.column}" = $${idx}`);
    else if (f.op === "ilike") where.push(`"${f.column}" ILIKE $${idx}`);
    else throw new Error("Unsupported filter op");
  }

  let sql = `SELECT ${cols} FROM public."${table}"`;
  if (where.length) sql += ` WHERE ${where.join(" AND ")}`;

  if (spec.order?.column) {
    if (!IDENT.test(spec.order.column)) throw new Error("Invalid order column");
    sql += ` ORDER BY "${spec.order.column}" ${spec.order.ascending === false ? "DESC" : "ASC"}`;
  }

  const limit = Math.min(Math.max(Number(spec.limit) || 1000, 1), 5000);
  sql += ` LIMIT ${limit}`;

  const { rows } = await query(sql, params);
  if (spec.single) return rows[0] ?? null;
  return rows;
}

export async function runBatchSelect(
  queries: BatchQuerySpec[]
): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};
  for (const spec of queries) {
    const key = String(spec.key || spec.table || "").trim();
    if (!key || !IDENT.test(key)) throw new Error("Invalid batch query key");
    results[key] = await runOne(spec);
  }
  return results;
}
