import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AUTH_CALLBACK_PATH, AUTH_CONFIRM_PATH } from "@/lib/authPaths";
import {
  authConfirmPathWithTokens,
  escapeBlockedHostIfNeeded,
  hasAuthCallbackInUrl,
} from "@/lib/authRedirectGuard";

/**
 * Sends Supabase email-link tokens to /auth/confirm and escapes legacy Lovable preview hosts.
 */
export function AuthRedirectGuard() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (escapeBlockedHostIfNeeded()) return;

    if (location.pathname === AUTH_CONFIRM_PATH || location.pathname === AUTH_CALLBACK_PATH) {
      return;
    }

    if (hasAuthCallbackInUrl(location.search, location.hash)) {
      navigate(authConfirmPathWithTokens(location.search, location.hash), { replace: true });
    }
  }, [location.pathname, location.search, location.hash, navigate]);

  return null;
}
