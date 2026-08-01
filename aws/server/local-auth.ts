/**
 * GoTrue-compatible local auth against auth.users on RDS (bcrypt $2a$).
 * Mounted at /auth/v1/* so supabase-js can use VITE_SUPABASE_URL=http://localhost:3000
 */
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { query } from "./db";
import {
  signAccessToken,
  signRefreshToken,
  userFromPayload,
  verifyToken,
} from "./local-jwt";

type AuthUserRow = {
  id: string;
  email: string | null;
  encrypted_password: string | null;
  banned_until: string | null;
  email_confirmed_at: string | null;
  raw_app_meta_data: Record<string, unknown> | null;
  raw_user_meta_data: Record<string, unknown> | null;
  role: string | null;
  created_at: string | null;
  updated_at: string | null;
  last_sign_in_at: string | null;
};

async function fetchUserRoles(userId: string): Promise<string[]> {
  const { rows } = await query<{ role: string }>(
    `SELECT role::text AS role FROM public.user_roles WHERE user_id = $1::uuid`,
    [userId]
  );
  return rows.map((r) => r.role);
}

function supabaseUser(row: AuthUserRow, roles: string[] = []) {
  const baseMeta =
    row.raw_app_meta_data && typeof row.raw_app_meta_data === "object"
      ? { ...(row.raw_app_meta_data as Record<string, unknown>) }
      : { provider: "email", providers: ["email"] };
  return {
    id: row.id,
    aud: "authenticated",
    role: row.role || "authenticated",
    email: row.email,
    email_confirmed_at: row.email_confirmed_at,
    phone: "",
    confirmed_at: row.email_confirmed_at,
    last_sign_in_at: row.last_sign_in_at || new Date().toISOString(),
    app_metadata: { ...baseMeta, roles },
    user_metadata: row.raw_user_meta_data || {},
    identities: [],
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
  };
}

async function findUserByEmail(email: string): Promise<AuthUserRow | null> {
  const { rows } = await query<AuthUserRow>(
    `SELECT id, email, encrypted_password, banned_until, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, role, created_at, updated_at, last_sign_in_at
     FROM auth.users
     WHERE lower(email) = lower($1)
     LIMIT 1`,
    [email.trim()]
  );
  return rows[0] || null;
}

