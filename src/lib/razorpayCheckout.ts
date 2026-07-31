/**
 * Loads Razorpay's hosted checkout once and waits until `window.Razorpay` is a
 * real constructor. Without this, `new window.Razorpay(...)` often runs while
 * the async script is still loading → "Razorpay is not a constructor".
 */

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export function getRazorpayConstructor(): (new (options: object) => { open: () => void; on: (e: string, fn: (x: unknown) => void) => void }) | null {
  const R = (window as unknown as { Razorpay?: unknown }).Razorpay;
  return typeof R === "function" ? (R as new (options: object) => { open: () => void; on: (e: string, fn: (x: unknown) => void) => void }) : null;
}

export async function loadRazorpayCheckout(): Promise<void> {
  if (typeof document === "undefined") {
    throw new Error("Razorpay checkout is only available in the browser");
  }

  if (getRazorpayConstructor()) return;

  let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
  if (!script) {
    script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    document.body.appendChild(script);
  }

  if (!getRazorpayConstructor()) {
    await new Promise<void>((resolve, reject) => {
      const finish = () => {
        if (getRazorpayConstructor()) resolve();
      };
      script!.addEventListener("load", finish, { once: true });
      script!.addEventListener(
        "error",
        () => reject(new Error("Could not load Razorpay checkout (network or blocker)")),
        { once: true }
      );
      finish();
    });
  }

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (getRazorpayConstructor()) return;
    await new Promise((r) => setTimeout(r, 40));
  }

  throw new Error(
    "Razorpay did not initialise. Try refreshing the page, or allow scripts from checkout.razorpay.com (disable ad-blockers for this site)."
  );
}
