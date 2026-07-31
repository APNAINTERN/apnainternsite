/** Skip background polling when the tab is hidden (saves Lambda/RDS calls). */
export function shouldRunBackgroundPoll(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

/** Throttle repeated writes (e.g. site_visits) per key. */
export function shouldFireThrottled(key: string, intervalMs: number): boolean {
  if (typeof window === "undefined") return true;
  const storageKey = `ezy_throttle:${key}`;
  const last = Number(window.sessionStorage.getItem(storageKey) || "0");
  const now = Date.now();
  if (last > 0 && now - last < intervalMs) return false;
  window.sessionStorage.setItem(storageKey, String(now));
  return true;
}

/** Portal routes — no anonymous visitor tracking (QA/admin would spam site_visits). */
export function isPortalAppPath(pathname: string): boolean {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/staff-dashboard") ||
    pathname.startsWith("/super-admin") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/cybercafe") ||
    pathname.startsWith("/college-dashboard") ||
    pathname.startsWith("/referral")
  );
}
