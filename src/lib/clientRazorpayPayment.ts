import { toast } from "sonner";
import { getRazorpayConstructor, loadRazorpayCheckout } from "@/lib/razorpayCheckout";

export type PublicPaymentSettings = {
  razorpay_key_id?: string | null;
  currency?: string | null;
  is_active?: boolean | null;
  amount_paise?: number | null;
};

export type ClientCheckoutResult =
  | { success: true; payment_id: string; amount: number; mode: "legacy" }
  | { success: false; cancelled?: boolean };

export const RAZORPAY_CHECKOUT_START = "ezyintern:razorpay-checkout-start";
export const RAZORPAY_CHECKOUT_END = "ezyintern:razorpay-checkout-end";

const RAZORPAY_MODAL_SELECTOR =
  "#razorpay-checkout-v2-container, .razorpay-container, .razorpay-backdrop, .razorpay-modal, iframe[name='razorpay-checkout-frame']";

/**
 * Razorpay checkout runs on https://api.razorpay.com — it cannot load http://localhost logos (CORS / PNA).
 * Only pass an image when we have a public HTTPS URL (production or VITE_PUBLIC_APP_URL).
 */
export function razorpayCheckoutImageUrl(): string | undefined {
  const envBase = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)
    ?.trim()
    .replace(/\/$/, "");
  if (envBase?.startsWith("https://") && !/localhost|127\.0\.0\.1/i.test(envBase)) {
    return `${envBase}/logo-icon.png`;
  }
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    if (origin.startsWith("https://") && !/localhost|127\.0\.0\.1/i.test(origin)) {
      return `${origin}/logo-icon.png`;
    }
  }
  return undefined;
}

export function isRazorpayModalInDom(): boolean {
  return typeof document !== "undefined" && document.querySelector(RAZORPAY_MODAL_SELECTOR) !== null;
}

/**
 * Close a previous checkout via the SDK only.
 * Do not remove / restyle Razorpay iframes — that triggers "browser not supported".
 */
export function destroyExistingRazorpayCheckout(): void {
  if (typeof document === "undefined") return;
  document.getElementById("ezyintern-razorpay-checkout-fix")?.remove();
  document.body.classList.remove("razorpay-checkout-active");
}

/** @deprecated No-op kept for callers; never mutate Razorpay iframe DOM. */
export function forceRazorpayModalOnTop(): void {
  /* intentionally empty */
}

export function waitForRazorpayModalInDom(timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(false);
      return;
    }

    let settled = false;
    let observer: MutationObserver | null = null;
    let poll = 0;
    let timer = 0;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      observer?.disconnect();
      if (poll) window.clearInterval(poll);
      if (timer) window.clearTimeout(timer);
      resolve(ok);
    };

    const tick = (): boolean => {
      if (!isRazorpayModalInDom()) return false;
      finish(true);
      return true;
    };

    if (tick()) return;

    observer = new MutationObserver(() => {
      tick();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    poll = window.setInterval(tick, 120);
    timer = window.setTimeout(() => finish(isRazorpayModalInDom()), timeoutMs);
  });
}

type RazorpayInstance = {
  open: () => void;
  close?: () => void;
  on: (event: string, fn: (x: unknown) => void) => void;
};

/** Open checkout without touching Razorpay's iframe DOM. */
export function openRazorpayModal(
  rzp: RazorpayInstance,
  hooks: {
    onModalOpen?: () => void;
    onModalMissing?: () => void;
  }
): void {
  try {
    // Unlock body in case a Radix dialog left scroll-lock on.
    document.body.style.pointerEvents = "auto";
    document.body.style.removeProperty("overflow");
    document.body.removeAttribute("data-scroll-locked");
    document.documentElement.removeAttribute("data-scroll-locked");

    rzp.open();
  } catch (err: unknown) {
    console.error("Razorpay open failed:", err);
    hooks.onModalMissing?.();
    return;
  }

  // Loading UI can clear immediately; iframe paints async.
  hooks.onModalOpen?.();

  void waitForRazorpayModalInDom(8000).then((visible) => {
    if (visible) return;
    console.error("[razorpay] checkout modal not found in DOM after open()");
    hooks.onModalMissing?.();
  });
}

