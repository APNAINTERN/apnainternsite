#!/usr/bin/env node
import { writeFileSync } from "fs";
import { loadRazorpayKeys } from "./lib/loadRazorpayKeys.mjs";

/**
 * Capture Razorpay payments that are still status=authorized (not captured yet).
 *
 * Usage:
 *   export RAZORPAY_KEY_ID=rzp_live_...
 *   export RAZORPAY_KEY_SECRET=...
 *   node scripts/list-and-capture-authorized.mjs --dry-run
 *   node scripts/list-and-capture-authorized.mjs --execute
 *
 * Optional: --from=2026-06-05 --fast --execute
 */

let keyId;
let keySecret;

const args = process.argv.slice(2);
const dryRun = !args.includes("--execute");
const maxArg = args.find((a) => a.startsWith("--max="));
const maxCaptures = maxArg ? Math.max(1, parseInt(maxArg.split("=")[1], 10)) : 5000;
const fast = args.includes("--fast");
const fromArg = args.find((a) => a.startsWith("--from="));
const toArg = args.find((a) => a.startsWith("--to="));

function razorpayHeaders() {
  return {
    Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
    "Content-Type": "application/json",
  };
}

function parseIstUnix(dateStr, endOfDay) {
  if (!dateStr) return undefined;
  const time = endOfDay ? "23:59:59" : "00:00:00";
  const t = Date.parse(`${dateStr}T${time}+05:30`);
  return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
}

const fromTs = fromArg ? parseIstUnix(fromArg.split("=")[1], false) : undefined;
const toTs = toArg ? parseIstUnix(toArg.split("=")[1], true) : undefined;

async function razorpay(path, options = {}) {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...options,
    headers: razorpayHeaders(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.description || body?.error?.reason || res.statusText;
    throw new Error(`${res.status} ${path}: ${msg}`);
  }
  return body;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Only status=authorized — nothing else. */
function isAuthorizedOnly(p) {
  return p?.status === "authorized";
}

async function fetchAuthorizedPayments() {
  const pageSize = 100;
  let skip = 0;
  const out = [];

  for (;;) {
    const qs = new URLSearchParams({
      count: String(pageSize),
      skip: String(skip),
      status: "authorized",
    });
    if (fromTs) qs.set("from", String(fromTs));
    if (toTs) qs.set("to", String(toTs));

    const page = await razorpay(`/payments?${qs}`);
    const items = page.items || [];

    for (const p of items) {
      if (!isAuthorizedOnly(p)) continue;
      if (fromTs && p.created_at < fromTs) continue;
      if (toTs && p.created_at > toTs) continue;
      out.push(p);
    }

    if (items.length < pageSize) break;
    skip += pageSize;
    if (skip > 10000) {
      console.warn("Stopped at 10000 rows — use --from/--to to narrow.");
      break;
    }
    await sleep(150);
  }

  return out;
}

async function captureAuthorizedPayment(p) {
  const amount = Math.floor(Number(p.amount));
  const body = await razorpay(`/payments/${p.id}/capture`, {
    method: "POST",
    body: JSON.stringify({ amount, currency: "INR" }),
  });
  if (body.status !== "captured") {
    throw new Error(`capture returned status=${body.status}`);
  }
  return body;
}

async function main() {
  const loaded = await loadRazorpayKeys();
  if (!loaded) {
    console.error(
      "Missing Razorpay keys. Add RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET to .env"
    );
    process.exit(1);
  }
  keyId = loaded.keyId;
  keySecret = loaded.keySecret;

  console.log(`Mode: ${dryRun ? "DRY RUN" : "EXECUTE"}`);
  console.log(`Key: ${keyId.slice(0, 12)}…`);
  if (fromTs || toTs) {
    console.log(`Date filter: ${fromArg?.split("=")[1] || "—"} → ${toArg?.split("=")[1] || "—"} (IST)`);
  }
  console.log(`Max: ${maxCaptures}\n`);

  console.log("Fetching authorized payments from Razorpay…");
  const list = await fetchAuthorizedPayments();
  console.log(`Found ${list.length} authorized payment(s).\n`);

  if (list.length === 0) {
    console.log("Nothing to capture.");
    return;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const outPath = `captures/payment-ids-authorized-${dryRun ? "pending" : "captured"}-${stamp}.json`;
  const results = [];
  let captured = 0;
  let failed = 0;

  for (const p of list) {
    if (!dryRun && captured >= maxCaptures) {
      console.log(`\nReached --max=${maxCaptures}. Stopping.`);
      break;
    }

    const id = p.id;
    const rupees = (p.amount || 0) / 100;
    const created = p.created_at ? new Date(p.created_at * 1000).toISOString() : "—";

    if (dryRun) {
      console.log(`AUTHORIZED  ${id}  ₹${rupees}  ${created}`);
      results.push({
        payment_id: id,
        amount_paise: p.amount,
        created_at: p.created_at,
        status: "authorized",
      });
      continue;
    }

    try {
      await captureAuthorizedPayment(p);
      console.log(`CAP  ${id}  ₹${rupees}`);
      captured++;
      results.push({
        payment_id: id,
        amount_paise: p.amount,
        created_at: p.created_at,
        status: "captured",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`FAIL ${id}  ${msg}`);
      failed++;
      results.push({
        payment_id: id,
        amount_paise: p.amount,
        created_at: p.created_at,
        status: "authorized",
        error: msg,
      });
    }

    await sleep(fast ? 50 : 300);
  }

  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        mode: dryRun ? "dry_run" : "execute",
        filter: "status=authorized only",
        summary: dryRun
          ? { authorized_count: list.length }
          : { captured, failed, total_listed: list.length },
        payments: results,
      },
      null,
      2
    )
  );

  console.log(`\nWrote ${outPath}`);
  if (!dryRun) {
    console.log(`\nCaptured: ${captured}  Failed: ${failed}`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
