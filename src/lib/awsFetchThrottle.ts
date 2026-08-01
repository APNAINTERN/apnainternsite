/**
 * Limit concurrent HTTP requests to the AWS Lambda API.
 * Retries 502/503, dedupes identical in-flight GETs, and queues excess work.
 */
const MAX_IN_FLIGHT = 3;
const MAX_RETRIES = 4;
const RETRY_BASE_MS = 250;

let inFlight = 0;
const queue: Array<() => void> = [];
const inflightByKey = new Map<string, Promise<Response>>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function acquire(): Promise<void> {
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    queue.push(() => {
      inFlight += 1;
      resolve();
    });
  });
}

function release() {
  inFlight = Math.max(0, inFlight - 1);
  const next = queue.shift();
  if (next) next();
}

export function isAwsLambdaApiUrl(url: string): boolean {
  return /execute-api\.[a-z0-9-]+\.amazonaws\.com/i.test(url);
}

function requestKey(input: RequestInfo | URL, init?: RequestInit): string | null {
  const method = (init?.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") return null;
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

async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let attempt = 0;
  while (true) {
    const res = await fetch(input, init);
    if ((res.status === 502 || res.status === 503) && attempt < MAX_RETRIES) {
      attempt += 1;
      await sleep(RETRY_BASE_MS * attempt);
      continue;
    }
    return res;
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
