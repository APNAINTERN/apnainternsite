#!/usr/bin/env node
/**
 * Import students-export CSV into RDS:
 *  - insert missing students
 *  - fill blank profile fields on existing rows (does not overwrite non-empty values)
 *  - ensure auth.users / identities / profiles / user_roles for new rows
 *
 * Usage:
 *   node aws/scripts/import-students-export-fill.mjs students-export-2026-07-28_11-46-38.csv
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnv() {
  for (const f of [".env.awsrds.local", ".env"]) {
    const p = join(ROOT, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function parseSemicolonStudents(srcPath) {
  const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12};/;
  const HEADER = [
    "id",
    "email",
    "full_name",
    "gender",
    "parent_name",
    "contact_number",
    "university_name",
    "college_name",
    "course",
    "degree",
    "department",
    "class_semester",
    "academic_session",
    "roll_number",
    "internship_domain",
    "emergency_name",
    "emergency_contact",
    "emergency_relation",
    "status",
    "created_at",
    "registration_id",
    "metadata",
    "cybercafe_shop_name",
    "cybercafe_email",
    "joining_date",
    "completion_date",
    "internship_duration",
    "referral_code",
  ];
  const NCOL = HEADER.length;
  const text = readFileSync(srcPath, "utf8");
  const lines = text.split(/\r?\n/);
  const records = [];
  let cur = null;
  let first = true;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (first) {
      first = false;
      continue;
    }
    if (!line.trim()) continue;
    if (UUID.test(line)) {
      if (cur != null) records.push(cur);
      cur = line;
    } else if (cur != null) {
      cur += " " + line;
    }
  }
  if (cur != null) records.push(cur);

  const rows = [];
  for (let rec of records) {
    rec = rec.replace(/,+$/, "");
    let parts = rec.split(";");
    if (parts.length < NCOL) parts = parts.concat(Array(NCOL - parts.length).fill(""));
    else if (parts.length > NCOL) {
      const head = parts.slice(0, 21);
      const tail = parts.slice(parts.length - 6);
      const mid = parts.slice(21, parts.length - 6);
      parts = head.concat([mid.join(";")], tail);
    }
    parts = parts.slice(0, NCOL);
    parts[NCOL - 1] = String(parts[NCOL - 1] || "").replace(/,+$/, "");
    const obj = {};
    HEADER.forEach((h, i) => {
      obj[h] = String(parts[i] ?? "").trim();
    });
    // strip wrapping quotes on metadata
    if (obj.metadata.startsWith('"') && obj.metadata.endsWith('"')) {
      obj.metadata = obj.metadata.slice(1, -1).replace(/""/g, '"');
    }
    rows.push(obj);
  }
  return { HEADER, rows };
}

function sqlLiteral(v) {
  if (v == null) return "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function main() {
  loadEnv();
  const csvPath = resolve(process.argv[2] || join(ROOT, "students-export-2026-07-28_11-46-38.csv"));
  if (!existsSync(csvPath)) {
    console.error("CSV not found:", csvPath);
    process.exit(1);
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL missing (.env.awsrds.local)");
    process.exit(1);
  }

  const { HEADER, rows } = parseSemicolonStudents(csvPath);
  console.log(`Parsed ${rows.length} student rows from ${csvPath}`);

  // Write staging CSV (comma) for COPY
  const stageCsv = `/tmp/students-fill-${Date.now()}.csv`;
  const esc = (v) => {
    const s = String(v ?? "");
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  writeFileSync(
    stageCsv,
    [HEADER.join(","), ...rows.map((r) => HEADER.map((h) => esc(r[h])).join(","))].join("\n") + "\n",
    "utf8"
  );

  const setupSql = `
CREATE SCHEMA IF NOT EXISTS import_staging;
DROP TABLE IF EXISTS import_staging.students_fill;
CREATE TABLE import_staging.students_fill (
  id text, email text, full_name text, gender text, parent_name text, contact_number text,
  university_name text, college_name text, course text, degree text, department text,
  class_semester text, academic_session text, roll_number text, internship_domain text,
  emergency_name text, emergency_contact text, emergency_relation text, status text,
  created_at text, registration_id text, metadata text, cybercafe_shop_name text,
  cybercafe_email text, joining_date text, completion_date text, internship_duration text,
  referral_code text
);
`;

  const runPsql = (args, input) => {
    const r = spawnSync("psql", [databaseUrl, ...args], {
      input,
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    });
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    if (r.status !== 0) {
      console.error("psql failed", r.status);
      process.exit(r.status || 1);
    }
    return r;
  };

  console.log("→ Creating staging table…");
  runPsql(["-v", "ON_ERROR_STOP=1", "-c", setupSql]);

  console.log("→ COPY into staging…");
  runPsql([
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `\\copy import_staging.students_fill FROM '${stageCsv}' with (format csv, header true)`,
  ]);

  const mergeSql = `
BEGIN;

-- 1) Fill blank fields on existing students (never overwrite non-empty)
UPDATE public.students t
SET
  email = COALESCE(NULLIF(trim(t.email), ''), NULLIF(trim(s.email), ''), t.email),
  full_name = COALESCE(NULLIF(trim(t.full_name), ''), NULLIF(trim(s.full_name), ''), t.full_name),
  gender = COALESCE(NULLIF(trim(t.gender), ''), NULLIF(trim(s.gender), ''), t.gender),
  parent_name = COALESCE(NULLIF(trim(t.parent_name), ''), NULLIF(trim(s.parent_name), ''), t.parent_name),
  contact_number = COALESCE(NULLIF(trim(t.contact_number), ''), NULLIF(trim(s.contact_number), ''), t.contact_number),
  university_name = COALESCE(NULLIF(trim(t.university_name), ''), NULLIF(trim(s.university_name), ''), t.university_name),
  college_name = COALESCE(NULLIF(trim(t.college_name), ''), NULLIF(trim(s.college_name), ''), t.college_name),
  course = COALESCE(NULLIF(trim(t.course), ''), NULLIF(trim(s.course), ''), t.course),
  degree = COALESCE(NULLIF(trim(t.degree), ''), NULLIF(trim(s.degree), ''), t.degree),
  department = COALESCE(NULLIF(trim(t.department), ''), NULLIF(trim(s.department), ''), t.department),
  class_semester = COALESCE(NULLIF(trim(t.class_semester), ''), NULLIF(trim(s.class_semester), ''), t.class_semester),
  academic_session = COALESCE(NULLIF(trim(t.academic_session), ''), NULLIF(trim(s.academic_session), ''), t.academic_session),
  roll_number = COALESCE(NULLIF(trim(t.roll_number), ''), NULLIF(trim(s.roll_number), ''), t.roll_number),
  internship_domain = COALESCE(NULLIF(trim(t.internship_domain), ''), NULLIF(trim(s.internship_domain), ''), t.internship_domain),
  emergency_name = COALESCE(NULLIF(trim(t.emergency_name), ''), NULLIF(trim(s.emergency_name), ''), t.emergency_name),
  emergency_contact = COALESCE(NULLIF(trim(t.emergency_contact), ''), NULLIF(trim(s.emergency_contact), ''), t.emergency_contact),
  emergency_relation = COALESCE(NULLIF(trim(t.emergency_relation), ''), NULLIF(trim(s.emergency_relation), ''), t.emergency_relation),
  status = COALESCE(NULLIF(trim(t.status), ''), NULLIF(trim(s.status), ''), t.status),
  registration_id = COALESCE(NULLIF(trim(t.registration_id), ''), NULLIF(trim(s.registration_id), ''), t.registration_id),
  metadata = CASE
    WHEN nullif(trim(t.metadata), '') IS NULL OR trim(t.metadata) IN ('{}', 'null')
      THEN COALESCE(NULLIF(trim(s.metadata), ''), t.metadata)
    ELSE t.metadata
  END,
  cybercafe_shop_name = COALESCE(NULLIF(trim(t.cybercafe_shop_name), ''), NULLIF(trim(s.cybercafe_shop_name), ''), t.cybercafe_shop_name),
  cybercafe_email = COALESCE(NULLIF(trim(t.cybercafe_email), ''), NULLIF(trim(s.cybercafe_email), ''), t.cybercafe_email),
  joining_date = COALESCE(NULLIF(trim(t.joining_date), ''), NULLIF(trim(s.joining_date), ''), t.joining_date),
  completion_date = COALESCE(NULLIF(trim(t.completion_date), ''), NULLIF(trim(s.completion_date), ''), t.completion_date),
  internship_duration = COALESCE(NULLIF(trim(t.internship_duration), ''), NULLIF(trim(s.internship_duration), ''), t.internship_duration),
  referral_code = COALESCE(NULLIF(trim(t.referral_code), ''), NULLIF(trim(s.referral_code), ''), t.referral_code)
FROM import_staging.students_fill s
WHERE t.id = s.id;

-- Also match by email when id differs but email matches and details are sparse
UPDATE public.students t
SET
  full_name = COALESCE(NULLIF(trim(t.full_name), ''), NULLIF(trim(s.full_name), ''), t.full_name),
  university_name = COALESCE(NULLIF(trim(t.university_name), ''), NULLIF(trim(s.university_name), ''), t.university_name),
  college_name = COALESCE(NULLIF(trim(t.college_name), ''), NULLIF(trim(s.college_name), ''), t.college_name),
  contact_number = COALESCE(NULLIF(trim(t.contact_number), ''), NULLIF(trim(s.contact_number), ''), t.contact_number),
  course = COALESCE(NULLIF(trim(t.course), ''), NULLIF(trim(s.course), ''), t.course),
  internship_domain = COALESCE(NULLIF(trim(t.internship_domain), ''), NULLIF(trim(s.internship_domain), ''), t.internship_domain),
  registration_id = COALESCE(NULLIF(trim(t.registration_id), ''), NULLIF(trim(s.registration_id), ''), t.registration_id),
  roll_number = COALESCE(NULLIF(trim(t.roll_number), ''), NULLIF(trim(s.roll_number), ''), t.roll_number),
  metadata = CASE
    WHEN nullif(trim(t.metadata), '') IS NULL OR trim(t.metadata) IN ('{}', 'null')
      THEN COALESCE(NULLIF(trim(s.metadata), ''), t.metadata)
    ELSE t.metadata
  END
FROM import_staging.students_fill s
WHERE lower(trim(t.email)) = lower(trim(s.email))
  AND t.id <> s.id
  AND (
    nullif(trim(t.full_name), '') IS NULL
    OR nullif(trim(t.university_name), '') IS NULL
    OR nullif(trim(t.college_name), '') IS NULL
  );

-- 2) Insert brand-new students (by id)
INSERT INTO public.students (
  id, email, full_name, gender, parent_name, contact_number, university_name,
  college_name, course, degree, department, class_semester, academic_session,
  roll_number, internship_domain, emergency_name, emergency_contact,
  emergency_relation, status, created_at, registration_id, metadata,
  cybercafe_shop_name, cybercafe_email, joining_date, completion_date,
  internship_duration, referral_code
)
SELECT
  s.id, s.email, s.full_name, s.gender, s.parent_name, s.contact_number, s.university_name,
  s.college_name, s.course, s.degree, s.department, s.class_semester, s.academic_session,
  s.roll_number, s.internship_domain, s.emergency_name, s.emergency_contact,
  s.emergency_relation, COALESCE(NULLIF(trim(s.status), ''), 'Active'), s.created_at, s.registration_id, s.metadata,
  s.cybercafe_shop_name, s.cybercafe_email, s.joining_date, s.completion_date,
  s.internship_duration, s.referral_code
FROM import_staging.students_fill s
WHERE NOT EXISTS (SELECT 1 FROM public.students t WHERE t.id = s.id)
  AND NOT EXISTS (SELECT 1 FROM public.students t WHERE lower(trim(t.email)) = lower(trim(s.email)))
ON CONFLICT (id) DO NOTHING;

-- 3) auth.users for newly inserted / still-missing auth
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
SELECT
  s.id::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated',
  lower(trim(s.email)),
  CASE
    WHEN COALESCE(public.safe_text_to_jsonb(s.metadata)->>'password', '') <> ''
      THEN extensions.crypt(public.safe_text_to_jsonb(s.metadata)->>'password', extensions.gen_salt('bf'))
    ELSE extensions.crypt('EzyIntern@' || substr(replace(s.id, '-', ''), 1, 8), extensions.gen_salt('bf'))
  END,
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', s.full_name),
  COALESCE(NULLIF(s.created_at, '')::timestamptz, now()),
  now(),
  false, false,
  '', '', '', ''
FROM import_staging.students_fill s
WHERE s.id ~* '^[0-9a-f-]{36}$'
  AND nullif(trim(s.email), '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = s.id::uuid)
  AND NOT EXISTS (SELECT 1 FROM auth.users a WHERE lower(a.email) = lower(trim(s.email)) AND coalesce(a.is_sso_user, false) = false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
SELECT
  gen_random_uuid(), s.id::text, s.id::uuid,
  jsonb_build_object('sub', s.id, 'email', lower(trim(s.email)), 'email_verified', true, 'phone_verified', false),
  'email', now(), now(), now()
FROM import_staging.students_fill s
WHERE s.id ~* '^[0-9a-f-]{36}$'
  AND EXISTS (SELECT 1 FROM auth.users a WHERE a.id = s.id::uuid)
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = s.id::uuid AND i.provider = 'email')
ON CONFLICT DO NOTHING;

-- 4) profiles + student role
INSERT INTO public.profiles (id, full_name, email, contact_number, gender, parent_name, created_at, updated_at)
SELECT
  s.id::uuid, s.full_name, lower(trim(s.email)), nullif(s.contact_number, ''),
  nullif(s.gender, ''), nullif(s.parent_name, ''),
  COALESCE(NULLIF(s.created_at, '')::timestamptz, now()), now()
FROM import_staging.students_fill s
WHERE s.id ~* '^[0-9a-f-]{36}$'
  AND EXISTS (SELECT 1 FROM auth.users a WHERE a.id = s.id::uuid)
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = s.id::uuid)
ON CONFLICT (id) DO UPDATE SET
  full_name = COALESCE(NULLIF(trim(public.profiles.full_name), ''), EXCLUDED.full_name),
  contact_number = COALESCE(NULLIF(trim(public.profiles.contact_number), ''), EXCLUDED.contact_number),
  email = COALESCE(NULLIF(trim(public.profiles.email), ''), EXCLUDED.email);

INSERT INTO public.user_roles (user_id, role)
SELECT s.id::uuid, 'student'::public.app_role
FROM import_staging.students_fill s
WHERE s.id ~* '^[0-9a-f-]{36}$'
  AND EXISTS (SELECT 1 FROM auth.users a WHERE a.id = s.id::uuid)
ON CONFLICT DO NOTHING;

-- Clear unpaid-directory flags for imported rows that now have details
UPDATE public.students t
SET metadata = (
  coalesce(public.safe_text_to_jsonb(t.metadata), '{}'::jsonb)
  || jsonb_build_object('payment_required', false, 'bulk_upload_paid', true)
)::text
FROM import_staging.students_fill s
WHERE t.id = s.id
  AND nullif(trim(t.full_name), '') IS NOT NULL
  AND nullif(trim(t.university_name), '') IS NOT NULL;

COMMIT;

SELECT
  (SELECT count(*) FROM import_staging.students_fill) AS staged,
  (SELECT count(*) FROM public.students t
     JOIN import_staging.students_fill s ON s.id = t.id) AS matched_by_id,
  (SELECT count(*) FROM public.students
     WHERE nullif(trim(full_name), '') IS NULL
        OR nullif(trim(university_name), '') IS NULL
        OR nullif(trim(college_name), '') IS NULL) AS still_sparse_global;
`;

  console.log("→ Merging into public.students / auth / profiles…");
  runPsql(["-v", "ON_ERROR_STOP=1", "-c", mergeSql]);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
