#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const envPath = path.join(root, ".env.awsrds.local");
if (!fs.existsSync(envPath)) {
  console.error("Missing .env.awsrds.local");
  process.exit(1);
}
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 1) continue;
  process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
}
const r = spawnSync("bash", ["aws/scripts/db-verify-rds.sh"], { cwd: root, stdio: "inherit", env: process.env });
process.exit(r.status ?? 1);