/**
 * Soft prep only: notify NoticePopup to close, lower sticky header z-index.
 * Never rewrite Razorpay iframe styles (that causes "browser not supported").
 */
export function prepareDomForRazorpayCheckout(): () => void {
  if (typeof document === "undefined") return () => {};

  window.dispatchEvent(new CustomEvent(RAZORPAY_CHECKOUT_START));

  document.body.style.pointerEvents = "auto";
  document.body.removeAttribute("data-scroll-locked");
  document.documentElement.removeAttribute("data-scroll-locked");

  const styleEl = document.createElement("style");
  styleEl.id = "ezyintern-razorpay-checkout-fix";
  styleEl.textContent = `
    body.razorpay-checkout-active { overflow: hidden !important; }
    body.razorpay-checkout-active header.sticky { z-index: 0 !important; }
  `;
  document.getElementById("ezyintern-razorpay-checkout-fix")?.remove();
  document.head.appendChild(styleEl);
  document.body.classList.add("razorpay-checkout-active");

  return () => {
    styleEl.remove();
    document.body.classList.remove("razorpay-checkout-active");
    window.dispatchEvent(new CustomEvent(RAZORPAY_CHECKOUT_END));
  };
}

/** Legacy browser-only checkout (amount only, no order_id). */
export async function runClientRazorpayCheckout(opts: {
  paymentSettings: PublicPaymentSettings;
  amountPaise: number;
  prefill: { name: string; email: string; contact: string };
  description?: string;
  /** Called once Razorpay modal is visible in the DOM. */
  onModalOpen?: () => void;
}): Promise<ClientCheckoutResult> {
  const key = opts.paymentSettings?.razorpay_key_id?.trim();
  if (!key) {
    throw new Error("Payment is not configured. Contact support.");
  }

  const amountPaise = Math.round(Number(opts.amountPaise));
  if (!Number.isFinite(amountPaise) || amountPaise < 100) {
    throw new Error("Invalid registration fee amount. Please refresh and try again.");
  }

  if (!getRazorpayConstructor()) {
    await loadRazorpayCheckout();
  }
  const RazorpayCtor = getRazorpayConstructor();
  if (!RazorpayCtor) {
    throw new Error("Payment checkout could not load. Please refresh the page.");
  }

  return new Promise((resolve) => {
    const cleanupDom = prepareDomForRazorpayCheckout();
    let resolved = false;
    let rzp: { close?: () => void; on: Function } | null = null;

    const forceClose = () => {
      try {
        rzp?.close?.();
      } catch {
        /* ignore */
      }
      cleanupDom();
    };

    const safeResolve = (val: ClientCheckoutResult) => {
      if (resolved) return;
      resolved = true;
      forceClose();
      resolve(val);
    };

    const checkoutImage = razorpayCheckoutImageUrl();
    rzp = new RazorpayCtor({
      key,
      amount: amountPaise,
      currency: opts.paymentSettings.currency || "INR",
      name: "Apna Intern",
      description: opts.description || "Student Registration Fee",
      ...(checkoutImage ? { image: checkoutImage } : {}),
      prefill: opts.prefill,
      handler: (response: { razorpay_payment_id?: string }) => {
        forceClose();
        const paymentId = response?.razorpay_payment_id;
        if (!paymentId) {
          if (!resolved) {
            resolved = true;
            resolve({ success: false });
          }
          return;
        }
        if (!resolved) {
          resolved = true;
          resolve({
            success: true,
            payment_id: paymentId,
            amount: amountPaise,
            mode: "legacy",
          });
        }
      },
      modal: {
        ondismiss: () => safeResolve({ success: false, cancelled: true }),
        escape: true,
        backdropclose: true,
      },
      theme: { color: "#4F46E5" },
    });

    rzp.on("payment.failed", () => safeResolve({ success: false }));

    openRazorpayModal(rzp as any, {
      onModalOpen: opts.onModalOpen,
      onModalMissing: () => {
        toast.error(
          "Payment window did not open. Allow scripts from checkout.razorpay.com, disable ad blockers, and try again."
        );
        safeResolve({ success: false });
      },
    });
  });
}
