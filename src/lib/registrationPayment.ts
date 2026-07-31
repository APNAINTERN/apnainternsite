import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import {
  runClientRazorpayCheckout,
  type PublicPaymentSettings,
  prepareDomForRazorpayCheckout,
  razorpayCheckoutImageUrl,
  openRazorpayModal,
} from "@/lib/clientRazorpayPayment";
import { getRazorpayConstructor, loadRazorpayCheckout } from "@/lib/razorpayCheckout";
import { paymentCreateOrder, paymentVerify } from "@/lib/paymentApi";

export type RegistrationPaymentResult =
  | { success: true; mode: "verified"; payment_id: string; amount: number; userId?: string }
  | { success: true; mode: "legacy"; payment_id: string; amount: number }
  | { success: false; cancelled?: boolean };

const PAYMENT_CONFIG_COLUMNS = "razorpay_key_id, amount_paise, is_active, currency";

/** Call on registration step 4+ so the Razorpay script is ready before pay click. */
export function prefetchRegistrationCheckout(): Promise<void> {
  return loadRazorpayCheckout().catch(() => {});
}

function envRazorpayKeyId(): string {
  return String(import.meta.env.VITE_RAZORPAY_KEY_ID || "").trim();
}

/** Normalize DB row + optional Vite public key fallback. */
export function normalizePaymentSettings(
  raw: PublicPaymentSettings | null | undefined
): PublicPaymentSettings | null {
  if (!raw) {
    const envKey = envRazorpayKeyId();
    if (!envKey) return null;
    return {
      razorpay_key_id: envKey,
      is_active: true,
      amount_paise: 9900,
      currency: "INR",
    };
  }

  const key = String(raw.razorpay_key_id || "").trim() || envRazorpayKeyId();
  return {
    ...raw,
    razorpay_key_id: key || raw.razorpay_key_id,
    is_active: raw.is_active === false ? false : true,
  };
}

/** Read payment settings for checkout (public RPC or safe view only — never payment_config secrets). */
export async function fetchPublicPaymentConfig(
  client: SupabaseClient
): Promise<PublicPaymentSettings | null> {
  const { data: fromRpc, error: rpcErr } = await client.rpc("get_public_payment_config");
  if (!rpcErr && fromRpc && typeof fromRpc === "object") {
    return normalizePaymentSettings(fromRpc as PublicPaymentSettings);
  }

  const { data: fromView, error: viewErr } = await client
    .from("public_payment_config")
    .select(PAYMENT_CONFIG_COLUMNS)
    .maybeSingle();

  if (!viewErr && fromView) {
    return normalizePaymentSettings(fromView as PublicPaymentSettings);
  }

  if (rpcErr) {
    const msg = String(rpcErr.message || "");
    if (rpcErr.code === "PGRST202" || msg.toLowerCase().includes("could not find")) {
      console.warn("[payment] get_public_payment_config missing; using env fallback if set");
    } else {
      console.warn("[payment] config RPC failed", rpcErr);
    }
  } else if (viewErr) {
    console.warn("[payment] public_payment_config view failed", viewErr);
  }

  return normalizePaymentSettings(null);
}

export type RegistrationPaymentOptions = {
  isAdmin?: boolean;
};

export function isRegistrationPaymentRequired(
  _settings: PublicPaymentSettings | null | undefined,
  opts?: RegistrationPaymentOptions
): boolean {
  if (opts?.isAdmin) return false;
  if (import.meta.env.VITE_REGISTRATION_PAYMENT_OPTIONAL === "true") return false;
  return true;
}

export function canOpenRegistrationCheckout(
  settings: PublicPaymentSettings | null | undefined
): boolean {
  const normalized = normalizePaymentSettings(settings);
  return Boolean(String(normalized?.razorpay_key_id || "").trim());
}

function openRazorpayCheckout(
  baseOptions: Record<string, unknown>,
  onPaid: (response: {
    razorpay_payment_id?: string;
    razorpay_order_id?: string;
    razorpay_signature?: string;
  }) => Promise<RegistrationPaymentResult>,
  onModalOpen?: () => void
): Promise<RegistrationPaymentResult> {
  return new Promise((resolve) => {
    const cleanupDom = prepareDomForRazorpayCheckout();
    let settled = false;
    let rzp: { close?: () => void; on: Function; open: Function } | null = null;

    function forceCloseCheckout() {
      try {
        rzp?.close?.();
      } catch {
        /* ignore */
      }
      // Close via SDK only — do not rip Razorpay iframes out of the DOM.
      cleanupDom();
    }

    function finish(val: RegistrationPaymentResult) {
      if (settled) return;
      settled = true;
      forceCloseCheckout();
      resolve(val);
    }

    const RazorpayCtor = getRazorpayConstructor();
    if (!RazorpayCtor) {
      finish({ success: false });
      return;
    }

    rzp = new RazorpayCtor({
      ...baseOptions,
      handler: (response: {
        razorpay_payment_id?: string;
        razorpay_order_id?: string;
        razorpay_signature?: string;
      }) => {
        // Close QR/modal immediately so verify/enrollment cannot leave it stuck open.
        forceCloseCheckout();
        void onPaid(response)
          .then((result) => {
            if (settled) return;
            settled = true;
            resolve(result);
          })
          .catch((err) => {
            console.error("Payment handler error:", err);
            if (settled) return;
            settled = true;
            resolve({ success: false });
          });
      },
      modal: {
        ondismiss: () => finish({ success: false, cancelled: true }),
        escape: true,
        backdropclose: true,
      },
      theme: { color: "#4F46E5" },
    });

    rzp.on("payment.failed", () => finish({ success: false }));

    openRazorpayModal(rzp as any, {
      onModalOpen,
      onModalMissing: () => {
        toast.error(
          "Payment window did not open. Allow scripts from checkout.razorpay.com, disable ad blockers, and try again."
        );
        finish({ success: false });
      },
    });
  });
}

