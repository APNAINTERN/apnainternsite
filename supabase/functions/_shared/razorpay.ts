export type RazorpayCreds = { keyId: string; keySecret: string };

function basicAuth({ keyId, keySecret }: RazorpayCreds): string {
  return `Basic ${btoa(`${keyId}:${keySecret}`)}`;
}

async function razorpayJson<T>(
  creds: RazorpayCreds,
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: basicAuth(creds),
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data as { error?: { description?: string } };
    throw new Error(err?.error?.description || `Razorpay API ${res.status}`);
  }
  return data as T;
}

export async function razorpayCreateOrder(
  creds: RazorpayCreds,
  amountPaise: number,
  receipt: string
): Promise<{ id: string; amount: number; currency: string; status: string }> {
  return razorpayJson(creds, '/orders', {
    method: 'POST',
    body: JSON.stringify({
      amount: Math.round(amountPaise),
      currency: 'INR',
      receipt,
      payment_capture: 1,
    }),
  });
}

export async function razorpayFetchPayment(
  creds: RazorpayCreds,
  paymentId: string
): Promise<{ status?: string; amount?: number }> {
  return razorpayJson(creds, `/payments/${paymentId}`);
}

export async function razorpayCapturePayment(
  creds: RazorpayCreds,
  paymentId: string,
  amountPaise: number
): Promise<void> {
  await razorpayJson(creds, `/payments/${paymentId}/capture`, {
    method: 'POST',
    body: JSON.stringify({ amount: Math.floor(amountPaise), currency: 'INR' }),
  });
}

export async function ensurePaymentCaptured(
  creds: RazorpayCreds,
  paymentId: string,
  orderAmountPaise: number
): Promise<void> {
  const pay = await razorpayFetchPayment(creds, paymentId);
  const status = pay.status;
  if (status === 'captured') return;

  const amountPaise = Math.floor(
    Number.isFinite(Number(pay.amount)) && Number(pay.amount) > 0
      ? Number(pay.amount)
      : orderAmountPaise
  );

  if (status === 'authorized') {
    try {
      await razorpayCapturePayment(creds, paymentId, amountPaise);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/already\s+captured/i.test(msg)) return;
      throw err;
    }
    return;
  }

  throw new Error(
    `Payment ${paymentId} is not capturable (status: ${status || 'unknown'}).`
  );
}

export async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  keySecret: string
): Promise<boolean> {
  const expected = await hmacSha256Hex(`${orderId}|${paymentId}`, keySecret);
  return expected === signature;
}

export async function verifyWebhookSignature(
  bodyText: string,
  signature: string,
  webhookSecret: string
): Promise<boolean> {
  const expected = await hmacSha256Hex(bodyText, webhookSecret);
  return expected === signature;
}
