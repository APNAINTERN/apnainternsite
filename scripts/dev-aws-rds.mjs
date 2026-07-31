#!/usr/bin/env node
/**
 * Frontend-only dev against local Express API + RDS (Vite mode=awsrds).
 * Requires `.env.awsrds.local` (copy from `.env.awsrds.example`).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envFile = path.join(root, ".env.awsrds.local");

if (!fs.existsSync(envFile)) {
  console.error("\n❌ Missing .env.awsrds.local");
  console.error("   cp .env.awsrds.example .env.awsrds.local");
  console.error("   Set DATABASE_URL, then run npm run aws:api in another terminal\n");
  process.exit(1);
}

const text = fs.readFileSync(envFile, "utf8");
const dbUrl = text.split("\n").find((l) => /^DATABASE_URL=/.test(l.trim()) && !l.trim().startsWith("#"));

if (!dbUrl || /PASSWORD@|xxxx/.test(dbUrl)) {
  console.warn("\n⚠️  Set DATABASE_URL in .env.awsrds.local (run: npm run aws:rds:provision)\n");
}

console.log("🗄️  dev:aws:rds — Vite → local API + RDS (no *.supabase.co)\n");

const vite = spawn("npm", ["run", "dev:frontend:awsrds"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: process.env,
});

vite.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => vite.kill("SIGINT"));
