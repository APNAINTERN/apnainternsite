#!/usr/bin/env node
/**
 * Capture Razorpay payments that are still "authorized" (not yet captured).
 *
 * Usage:
 *   export RAZORPAY_KEY_ID=rzp_live_xxxx
 *   export RAZORPAY_KEY_SECRET=your_secret
 *   node scripts/capture-authorized-payments.mjs captures/payment-ids-first-10.json
 *
 * Accepts JSON array OR { payments: [...] } from list-and-capture-authorized.mjs
 */

import { readFileSync } from "fs";
import { loadRazorpayKeys } from "./lib/loadRazorpayKeys.mjs";

const listPath = process.argv[2] || "captures/payment-ids-first-10.json";

let keyId;
let keySecret;

function razorpayHeaders() {
  return {
    Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
    "Content-Type": "application/json",
  };
}

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

function isAlreadyCapturedMessage(msg) {
  const m = String(msg || "").toLowerCase();
  return m.includes("already been captured") || m.includes("already captured");
}

function loadPaymentList(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.payments)) return raw.payments;
  throw new Error("List file must be a JSON array or { payments: [...] }");
}

async function main() {
  const loaded = await loadRazorpayKeys();
  if (!loaded) {
    console.error("Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the environment.");
    process.exit(1);
  }
  keyId = loaded.keyId;
  keySecret = loaded.keySecret;

  const items = loadPaymentList(listPath);
  if (items.length === 0) {
    console.error("Payment list is empty.");
    process.exit(1);
  }

  console.log(`Processing ${items.length} payment(s) from ${listPath}\n`);

  let captured = 0;
  let already = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of items) {
    const id = row.payment_id || row.id;
    if (!id) continue;

    try {
      const pay = await razorpay(`/payments/${id}`);
      const amount = Math.floor(
        Number(
          typeof row.amount_paise === "number" && row.amount_paise > 0
            ? row.amount_paise
            : pay.amount
        )
      );

      if (pay.captured === true || pay.status === "captured") {
        console.log(`SKIP ${id}  already captured`);
        already++;
        continue;
      }
      if (pay.status !== "authorized") {
        console.log(`SKIP ${id}  status=${pay.status}`);
        skipped++;
        continue;
      }

      try {
        await razorpay(`/payments/${id}/capture`, {
          method: "POST",
          body: JSON.stringify({ amount, currency: "INR" }),
        });
      } catch (capErr) {
        const msg = capErr instanceof Error ? capErr.message : String(capErr);
        if (isAlreadyCapturedMessage(msg)) {
          console.log(`SKIP ${id}  already captured`);
          already++;
          continue;
        }
        throw capErr;
      }

      console.log(`CAP  ${id}  ₹${amount / 100}  captured`);
      captured++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isAlreadyCapturedMessage(msg)) {
        console.log(`SKIP ${id}  already captured`);
        already++;
      } else {
        console.error(`ERR  ${id}  ${msg}`);
        errors++;
      }
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Captured:         ${captured}`);
  console.log(`Already captured: ${already}`);
  console.log(`Skipped:          ${skipped}`);
  console.log(`Errors:           ${errors}`);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
