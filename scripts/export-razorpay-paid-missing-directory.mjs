#!/usr/bin/env node
/**
 * Export captured Razorpay payments (email, name, phone) for a date range.
 * Use when payment_orders was never saved — import list into Supabase or compare with STEP 1 preview.
 *
 * Usage:
 *   export RAZORPAY_KEY_ID=rzp_live_...
 *   export RAZORPAY_KEY_SECRET=...
 *   node scripts/export-razorpay-paid-missing-directory.mjs --from=2026-05-31 --to=2026-06-01
 *
 * Output: captures/razorpay-paid-export-YYYY-MM-DD.json
 */

import { writeFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

let keyId = process.env.RAZORPAY_KEY_ID;
let keySecret = process.env.RAZORPAY_KEY_SECRET;

async function loadKeysFromSupabaseIfNeeded() {
  if (keyId && keySecret) return;
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  const supabase = createClient(url, key);
  const { data } = await supabase
    .from("payment_config")
    .select("razorpay_key_id, razorpay_key_secret")
    .eq("id", 1)
    .maybeSingle();
  if (data?.razorpay_key_id && data?.razorpay_key_secret) {
    keyId = data.razorpay_key_id;
    keySecret = data.razorpay_key_secret;
    console.log("Loaded Razorpay keys from payment_config.\n");
  }
}

const args = process.argv.slice(2);
const fromArg = args.find((a) => a.startsWith("--from="))?.split("=")[1] || "2026-05-31";
const toArg = args.find((a) => a.startsWith("--to="))?.split("=")[1] || "2026-06-01";

function parseIstUnix(dateStr, endOfDay) {
  const time = endOfDay ? "23:59:59" : "00:00:00";
  return Math.floor(Date.parse(`${dateStr}T${time}+05:30`) / 1000);
}

const fromTs = parseIstUnix(fromArg, false);
const toTs = parseIstUnix(toArg, true);

function headers() {
  return {
    Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
  };
}

async function fetchCapturedPayments() {
  const out = [];
  let skip = 0;
  for (;;) {
    const qs = new URLSearchParams({
      count: "100",
      skip: String(skip),
      from: String(fromTs),
      to: String(toTs),
    });
    const res = await fetch(`https://api.razorpay.com/v1/payments?${qs}`, { headers: headers() });
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error?.description || res.statusText);
    for (const p of body.items || []) {
      if (p.status !== "captured" && !(p.status === "authorized" && p.captured)) continue;
      const notes = p.notes && typeof p.notes === "object" ? p.notes : {};
      const email = String(p.email || notes.email || notes.student_email || "").trim().toLowerCase();
      if (!email.includes("@")) continue;
      out.push({
        payment_id: p.id,
        email,
        full_name: String(notes.fullName || notes.full_name || notes.name || "").trim() || null,
        phone: String(p.contact || notes.contact || notes.contact_number || notes.phone || "").replace(/\D/g, "").slice(-10) || null,
        amount_paise: p.amount,
        amount_inr: p.amount / 100,
        status: p.status,
        captured: p.captured,
        created_at: new Date(p.created_at * 1000).toISOString(),
        razorpay_notes: notes,
      });
    }
    if ((body.items || []).length < 100) break;
    skip += 100;
    await new Promise((r) => setTimeout(r, 150));
  }
  return out;
}

async function loadExistingEmails() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const sb = createClient(url, key);
  const emails = new Set();
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await sb
      .from("students")
      .select("email")
      .range(from, from + page - 1);
    if (error) {
      console.warn("Could not load students from Supabase:", error.message);
      return null;
    }
    for (const row of data || []) {
      if (row.email) emails.add(String(row.email).trim().toLowerCase());
    }
    if (!data || data.length < page) break;
    from += page;
  }
  return emails;
}

async function main() {
  await loadKeysFromSupabaseIfNeeded();
  if (!keyId || !keySecret) {
    console.error("Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET");
    process.exit(1);
  }

  console.log(`Fetching captured payments ${fromArg} → ${toArg} (IST)…\n`);
  const all = await fetchCapturedPayments();
  const existing = await loadExistingEmails();

  const missing = existing
    ? all.filter((p) => !existing.has(p.email))
    : all;

  const stamp = new Date().toISOString().slice(0, 10);
  const outPath = `captures/razorpay-paid-export-${stamp}.json`;
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        window_ist: { from: fromArg, to: toArg },
        total_captured_with_email: all.length,
        missing_from_students_table: missing.length,
        had_supabase_student_lookup: !!existing,
        rows: missing,
      },
      null,
      2
    )
  );

  console.log(`Captured payments with email: ${all.length}`);
  if (existing) {
    console.log(`Not in students table: ${missing.length}`);
  } else {
    console.log("(No SUPABASE_SERVICE_ROLE_KEY — exported all captured rows; filter in SQL.)");
  }
  console.log(`Wrote ${outPath}\n`);
  console.log("Next: run supabase/hotfix_recover_paid_students_missing_directory.sql in SQL Editor.");
  console.log("Default temp password for recovered accounts: EzyRecover@2026");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
