/**
 * Short-lived in-flight + TTL cache to stop duplicate RPCs/queries on one click.
 */
type Entry<T> = { value: T; expires: number };
const inflight = new Map<string, Promise<unknown>>();
const cache = new Map<string, Entry<unknown>>();

export async function coalesce<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs = 8_000
): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.value as T;

  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const p = fn()
    .then((value) => {
      cache.set(key, { value, expires: Date.now() + ttlMs });
      inflight.delete(key);
      return value;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });

  inflight.set(key, p);
  return p;
}

export function clearCoalesce(prefix?: string): void {
  if (!prefix) {
    inflight.clear();
    cache.clear();
    return;
  }
  for (const k of [...inflight.keys()]) {
    if (k.startsWith(prefix)) inflight.delete(k);
  }
  for (const k of [...cache.keys()]) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}
