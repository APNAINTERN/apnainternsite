#!/usr/bin/env node
/**
 * List ALL captured Razorpay payments on 31 May 2026 (IST) with email.
 * Marks which emails are already in public.students vs need recovery.
 *
 * Usage:
 *   export RAZORPAY_KEY_ID=rzp_live_...
 *   export RAZORPAY_KEY_SECRET=...
 *   export SUPABASE_SERVICE_ROLE_KEY=...   # optional — to flag existing students
 *   export VITE_SUPABASE_URL=...
 *   node scripts/may31-razorpay-paid-email-list.mjs
 *
 * Output:
 *   captures/razorpay-may31-2026-captured-emails.json
 */

import { writeFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const FROM_DATE = "2026-05-31";
const TO_DATE = "2026-05-31";

let keyId = process.env.RAZORPAY_KEY_ID;
let keySecret = process.env.RAZORPAY_KEY_SECRET;

async function loadKeysFromSupabaseIfNeeded() {
  if (keyId && keySecret) return;
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  const sb = createClient(url, key);
  const { data } = await sb
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

function parseIstUnix(dateStr, endOfDay) {
  const time = endOfDay ? "23:59:59" : "00:00:00";
  return Math.floor(Date.parse(`${dateStr}T${time}+05:30`) / 1000);
}

const fromTs = parseIstUnix(FROM_DATE, false);
const toTs = parseIstUnix(TO_DATE, true);

function authHeaders() {
  return {
    Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
  };
}

async function fetchCapturedMay31() {
  const out = [];
  let skip = 0;
  for (;;) {
    const qs = new URLSearchParams({ count: "100", skip: String(skip), from: String(fromTs), to: String(toTs) });
    const res = await fetch(`https://api.razorpay.com/v1/payments?${qs}`, { headers: authHeaders() });
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error?.description || res.statusText);
    for (const p of body.items || []) {
      const captured = p.status === "captured" || p.captured === true;
      if (!captured) continue;
      const notes = p.notes && typeof p.notes === "object" ? p.notes : {};
      const email = String(p.email || notes.email || notes.student_email || "")
        .trim()
        .toLowerCase();
      const contact = String(p.contact || notes.contact || notes.phone || "").replace(/\D/g, "");
      out.push({
        payment_id: p.id,
        email: email.includes("@") ? email : null,
        contact: contact || null,
        full_name:
          String(notes.fullName || notes.full_name || notes.name || p.description || "").trim() || null,
        amount_inr: p.amount / 100,
        amount_paise: p.amount,
        status: p.status,
        created_at_utc: new Date(p.created_at * 1000).toISOString(),
        created_at_ist: new Date(p.created_at * 1000).toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
        }),
      });
    }
    if ((body.items || []).length < 100) break;
    skip += 100;
    await new Promise((r) => setTimeout(r, 120));
  }
  return out;
}

function supabaseClientForLookup() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!url) return null;
  if (serviceKey) return createClient(url, serviceKey);
  if (anonKey) {
    console.log("Using anon key (no service role) — payment_orders lookup only; students table not scanned.\n");
    return createClient(url, anonKey);
  }
  return null;
}

