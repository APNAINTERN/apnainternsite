#!/usr/bin/env node
/**
 * Grant super_admin on hosted Supabase via service role (production login fix).
 *
 * Requires in .env (never commit):
 *   SUPABASE_URL=https://unqfphgjilxpbzajcdjl.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *
 * Usage:
 *   ADMIN_SEED_EMAIL=apnaintern.in@gmail.com ADMIN_SEED_PASSWORD='...' npm run supabase:seed-admin
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnv() {
  for (const file of [".env", ".env.local"]) {
    const p = path.join(root, file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const k = t.slice(0, eq).trim();
      if (process.env[k]) continue;
      process.env[k] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
}

loadEnv();

const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const email = (process.env.ADMIN_SEED_EMAIL || "").trim().toLowerCase();
const password = process.env.ADMIN_SEED_PASSWORD || "";
const fullName = (process.env.ADMIN_SEED_NAME || "Apna Intern Admin").trim();

if (!url.includes("supabase.co") || !serviceKey) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}
if (!email || !password) {
  console.error("Set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  let user = list?.users?.find((u) => u.email?.toLowerCase() === email);

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "super_admin", is_staff: true },
    });
    if (error) throw error;
    user = data.user;
    console.log("Created auth user:", user?.id);
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password,
      user_metadata: { full_name: fullName, role: "super_admin", is_staff: true },
    });
    if (error) throw error;
    console.log("Updated auth user:", user.id);
  }

  if (!user?.id) throw new Error("No user id");
  const uid = user.id;

  await admin.from("profiles").upsert({
    id: uid,
    full_name: fullName,
    email,
    contact_number: "",
    gender: "",
    parent_name: "",
  });

  await admin.from("user_roles").delete().eq("user_id", uid).eq("role", "student");
  const { error: roleErr } = await admin
    .from("user_roles")
    .upsert({ user_id: uid, role: "super_admin" }, { onConflict: "user_id,role" });
  if (roleErr) throw roleErr;

  await admin.from("admin_permissions").upsert({
    user_id: uid,
    can_manage_students: true,
    can_manage_classes: true,
    can_manage_certificates: true,
    can_manage_institutions: true,
    can_view_payments: true,
    can_manage_leads: true,
    can_manage_notifications: true,
    can_manage_assignments: true,
    can_manage_communications: true,
  });

  await admin.from("admin_staff").upsert({
    id: uid,
    email,
    full_name: fullName,
    role_tag: "super_admin",
    permissions: { all: true },
  });

  const { data: studentOnly } = await admin.rpc("account_is_student_only", {
    check_email: email,
  });
  console.log("account_is_student_only:", studentOnly, "(expect false)");
  console.log("✅ Supabase super admin ready:", email);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
