/**
 * Payment via same-origin Express API (/api/payment/*) → RDS.
 */

import { getSiteApiOrigin } from "@/lib/siteApi";

function apiPaymentUrl(path: "create-order" | "verify" | "webhook"): string {
  const origin = getSiteApiOrigin();
  if (origin) return `${origin}/api/payment/${path}`;
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/payment/${path}`;
  }
  return `/api/payment/${path}`;
}

type PaymentJson = Record<string, unknown>;

async function postPaymentJson(
  apiPath: "create-order" | "verify",
  body: unknown,
  options?: { timeoutMs?: number }
): Promise<{ ok: boolean; status: number; data: PaymentJson }> {
  const payload = JSON.stringify(body);
  const timeoutMs = options?.timeoutMs;

  let last: { ok: boolean; status: number; data: PaymentJson } = {
    ok: false,
    status: 0,
    data: { success: false, message: "Payment service unavailable" },
  };

  const controller = timeoutMs ? new AbortController() : undefined;
  const timer =
    controller && timeoutMs
      ? window.setTimeout(() => controller.abort(), timeoutMs)
      : undefined;

  try {
    const res = await fetch(apiPaymentUrl(apiPath), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      signal: controller?.signal,
    });
    const data = (await res.json().catch(() => ({}))) as PaymentJson;
    last = { ok: res.ok, status: res.status, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch";
    last = { ok: false, status: 0, data: { success: false, message } };
    console.warn(`[payment] ${apiPath} network error:`, message);
  } finally {
    if (timer) window.clearTimeout(timer);
  }

  return last;
}

export async function paymentCreateOrder(body: {
  studentData: Record<string, unknown>;
  amount: number;
}): Promise<{ ok: boolean; status: number; data: PaymentJson }> {
  return postPaymentJson("create-order", body);
}

export async function paymentVerify(body: {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}): Promise<{ ok: boolean; status: number; data: PaymentJson }> {
  return postPaymentJson("verify", body);
}

/** Razorpay dashboard webhook URL (point at /api/payment/webhook on your API host). */
export function getPaymentWebhookUrl(): string {
  return apiPaymentUrl("webhook");
}