const ORDER_API_ENABLED = import.meta.env.VITE_REGISTRATION_USE_ORDER_API !== "false";

async function tryCreateOrderWithTimeout(
  body: { studentData: Record<string, unknown>; amount: number },
  timeoutMs: number
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> } | null> {
  try {
    return await Promise.race([
      paymentCreateOrder(body),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), timeoutMs)),
    ]);
  } catch {
    return null;
  }
}

/**
 * Opens Razorpay for registration. Default: legacy checkout (instant modal, no API wait).
 * Set VITE_REGISTRATION_USE_ORDER_API=true to try server order first (2.5s cap, then legacy).
 */
export async function runRegistrationRazorpayCheckout(opts: {
  paymentSettings: PublicPaymentSettings;
  amountPaise: number;
  prefill: { name: string; email: string; contact: string };
  studentData?: Record<string, unknown>;
  description?: string;
  onModalOpen?: () => void;
}): Promise<RegistrationPaymentResult> {
  const settings = normalizePaymentSettings(opts.paymentSettings);
  const key = String(settings?.razorpay_key_id || "").trim();
  if (!key) {
    throw new Error("Payment gateway is not configured. Contact support.");
  }

  const amountPaise = Math.round(Number(opts.amountPaise));
  if (!Number.isFinite(amountPaise) || amountPaise < 100) {
    throw new Error("Invalid payment amount. Refresh the page and try again.");
  }

  const description = opts.description || "Student Payment";
  const purpose = String(opts.studentData?.purpose || "").trim().toLowerCase();
  // Prefer legacy (instant) checkout for course add-ons — order API used to 400 on
  // already-registered emails and then a second open() broke Razorpay.
  const tryOrderApi =
    ORDER_API_ENABLED &&
    opts.studentData &&
    purpose !== "course_purchase" &&
    purpose !== "internship_upgrade";

  const scriptReady = loadRazorpayCheckout();

  if (tryOrderApi) {
    const [orderRes] = await Promise.all([
      tryCreateOrderWithTimeout({ studentData: opts.studentData, amount: amountPaise }, 1500),
      scriptReady,
    ]);

    if (orderRes?.ok && orderRes.data.success === true) {
      const orderId = String(orderRes.data.orderId || "");
      const orderKey = String(orderRes.data.key || key);
      const orderAmount = Number(orderRes.data.amount) || amountPaise;
      const currency = String(orderRes.data.currency || settings?.currency || "INR");

      if (orderId) {
        const checkoutImage = razorpayCheckoutImageUrl();
        // Order checkout was opened — never open a second (legacy) checkout in the same click.
        // Double open() triggers Razorpay's "browser not supported" alert.
        const checkoutResult = await openRazorpayCheckout(
          {
            key: orderKey,
            order_id: orderId,
            amount: orderAmount,
            currency,
            name: "EzyIntern",
            description,
            ...(checkoutImage ? { image: checkoutImage } : {}),
            prefill: opts.prefill,
          },
          async (response) => {
            const paymentId = response?.razorpay_payment_id;
            const orderIdFromRzp = response?.razorpay_order_id;
            const signature = response?.razorpay_signature;
            if (!paymentId || !orderIdFromRzp || !signature) {
              return { success: false as const };
            }

            const verifyRes = await paymentVerify({
              razorpay_payment_id: paymentId,
              razorpay_order_id: orderIdFromRzp,
              razorpay_signature: signature,
            });

            if (!verifyRes.ok || !verifyRes.data.success) {
              const status = verifyRes.status;
              const raw = String(verifyRes.data?.message || "Payment verification failed");
              if (paymentId && status !== 400) {
                console.warn("[payment] verify API enrollment failed; using client completion:", raw);
                return {
                  success: true as const,
                  mode: "legacy" as const,
                  payment_id: paymentId,
                  amount: orderAmount,
                };
              }
              throw new Error(raw);
            }

            return {
              success: true as const,
              mode: "verified" as const,
              payment_id: paymentId,
              amount: orderAmount,
              userId: typeof verifyRes.data.userId === "string" ? verifyRes.data.userId : undefined,
            };
          },
          opts.onModalOpen
        );

        return checkoutResult;
      }
    }
  }

  if (!getRazorpayConstructor()) {
    await scriptReady;
  }

  const legacy = await runClientRazorpayCheckout({
    paymentSettings: settings || opts.paymentSettings,
    amountPaise,
    prefill: opts.prefill,
    description,
    onModalOpen: opts.onModalOpen,
  });

  if (!legacy.success) return legacy;
  return { ...legacy, mode: "legacy" };
}
