import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isPortalAppPath, shouldFireThrottled } from "@/lib/apiPollingGuard";

/** Min gap between site_visits rows for the same path (same browser session). */
const VISIT_THROTTLE_MS = 30 * 60 * 1000;

export const VisitorTracker = () => {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    if (isPortalAppPath(path)) return;

    const throttleKey = `site_visit:${path}`;
    if (!shouldFireThrottled(throttleKey, VISIT_THROTTLE_MS)) return;

    void (async () => {
      try {
        let visitorId = localStorage.getItem("ezy_visitor_id");
        if (!visitorId) {
          visitorId = crypto.randomUUID();
          localStorage.setItem("ezy_visitor_id", visitorId);
        }

        await supabase.from("site_visits").insert({
          visitor_id: visitorId,
          page_path: path,
          referrer: document.referrer,
          user_agent: navigator.userAgent,
        });
      } catch (err) {
        console.error("Tracking error:", err);
      }
    })();
  }, [location.pathname]);

  return null;
};
