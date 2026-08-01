/**
 * Limit concurrent HTTP requests to the AWS Lambda API.
 * Small accounts can throttle at ~10 concurrent executions; the admin UI
 * fires 15+ parallel Supabase REST calls and triggers 503s without CORS headers.
 */
const MAX_IN_FLIGHT = 3;

let inFlight = 0;
const queue: Array<() => void> = [];

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

/** Drop-in fetch wrapper for supabase-js `global.fetch`. */
export function awsThrottledFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return acquire().then(() =>
    fetch(input, init).finally(() => {
      release();
    })
  );
}
