import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { BrandLoadingSpinner } from "@/components/BrandLoadingSpinner";

type GlobalLoadingOverlayProps = {
  visible: boolean;
  message: string;
};

export function GlobalLoadingOverlay({ visible, message }: GlobalLoadingOverlayProps) {
  if (!visible || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[9999] flex items-center justify-center px-6",
        "bg-slate-950/35 backdrop-blur-[2px]",
        "transition-opacity duration-300",
        visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      )}
      aria-hidden={!visible}
    >
      <div
        className={cn(
          "rounded-3xl border border-white/60 bg-white/90 px-10 py-12 shadow-2xl",
          "transition-all duration-300",
          visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        )}
      >
        <BrandLoadingSpinner message={message} size="lg" />
      </div>
    </div>,
    document.body
  );
}
