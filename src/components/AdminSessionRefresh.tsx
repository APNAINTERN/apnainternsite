import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ADMIN_SESSION_REFRESH_INTERVAL_MS,
  isAdminPortalSessionActive,
  refreshAdminSessionIfPresent,
  touchAdminSessionExpiry,
} from "@/lib/adminAuthSession";
import { shouldRunBackgroundPoll } from "@/lib/apiPollingGuard";

const ACTIVITY_EXTEND_MS = 5 * 60 * 1000;

/**
 * Keeps admin / super-admin sessions alive (8h window, refresh ~10 min).
 * Students use {@link StudentSessionRefresh} instead — no overlap.
 */
export function AdminSessionRefresh() {
  useEffect(() => {
    let lastActivityExtend = 0;

    const tick = () => {
      if (!isAdminPortalSessionActive()) return;
      if (!shouldRunBackgroundPoll()) return;
      void refreshAdminSessionIfPresent(supabase);
    };

    const extendOnActivity = () => {
      if (!isAdminPortalSessionActive()) return;
      const now = Date.now();
      if (now - lastActivityExtend < ACTIVITY_EXTEND_MS) return;
      lastActivityExtend = now;
      touchAdminSessionExpiry();
    };

    tick();
    const interval = window.setInterval(tick, ADMIN_SESSION_REFRESH_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      touchAdminSessionExpiry();
      // Token refresh is handled by the interval — avoid extra refresh on every tab return.
    };
    const onFocus = () => {
      touchAdminSessionExpiry();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);
    window.addEventListener("click", extendOnActivity, { passive: true });
    window.addEventListener("keydown", extendOnActivity, { passive: true });

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onFocus);
      window.removeEventListener("click", extendOnActivity);
      window.removeEventListener("keydown", extendOnActivity);
    };
  }, []);

  return null;
}
