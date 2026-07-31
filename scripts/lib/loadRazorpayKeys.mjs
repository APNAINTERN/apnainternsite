import { readFileSync, existsSync } from "fs";
import { createClient } from "@supabase/supabase-js";

function parseEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

/** Load Razorpay live/test keys from env or payment_config (needs service role). */
export async function loadRazorpayKeys() {
  parseEnvFile(".env");
  parseEnvFile(".env.local");

  let keyId = String(process.env.RAZORPAY_KEY_ID || "").trim();
  let keySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
  if (keyId && keySecret) {
    return { keyId, keySecret, source: "env" };
  }

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceKey) {
    const supabase = createClient(url, serviceKey);
    const { data, error } = await supabase
      .from("payment_config")
      .select("razorpay_key_id, razorpay_key_secret")
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      console.warn("payment_config lookup:", error.message);
    } else if (data?.razorpay_key_id && data?.razorpay_key_secret) {
      return {
        keyId: data.razorpay_key_id,
        keySecret: data.razorpay_key_secret,
        source: "payment_config",
      };
    }
  }

  return null;
}
