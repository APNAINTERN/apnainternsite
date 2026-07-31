import fs from "node:fs";
import path from "node:path";

function loadEnvFile(envPath: string): void {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

/** Load repo-root env files when running locally or in Docker (skipped on Lambda). */
export function loadRootEnv(): void {
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return;

  const root = process.cwd();
  // Prefer RDS staging env when present so local API hits AWS RDS
  loadEnvFile(path.join(root, ".env.awsrds.local"));
  loadEnvFile(path.join(root, ".env.aws.local"));
  loadEnvFile(path.join(root, ".env"));
  // AWS keys often live in .env only — merge without overwriting awsrds DATABASE_URL
  if (fs.existsSync(path.join(root, ".env"))) {
    for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const eq = t.indexOf("=");
      const key = t.slice(0, eq).trim();
      if (!/^AWS_/.test(key) && key !== "SMTP_USER" && key !== "SMTP_PASS") continue;
      if (process.env[key]) continue;
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}
