import { getSendMailApiUrl, postSendMail } from "@/lib/sendMailApi";

export type BulkCustomMailResult = {
  sent: number;
  failed: number;
  rateLimited: boolean;
  stoppedEarly: boolean;
  lastError?: string;
};

/** Matches server BULK_BATCH_MAX — each request sends this many in parallel on the server. */
export const BULK_MAIL_BATCH_SIZE = 15;
/** How many batch API calls run at once from the browser. */
const PARALLEL_BATCH_REQUESTS = 4;
const RATE_LIMIT_PAUSE_MS = 45_000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function estimateBulkMailSeconds(recipientCount: number): number {
  if (recipientCount <= 0) return 0;
  if (recipientCount <= BULK_MAIL_BATCH_SIZE) return 10;
  const batches = Math.ceil(recipientCount / BULK_MAIL_BATCH_SIZE);
  const waves = Math.ceil(batches / PARALLEL_BATCH_REQUESTS);
  return waves * 12;
}

export function formatBulkMailEta(totalSeconds: number): string {
  if (totalSeconds < 60) return `~${Math.max(5, totalSeconds)}s`;
  const min = Math.ceil(totalSeconds / 60);
  return `~${min} min`;
}

async function sendOneBulkMail(
  to: string,
  subject: string,
  message: string
): Promise<{ ok: boolean; rateLimited: boolean; error?: string }> {
  try {
    const response = await postSendMail({
        action: "bulk_custom_mail",
        to,
        email: to,
        subject,
        message,
      });
    const result = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      message?: string;
    };
    if (response.ok && result.success) return { ok: true, rateLimited: false };
    const errMsg = result.message || `HTTP ${response.status}`;
    return {
      ok: false,
      rateLimited: response.status === 429,
      error: errMsg,
    };
  } catch (e: unknown) {
    return {
      ok: false,
      rateLimited: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function sendBatchOneByOne(
  recipients: string[],
  subject: string,
  message: string
): Promise<{
  sent: number;
  failed: number;
  rateLimited: boolean;
  error?: string;
}> {
  const outcomes = await Promise.all(
    recipients.map((to) => sendOneBulkMail(to, subject, message))
  );
  let sent = 0;
  let failed = 0;
  let rateLimited = false;
  let lastError: string | undefined;
  for (const outcome of outcomes) {
    if (outcome.ok) sent++;
    else {
      failed++;
      lastError = outcome.error;
      if (outcome.rateLimited) rateLimited = true;
    }
  }
  return { sent, failed, rateLimited, error: lastError };
}

function isBatchTimeoutResponse(status: number, errText: string): boolean {
  const low = errText.toLowerCase();
  return (
    status === 502 ||
    status === 504 ||
    status === 408 ||
    low.includes("timeout") ||
    low.includes("timed out") ||
    low.includes("function_invocation") ||
    low.includes("maximum duration")
  );
}

async function sendBatch(
  recipients: string[],
  subject: string,
  message: string
): Promise<{
  sent: number;
  failed: number;
  rateLimited: boolean;
  error?: string;
}> {
  if (recipients.length === 0) {
    return { sent: 0, failed: 0, rateLimited: false };
  }

  if (recipients.length === 1) {
    const one = await sendOneBulkMail(recipients[0], subject, message);
    return {
      sent: one.ok ? 1 : 0,
      failed: one.ok ? 0 : 1,
      rateLimited: one.rateLimited,
      error: one.error,
    };
  }

  let response: Response;
  try {
    response = await postSendMail({
        action: "bulk_custom_mail_batch",
        recipients,
        subject,
        message,
      });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (recipients.length > 1 && msg.toLowerCase().includes("fetch")) {
      const mid = Math.ceil(recipients.length / 2);
      const left = await sendBatch(recipients.slice(0, mid), subject, message);
      const right = await sendBatch(recipients.slice(mid), subject, message);
      return {
        sent: left.sent + right.sent,
        failed: left.failed + right.failed,
        rateLimited: left.rateLimited || right.rateLimited,
        error: right.error || left.error,
      };
    }
    return sendBatchOneByOne(recipients, subject, message);
  }

  const result = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    sent?: number;
    failed?: number;
    rateLimited?: boolean;
    message?: string;
    error?: string;
  };

  const errText = String(result.message || result.error || "");
  if (
    !response.ok &&
    (errText.toLowerCase().includes("unknown mail action") ||
      response.status === 404 ||
      response.status === 405)
  ) {
    return sendBatchOneByOne(recipients, subject, message);
  }

  if (!response.ok && recipients.length > 1 && isBatchTimeoutResponse(response.status, errText)) {
    const mid = Math.ceil(recipients.length / 2);
    const left = await sendBatch(recipients.slice(0, mid), subject, message);
    const right = await sendBatch(recipients.slice(mid), subject, message);
    return {
      sent: left.sent + right.sent,
      failed: left.failed + right.failed,
      rateLimited: left.rateLimited || right.rateLimited,
      error: right.error || left.error,
    };
  }

  const sent = Number(result.sent) || 0;
  const failed = Number(result.failed) || 0;
  const rateLimited = Boolean(result.rateLimited) || response.status === 429;
  const error = result.message || result.error || (response.ok ? undefined : `HTTP ${response.status}`);

  return { sent, failed, rateLimited, error };
}

function chunkRecipients(emails: string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < emails.length; i += BULK_MAIL_BATCH_SIZE) {
    chunks.push(emails.slice(i, i + BULK_MAIL_BATCH_SIZE));
  }
  return chunks;
}

/** Send as fast as SMTP allows — parallel API batches, no client-side pacing. */
export async function sendBulkCustomMail(
  targets: string[],
  subject: string,
  message: string,
  onProgress?: (completed: number, total: number) => void
): Promise<BulkCustomMailResult> {
  const unique = Array.from(
    new Set(targets.map((e) => String(e || "").trim()).filter((e) => e.includes("@")))
  );

  let sent = 0;
  let failed = 0;
  let rateLimited = false;
  let stoppedEarly = false;
  let lastError: string | undefined;

  const chunks = chunkRecipients(unique);

  for (let w = 0; w < chunks.length; w += PARALLEL_BATCH_REQUESTS) {
    const wave = chunks.slice(w, w + PARALLEL_BATCH_REQUESTS);

    let outcomes = await Promise.all(
      wave.map((batch) => sendBatch(batch, subject, message))
    );

    for (let i = 0; i < outcomes.length; i++) {
      let outcome = outcomes[i];
      if (outcome.rateLimited && outcome.sent === 0) {
        await sleep(RATE_LIMIT_PAUSE_MS);
        outcome = await sendBatch(wave[i], subject, message);
        outcomes[i] = outcome;
      }

      sent += outcome.sent;
      failed += outcome.failed;
      lastError = outcome.error;
      onProgress?.(Math.min(sent + failed, unique.length), unique.length);

      if (outcome.rateLimited) {
        rateLimited = true;
        stoppedEarly = true;
        break;
      }
    }

    if (stoppedEarly) break;
  }

  return { sent, failed, rateLimited, stoppedEarly, lastError };
}
