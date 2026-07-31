import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isAdminPortalSessionActive } from "@/lib/adminAuthSession";
import { refreshStudentSessionIfPresent } from "@/lib/studentAuthSession";
import { shouldRunBackgroundPoll } from "@/lib/apiPollingGuard";

const REFRESH_INTERVAL_MS = 45 * 60 * 1000;

/**
 * Keeps student sessions alive via refresh tokens (reduces repeat OTP logins).
 * Admin portal sessions use {@link AdminSessionRefresh} instead.
 */
export function StudentSessionRefresh() {
  useEffect(() => {
    const tick = () => {
      if (isAdminPortalSessionActive()) return;
      if (!shouldRunBackgroundPoll()) return;
      void refreshStudentSessionIfPresent(supabase);
    };

    tick();
    const interval = window.setInterval(tick, REFRESH_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      // Interval handles token refresh — avoid extra refresh on every tab return.
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
