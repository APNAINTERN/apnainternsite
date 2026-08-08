import { useEffect } from "react";
import { useGlobalLoading } from "@/contexts/GlobalLoadingContext";
import { loadingMessage } from "@/lib/loadingMessages";

/** Shows the global loader while `active` is true. */
export function useGlobalLoadingEffect(
  active: boolean,
  message: string = loadingMessage("default")
) {
  const { register } = useGlobalLoading();

  useEffect(() => {
    if (!active) return;
    return register(message);
  }, [active, message, register]);
}
