#!/usr/bin/env node
/**
 * Build aws/sam/samconfig.toml from .env.awsrds.local + .env (gitignored output).
 * Run before deploy: node aws/scripts/prepare-samconfig.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const e = {
  ...parseEnvFile(path.join(root, ".env")),
  ...parseEnvFile(path.join(root, ".env.awsrds.local")),
};

const databaseUrl = e.DATABASE_URL || "";
const jwtSecret = e.LOCAL_JWT_SECRET || "change-me-staging-jwt-secret";
const rzpId = e.RAZORPAY_KEY_ID || e.VITE_RAZORPAY_KEY_ID || "";
const rzpSecret = e.RAZORPAY_KEY_SECRET || "";
const smtpUser = e.SMTP_USER || "";
const smtpPass = e.SMTP_PASS || "";
const gemini = e.GEMINI_API_KEY || e.VITE_GEMINI_API_KEY || "";

const missing = [];
if (!databaseUrl || /PASSWORD@|xxxx/.test(databaseUrl)) missing.push("DATABASE_URL in .env.awsrds.local");
if (!rzpId) missing.push("RAZORPAY_KEY_ID");
if (!rzpSecret) missing.push("RAZORPAY_KEY_SECRET");
if (!smtpUser) missing.push("SMTP_USER");
if (!smtpPass) missing.push("SMTP_PASS");

if (missing.length) {
  console.error("Missing:", missing.join(", "));
  process.exit(1);
}

function escParam(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

const params = [
  "StageName=staging",
  `DatabaseUrl=${escParam(databaseUrl)}`,
  `LocalJwtSecret=${escParam(jwtSecret)}`,
  `RazorpayKeyId=${escParam(rzpId)}`,
  `RazorpayKeySecret=${escParam(rzpSecret)}`,
  `SmtpUser=${escParam(smtpUser)}`,
  `SmtpPass=${escParam(smtpPass)}`,
  // SAM rejects empty ParameterValue=; use placeholder when unset.
  `GeminiApiKey=${escParam(gemini || "unset")}`,
  `S3BucketConsentForms=${escParam(e.S3_BUCKET_CONSENT_FORMS || "ezyintern-staging-consent-forms")}`,
  `S3BucketLogos=${escParam(e.S3_BUCKET_LOGOS || "ezyintern-staging-logos")}`,
  `S3BucketLearningMaterials=${escParam(e.S3_BUCKET_LEARNING_MATERIALS || "ezyintern-staging-learning-materials")}`,
  `S3BucketAssignmentUploads=${escParam(e.S3_BUCKET_ASSIGNMENT_UPLOADS || "ezyintern-staging-learning-materials")}`,
];

const paramLines = params.map((p) => `  "${p.replace(/"/g, '\\"')}",`).join("\n");

const toml = `version = 0.1

[default.deploy.parameters]
stack_name = "ezyintern-api-staging"
resolve_s3 = true
s3_prefix = "ezyintern-api"
region = "ap-south-1"
confirm_changeset = false
capabilities = "CAPABILITY_IAM"
disable_rollback = false
parameter_overrides = [
${paramLines}
]

[default.build.parameters]
cached = true
parallel = true
`;

const outPath = path.join(root, "aws/sam/samconfig.toml");
fs.writeFileSync(outPath, toml);
console.log(`Wrote ${outPath} (RDS mode — no Supabase params)`);
