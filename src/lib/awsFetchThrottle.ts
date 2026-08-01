/**
 * Limit concurrent HTTP requests to the AWS Lambda API.
 * Account concurrency is ~10; admin UI must stay ≤2 in-flight to avoid 503/CORS storms.
 */
const MAX_IN_FLIGHT = 2;
const MIN_GAP_MS = 120;
const MAX_RETRIES = 5;
const RETRY_BASE_MS = 400;

let inFlight = 0;
let lastStartMs = 0;
const queue: Array<() => void> = [];
const inflightByKey = new Map<string, Promise<Response>>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquire(): Promise<void> {
  if (inFlight < MAX_IN_FLIGHT) {
    const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastStartMs));
    if (wait > 0) await sleep(wait);
    inFlight += 1;
    lastStartMs = Date.now();
    return;
  }
  return new Promise((resolve) => {
    queue.push(() => {
      void (async () => {
        const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastStartMs));
        if (wait > 0) await sleep(wait);
        inFlight += 1;
        lastStartMs = Date.now();
        resolve();
      })();
    });
  });
}

function release() {
  inFlight = Math.max(0, inFlight - 1);
  const next = queue.shift();
  if (next) next();
}

export function isAwsLambdaApiUrl(url: string): boolean {
  return (
    /execute-api\.[a-z0-9-]+\.amazonaws\.com/i.test(url) || /\/aws-api(?:\/|$)/i.test(url)
  );
}

function requestKey(input: RequestInfo | URL, init?: RequestInit): string | null {
  const method = (init?.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return null;
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input instanceof Request
          ? input.url
          : "";
  return url ? `${method}:${url}` : null;
}

function shouldRetry(status: number) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(input, init);
      if (shouldRetry(res.status) && attempt < MAX_RETRIES) {
        attempt += 1;
        await sleep(RETRY_BASE_MS * attempt);
        continue;
      }
      return res;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        attempt += 1;
        await sleep(RETRY_BASE_MS * attempt);
        continue;
      }
      throw err;
    }
  }
}

/** Drop-in fetch wrapper for supabase-js `global.fetch`. */
export function awsThrottledFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const key = requestKey(input, init);
  if (key) {
    const existing = inflightByKey.get(key);
    if (existing) {
      return existing.then((res) => res.clone());
    }
  }

  const task = acquire()
    .then(() => fetchWithRetry(input, init))
    .finally(() => {
      release();
      if (key) inflightByKey.delete(key);
    });

  if (key) inflightByKey.set(key, task);
  return task;
}

/** For direct siteApiUrl() calls (batch bootstrap, mail, etc.). */
export function awsApiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return awsThrottledFetch(input, init);
}
