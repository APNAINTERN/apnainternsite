/**
 * Whitelisted table SELECT against RDS (admin-only).
 *
 * POST /api/data/select
 * body: { table, columns?, filters?, order?, limit?, single? }
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "../aws/server/db";
import {
  applyCorsHeaders,
  applySecurityHeaders,
  BLOCKED_SENSITIVE_TABLES,
  requireAdmin,
} from "./lib/apiSecurity";

const ALLOWED_TABLES = new Set([
  "user_roles",
  "cybercafe_profiles",
  "students",
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
  "notification_deliveries",
  "assignments",
  "assignment_submissions",
  "registration_leads",
  "prefilled_students",
  "referral_partners",
  "referral_partner_assignments",
  "college_admin_assignments",
  "employee_attendance",
]);

const IDENT = /^[a-z_][a-z0-9_]*$/i;

type Filter =
  | { op: "eq"; column: string; value: unknown }
  | { op: "ilike"; column: string; value: unknown };

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCorsHeaders(req, res);
  applySecurityHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!process.env.DATABASE_URL) {
    res.status(503).json({ error: "DATABASE_URL not configured" });
    return;
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const body = (req.body && typeof req.body === "object" ? req.body : {}) as {
    table?: string;
    columns?: string;
    filters?: Filter[];
    order?: { column: string; ascending?: boolean } | null;
    limit?: number;
    single?: boolean;
  };

  const table = String(body.table || "").trim();
  if (!ALLOWED_TABLES.has(table) || !IDENT.test(table) || BLOCKED_SENSITIVE_TABLES.has(table)) {
    res.status(400).json({ error: `Table '${table}' is not allowed` });
    return;
  }

  try {
    const cols = parseColumns(body.columns);
    const params: unknown[] = [];
    const where: string[] = [];
    for (const f of body.filters || []) {
      if (!f || !IDENT.test(f.column)) throw new Error("Invalid filter column");
      params.push(f.value);
      const idx = params.length;
      if (f.op === "eq") where.push(`"${f.column}" = $${idx}`);
      else if (f.op === "ilike") where.push(`"${f.column}" ILIKE $${idx}`);
      else throw new Error(`Unsupported filter op`);
    }

    let sql = `SELECT ${cols} FROM public."${table}"`;
    if (where.length) sql += ` WHERE ${where.join(" AND ")}`;

    if (body.order?.column) {
      if (!IDENT.test(body.order.column)) throw new Error("Invalid order column");
      sql += ` ORDER BY "${body.order.column}" ${body.order.ascending === false ? "DESC" : "ASC"}`;
    }

    const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 1000);
    sql += ` LIMIT ${limit}`;

    const { rows } = await query(sql, params);
    if (body.single) {
      res.status(200).json({ data: rows[0] ?? null, error: null });
      return;
    }
    res.status(200).json({ data: rows, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[data/select]", message);
    res.status(400).json({ data: null, error: { message } });
  }
}
