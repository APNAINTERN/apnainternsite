import { cn } from "@/lib/utils";
import { loadingMessage } from "@/lib/loadingMessages";

type BrandLoadingSpinnerProps = {
  message?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  fullScreen?: boolean;
};

const SIZE_RING = {
  sm: "size-16",
  md: "size-24 sm:size-28",
  lg: "size-28 sm:size-32",
} as const;

const SIZE_LOGO = {
  sm: "size-10",
  md: "size-14 sm:size-16",
  lg: "size-16 sm:size-20",
} as const;

export function BrandLoadingSpinner({
  message = loadingMessage("default"),
  className,
  size = "md",
  fullScreen = false,
}: BrandLoadingSpinnerProps) {
  const content = (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-5 text-center animate-fade-in",
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className={cn("relative", SIZE_RING[size])}>
        <div
          className="absolute inset-0 rounded-full border-[3px] border-primary/15"
          aria-hidden
        />
        <div
          className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-[var(--brand-blue)] border-r-[var(--brand-orange)] animate-brand-spin"
          aria-hidden
        />
        <div className="absolute inset-[18%] flex items-center justify-center rounded-full bg-white shadow-md ring-2 ring-primary/10">
          <img
            src="/logo-icon.png"
            alt=""
            className={cn("object-contain animate-brand-logo-spin", SIZE_LOGO[size])}
            width={80}
            height={80}
            aria-hidden
          />
        </div>
      </div>
      <p className="max-w-xs text-sm font-semibold tracking-wide text-slate-600 animate-pulse">
        {message}
      </p>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50/95 px-6">
        {content}
      </div>
    );
  }

  return content;
}