async function findUserById(id: string): Promise<AuthUserRow | null> {
  const { rows } = await query<AuthUserRow>(
    `SELECT id, email, encrypted_password, banned_until, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, role, created_at, updated_at, last_sign_in_at
     FROM auth.users WHERE id = $1::uuid LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function tokenResponse(row: AuthUserRow) {
  const roles = await fetchUserRoles(row.id);
  const user = supabaseUser(row, roles);
  const access_token = signAccessToken({
    id: row.id,
    email: row.email || "",
    role: "authenticated",
    app_metadata: user.app_metadata as Record<string, unknown>,
    user_metadata: user.user_metadata as Record<string, unknown>,
  });
  const refresh_token = signRefreshToken({
    id: row.id,
    email: row.email || "",
  });
  return {
    access_token,
    token_type: "bearer",
    expires_in: 43200,
    expires_at: Math.floor(Date.now() / 1000) + 43200,
    refresh_token,
    user,
  };
}

function bearer(req: Request): string | null {
  const h = req.headers.authorization || "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m?.[1] || null;
}

/** POST /auth/v1/token */
export async function authToken(req: Request, res: Response) {
  try {
    const grant =
      String(req.query.grant_type || req.body?.grant_type || "").trim() || "password";

    if (grant === "refresh_token") {
      const refresh =
        req.body?.refresh_token || req.body?.refreshToken || req.query.refresh_token;
      if (!refresh) {
        res.status(400).json({ error: "invalid_request", error_description: "refresh_token required" });
        return;
      }
      const payload = verifyToken(String(refresh));
      if (!payload?.sub || payload.typ !== "refresh") {
        res.status(401).json({ error: "invalid_grant", error_description: "Invalid refresh token" });
        return;
      }
      const row = await findUserById(String(payload.sub));
      if (!row) {
        res.status(401).json({ error: "invalid_grant", error_description: "User not found" });
        return;
      }
      res.json(await tokenResponse(row));
      return;
    }

    if (grant !== "password") {
      res.status(400).json({
        error: "unsupported_grant_type",
        error_description: `grant_type=${grant} not supported locally`,
      });
      return;
    }

    const email = String(req.body?.email || "").trim();
    const password = String(req.body?.password || "");
    if (!email || !password) {
      res.status(400).json({
        error: "invalid_request",
        error_description: "email and password required",
      });
      return;
    }

    const row = await findUserByEmail(email);
    if (!row?.encrypted_password) {
      res.status(400).json({
        error: "invalid_grant",
        error_description: "Invalid login credentials",
      });
      return;
    }

    if (row.banned_until && new Date(row.banned_until).getTime() > Date.now()) {
      res.status(400).json({
        error: "user_banned",
        error_description: "User is banned",
      });
      return;
    }

    const ok = await bcrypt.compare(password, row.encrypted_password);
    if (!ok) {
      // One repair attempt using directory password RPC if present
      try {
        const repaired = await query<{ result: boolean }>(
          `SELECT public.repair_student_auth_login($1, $2) AS result`,
          [email.toLowerCase(), password]
        );
        if (repaired.rows[0]?.result === true) {
          const again = await findUserByEmail(email);
          if (again?.encrypted_password && (await bcrypt.compare(password, again.encrypted_password))) {
            await query(`UPDATE auth.users SET last_sign_in_at = now() WHERE id = $1::uuid`, [
              again.id,
            ]);
            res.json(await tokenResponse(again));
            return;
          }
        }
      } catch {
        /* repair optional */
      }
      res.status(400).json({
        error: "invalid_grant",
        error_description: "Invalid login credentials",
      });
      return;
    }

    await query(`UPDATE auth.users SET last_sign_in_at = now() WHERE id = $1::uuid`, [row.id]);
    res.json(await tokenResponse(row));
  } catch (err) {
    console.error("[auth/token]", err);
    res.status(500).json({
      error: "server_error",
      error_description: err instanceof Error ? err.message : String(err),
    });
  }
}

/** GET /auth/v1/user */
export async function authUser(req: Request, res: Response) {
  const token = bearer(req);
  if (!token) {
    res.status(401).json({ error: "no_authorization", msg: "No Authorization header" });
    return;
  }
  const payload = verifyToken(token);
  if (!payload?.sub) {
    res.status(401).json({ error: "invalid_token", msg: "Invalid JWT" });
    return;
  }
  const row = await findUserById(String(payload.sub));
  if (!row) {
    // Fall back to JWT claims if user row missing
    res.json(userFromPayload(payload));
    return;
  }
  const roles = await fetchUserRoles(row.id);
  res.json(supabaseUser(row, roles));
}

/** POST /auth/v1/logout */
export async function authLogout(_req: Request, res: Response) {
  res.status(204).end();
}

/** POST /auth/v1/signup — create auth.users + return session (local only) */
export async function authSignup(req: Request, res: Response) {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const data = (req.body?.data || {}) as Record<string, unknown>;
    if (!email || !password) {
      res.status(400).json({ error: "email and password required" });
      return;
    }
    const existing = await findUserByEmail(email);
    if (existing) {
      res.status(422).json({
        error: "user_already_exists",
        msg: "User already registered",
      });
      return;
    }
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await query<AuthUserRow>(
      `INSERT INTO auth.users (
         id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, is_sso_user, is_anonymous
       ) VALUES (
         gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
         'authenticated', 'authenticated', $1, $2, now(),
         '{"provider":"email","providers":["email"]}'::jsonb, $3::jsonb,
         now(), now(), false, false
       )
       RETURNING id, email, encrypted_password, banned_until, email_confirmed_at,
                 raw_app_meta_data, raw_user_meta_data, role, created_at, updated_at, last_sign_in_at`,
      [email, hash, JSON.stringify(data || {})]
    );
    const row = rows[0];
    if (!row) {
      res.status(500).json({ error: "signup_failed" });
      return;
    }
    // identity row (best-effort)
    try {
      await query(
        `INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
         VALUES (gen_random_uuid(), $1::uuid, $2::jsonb, 'email', $3, now(), now(), now())
         ON CONFLICT DO NOTHING`,
        [row.id, JSON.stringify({ sub: row.id, email }), email]
      );
    } catch {
      /* optional */
    }
    res.json({
      ...(await tokenResponse(row)),
      // GoTrue signup clients sometimes read id at the top level
      id: row.id,
    });
  } catch (err) {
    console.error("[auth/signup]", err);
    res.status(500).json({
      error: "server_error",
      msg: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Health for local supabase URL root */
export function authSettings(_req: Request, res: Response) {
  res.json({
    external: {},
    disable_signup: false,
    mailer_autoconfirm: true,
    phone_autoconfirm: true,
    sms_provider: "",
    saml_enabled: false,
  });
}
