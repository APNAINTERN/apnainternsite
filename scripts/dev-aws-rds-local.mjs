#!/usr/bin/env node
/**
 * Local end-to-end stack (default `npm run dev`):
 *   Express API (:3000)  →  AWS RDS + S3
 *   Vite frontend (:8080) →  local auth/rest/storage shim (no *.supabase.co)
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envFile = path.join(root, ".env.awsrds.local");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  /** @type {Record<string,string>} */
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[t.slice(0, eq).trim()] = val;
  }
  return out;
}

if (!fs.existsSync(envFile)) {
  console.error("\n❌ Missing .env.awsrds.local — copy from .env.awsrds.example\n");
  process.exit(1);
}

const fileEnv = loadEnvFile(envFile);
const env = {
  ...process.env,
  ...fileEnv,
  VITE_SITE_API_ORIGIN: fileEnv.VITE_SITE_API_ORIGIN || "http://localhost:8080",
  VITE_PUBLIC_APP_URL: fileEnv.VITE_PUBLIC_APP_URL || "http://localhost:8080",
  VITE_SUPABASE_URL: fileEnv.VITE_SUPABASE_URL || "http://localhost:8080",
  RDS_RPC_OPEN: fileEnv.RDS_RPC_OPEN || "true",
};

if (!env.DATABASE_URL) {
  console.error("\n❌ DATABASE_URL missing in .env.awsrds.local\n");
  process.exit(1);
}

console.log("\n🧪 EzyIntern local stack (RDS + S3, no Supabase)");
console.log("   API      → http://localhost:3000");
console.log("   Frontend → http://localhost:8080");
console.log("   Auth/REST/Storage → Express shim → RDS + S3\n");

const children = [];

function killAll() {
  for (const c of children) {
    try {
      c.kill("SIGINT");
    } catch {
      /* ignore */
    }
  }
}

const api = spawn("npx", ["tsx", "aws/server/index.ts"], {
  cwd: root,
  stdio: "inherit",
  env,
  shell: true,
});
children.push(api);

function waitForHealth(retries = 40) {
  return new Promise((resolve, reject) => {
    let left = retries;
    const tick = () => {
      const req = http.get("http://127.0.0.1:3000/api/health", (res) => {
        res.resume();
        if (res.statusCode === 200) resolve(undefined);
        else retry();
      });
      req.on("error", retry);
    };
    const retry = () => {
      left -= 1;
      if (left <= 0) reject(new Error("API health check timed out on :3000"));
      else setTimeout(tick, 250);
    };
    tick();
  });
}

waitForHealth()
  .then(() => {
    console.log("✅ API healthy — starting Vite…\n");
    const vite = spawn("npm", ["run", "dev:frontend:awsrds"], {
      cwd: root,
      stdio: "inherit",
      env,
      shell: true,
    });
    children.push(vite);
    vite.on("exit", (code) => {
      killAll();
      process.exit(code ?? 0);
    });
  })
  .catch((err) => {
    console.error(err.message || err);
    killAll();
    process.exit(1);
  });

api.on("exit", (code) => {
  if (code && code !== 0) {
    killAll();
    process.exit(code);
  }
});

process.on("SIGINT", () => {
  killAll();
  process.exit(0);
});
process.on("SIGTERM", () => {
  killAll();
  process.exit(0);
});