async function loadStudentEmails(sb) {
  if (!sb || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const set = new Set();
  let offset = 0;
  for (;;) {
    const { data, error } = await sb.from("students").select("email").range(offset, offset + 999);
    if (error) throw error;
    for (const row of data || []) {
      if (row.email) set.add(String(row.email).trim().toLowerCase());
    }
    if (!data || data.length < 1000) break;
    offset += 1000;
  }
  return { sb, emails: set };
}

async function loadPaymentOrdersMay31(sb) {
  if (!sb) return { byPaymentId: new Map(), byEmail: new Map() };
  const fromIso = "2026-05-31T00:00:00+05:30";
  const toIso = "2026-06-01T00:00:00+05:30";
  const byPaymentId = new Map();
  const byEmail = new Map();
  let offset = 0;
  for (;;) {
    const { data, error } = await sb
      .from("payment_orders")
      .select("order_id, user_email, user_phone, payment_id, status, amount, metadata, created_at")
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .range(offset, offset + 999);
    if (error) {
      console.warn("payment_orders batch load failed:", error.message);
      return { byPaymentId, byEmail };
    }
    for (const po of data || []) {
      const meta = po.metadata && typeof po.metadata === "object" ? po.metadata : {};
      const email = String(po.user_email || meta.email || "")
        .trim()
        .toLowerCase();
      if (po.payment_id) byPaymentId.set(po.payment_id, po);
      if (email) byEmail.set(email, po);
    }
    if (!data || data.length < 1000) break;
    offset += 1000;
  }
  return { byPaymentId, byEmail };
}

function enrichFromPaymentOrdersMaps(rows, maps) {
  return rows.map((row) => {
    const po =
      (row.payment_id && maps.byPaymentId.get(row.payment_id)) ||
      (row.email && maps.byEmail.get(row.email)) ||
      null;
    const meta = po?.metadata && typeof po.metadata === "object" ? po.metadata : {};
    return {
      ...row,
      has_payment_order: !!po,
      order_id: po?.order_id || null,
      order_status: po?.status || null,
      db_email: po ? String(po.user_email || meta.email || "").toLowerCase() : null,
      db_phone: po?.user_phone || meta.contact_number || meta.contact || null,
      db_full_name: meta.fullName || meta.full_name || null,
      db_password_in_metadata: !!meta.password,
    };
  });
}

async function main() {
  await loadKeysFromSupabaseIfNeeded();
  if (!keyId || !keySecret) {
    console.error("Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET");
    process.exit(1);
  }

  console.log(`Razorpay captured payments — ${FROM_DATE} (IST)\n`);
  const captured = await fetchCapturedMay31();
  const withEmail = captured.filter((r) => r.email);
  const noEmail = captured.filter((r) => !r.email);

  const sb = supabaseClientForLookup();
  const lookup = await loadStudentEmails(sb);
  let rows = withEmail.map((r) => ({
    ...r,
    in_students_table: lookup ? lookup.emails.has(r.email) : null,
    needs_recovery: lookup ? !lookup.emails.has(r.email) : null,
  }));

  const orderMaps = await loadPaymentOrdersMay31(sb);
  console.log(`payment_orders in DB (31 May): ${orderMaps.byEmail.size} emails\n`);
  rows = enrichFromPaymentOrdersMaps(rows, orderMaps);

  // Without service role: Razorpay paid but no payment_orders row in DB
  if (!lookup) {
    rows = rows.map((r) => ({
      ...r,
      likely_needs_recovery:
        r.email !== null && (r.has_payment_order === false || r.order_status !== "success"),
    }));
  }

  const needsRecovery = rows.filter((r) => r.needs_recovery === true);
  const likelyNeedsRecovery = rows.filter((r) => r.likely_needs_recovery === true);
  const alreadyStored = rows.filter((r) => r.in_students_table === true);

  const outPath = "captures/razorpay-may31-2026-captured-emails.json";
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        date_ist: FROM_DATE,
        total_captured: captured.length,
        with_email: withEmail.length,
        without_email: noEmail.length,
        already_in_students: alreadyStored.length,
        needs_recovery: needsRecovery.length,
        likely_needs_recovery_no_service_role: likelyNeedsRecovery.length,
        emails_needing_recovery: needsRecovery.map((r) => r.email),
        emails_likely_needing_recovery: likelyNeedsRecovery.map((r) => r.email).filter(Boolean),
        rows,
        no_email_payments: noEmail,
      },
      null,
      2
    )
  );

  console.log(`Total captured (31 May IST):     ${captured.length}`);
  console.log(`With email on Razorpay:          ${withEmail.length}`);
  console.log(`No email on Razorpay:            ${noEmail.length}`);
  if (lookup) {
    console.log(`Already in students table:     ${alreadyStored.length}`);
    console.log(`Need recovery (31 May only):    ${needsRecovery.length}`);
  } else {
    console.log("(Set SUPABASE_SERVICE_ROLE_KEY to compare with students table)");
  }
  console.log(`\nWrote ${outPath}`);
  console.log("\nNext: run supabase/hotfix_recover_may31_2026_only.sql in Supabase SQL Editor.");
  const showList = needsRecovery.length ? needsRecovery : likelyNeedsRecovery;
  if (showList.length) {
    console.log("\nSample emails (recover via hotfix_recover_may31_2026_only.sql):");
    for (const r of showList.slice(0, 30)) {
      console.log(`  ${r.email}  ${r.payment_id}  ₹${r.amount_inr}  order_in_db=${r.has_payment_order}`);
    }
    if (showList.length > 30) console.log(`  ... and ${showList.length - 30} more in ${outPath}`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
