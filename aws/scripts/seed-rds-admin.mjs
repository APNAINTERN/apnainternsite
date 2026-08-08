#!/usr/bin/env node
/**
 * Seed a super_admin account on AWS RDS (no Supabase export).
 *
 * Usage:
 *   ADMIN_SEED_EMAIL=you@example.com ADMIN_SEED_PASSWORD='secret' npm run aws:rds:seed-admin
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const file of [".env.awsrds.local", ".env.awsrds", ".env"]) {
    const p = path.join(root, file);
    if (!fs.existsSync(p)) continue;
    const m = fs.readFileSync(p, "utf8").match(/^DATABASE_URL=(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("DATABASE_URL not set");
}

const email = (process.env.ADMIN_SEED_EMAIL || "").trim().toLowerCase();
const password = process.env.ADMIN_SEED_PASSWORD || "";
const fullName = (process.env.ADMIN_SEED_NAME || "Apna Intern Admin").trim();

if (!email || !password) {
  console.error("Set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD");
  process.exit(1);
}

async function main() {
  const raw = loadDatabaseUrl();
  const client = new pg.Client({
    connectionString: raw.replace(/([?&])sslmode=[^&]*/gi, "$1").replace(/[?&]$/, ""),
    ssl: /rds\.amazonaws\.com/i.test(raw) ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  const hash = await bcrypt.hash(password, 10);
  const meta = JSON.stringify({
    full_name: fullName,
    role: "super_admin",
    is_staff: true,
  });

  await client.query("BEGIN");
  try {
    const existing = await client.query(
      `SELECT id FROM auth.users WHERE lower(trim(email)) = $1 LIMIT 1`,
      [email]
    );

    let userId;
    if (existing.rows[0]?.id) {
      userId = existing.rows[0].id;
      await client.query(
        `UPDATE auth.users
         SET encrypted_password = $2,
             email_confirmed_at = COALESCE(email_confirmed_at, now()),
             raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || $3::jsonb,
             updated_at = now()
         WHERE id = $1::uuid`,
        [userId, hash, meta]
      );
      console.log(`Updated existing auth.users id=${userId}`);
    } else {
      const inserted = await client.query(
        `INSERT INTO auth.users (
           id, instance_id, aud, role, email, encrypted_password,
           email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
           created_at, updated_at, is_sso_user, is_anonymous
         ) VALUES (
           gen_random_uuid(),
           '00000000-0000-0000-0000-000000000000',
           'authenticated', 'authenticated', $1, $2, now(),
           '{"provider":"email","providers":["email"]}'::jsonb, $3::jsonb,
           now(), now(), false, false
         )
         RETURNING id`,
        [email, hash, meta]
      );
      userId = inserted.rows[0].id;
      console.log(`Created auth.users id=${userId}`);
    }

    await client.query(
      `INSERT INTO auth.identities (
         id, provider_id, user_id, identity_data, provider,
         last_sign_in_at, created_at, updated_at
       ) VALUES (
         gen_random_uuid(), $1::text, $2::uuid,
         jsonb_build_object('sub', $1::text, 'email', $3::text, 'email_verified', true),
         'email', now(), now(), now()
       )
       ON CONFLICT (provider_id, provider) DO UPDATE SET
         identity_data = EXCLUDED.identity_data,
         updated_at = now()`,
      [String(userId), userId, email]
    );

    await client.query(
      `INSERT INTO public.profiles (id, full_name, email, contact_number, gender, parent_name)
       VALUES ($1::uuid, $2, $3, '', '', '')
       ON CONFLICT (id) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         email = EXCLUDED.email`,
      [userId, fullName, email]
    );

    await client.query(
      `DELETE FROM public.user_roles
       WHERE user_id = $1::uuid AND role = 'student'::public.app_role`,
      [userId]
    );

    await client.query(
      `INSERT INTO public.user_roles (user_id, role)
       VALUES ($1::uuid, 'super_admin'::public.app_role)
       ON CONFLICT (user_id, role) DO NOTHING`,
      [userId]
    );

    await client.query(
      `INSERT INTO public.admin_permissions (
         user_id,
         can_manage_students,
         can_manage_classes,
         can_manage_certificates,
         can_manage_institutions,
         can_view_payments,
         can_manage_leads,
         can_manage_notifications,
         can_manage_assignments,
         can_manage_communications
       ) VALUES ($1::uuid, true, true, true, true, true, true, true, true, true)
       ON CONFLICT (user_id) DO UPDATE SET
         can_manage_students = true,
         can_manage_classes = true,
         can_manage_certificates = true,
         can_manage_institutions = true,
         can_view_payments = true,
         can_manage_leads = true,
         can_manage_notifications = true,
         can_manage_assignments = true,
         can_manage_communications = true`,
      [userId]
    );

    await client.query(
      `INSERT INTO public.admin_staff (id, email, full_name, role_tag, permissions)
       VALUES ($1::uuid, $2, $3, 'super_admin', '{"all": true}'::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         full_name = EXCLUDED.full_name,
         role_tag = EXCLUDED.role_tag`,
      [userId, email, fullName]
    );

    await client.query("COMMIT");

    const check = await client.query(
      `SELECT u.email,
              EXISTS (
                SELECT 1 FROM public.user_roles ur
                WHERE ur.user_id = u.id AND ur.role = 'super_admin'::public.app_role
              ) AS is_super_admin
       FROM auth.users u
       WHERE u.id = $1::uuid`,
      [userId]
    );
    console.log("✅ Super admin ready:", check.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
