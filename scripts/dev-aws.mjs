#!/usr/bin/env node
/**
 * Local frontend that calls DEPLOYED AWS Lambda APIs (not local :3000).
 * Requires `.env.aws.local` (copy from `.env.aws.example`).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envAwsLocal = path.join(root, ".env.aws.local");

if (!fs.existsSync(envAwsLocal)) {
  console.error("\n❌ Missing .env.aws.local");
  console.error("   cp .env.aws.example .env.aws.local");
  console.error("   Then set VITE_SITE_API_ORIGIN to your Lambda ApiBaseUrl.\n");
  process.exit(1);
}

const originLine = fs
  .readFileSync(envAwsLocal, "utf8")
  .split("\n")
  .find((l) => /^VITE_SITE_API_ORIGIN=/.test(l.trim()) && !l.trim().startsWith("#"));

if (!originLine || /REPLACE_AFTER_LAMBDA_DEPLOY/.test(originLine)) {
  console.warn("\n⚠️  Set VITE_SITE_API_ORIGIN in .env.aws.local to your deployed Lambda URL.");
  console.warn("   Deploy first: npm run aws:lambda:deploy:guided\n");
}

console.log("🌐 dev:aws — frontend only → AWS Lambda APIs (Supabase unchanged)\n");

const vite = spawn("npm", ["run", "dev:frontend:aws"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: process.env,
});

vite.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => vite.kill("SIGINT"));
