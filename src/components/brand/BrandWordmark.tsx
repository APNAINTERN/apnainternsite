import { cn } from "@/lib/utils";
import { BRAND_TAGLINE } from "@/lib/brand";

const SIZE_CLASS = {
  xs: "text-sm",
  sm: "text-base",
  md: "text-lg sm:text-xl",
  lg: "text-2xl sm:text-[1.65rem]",
  xl: "text-3xl sm:text-4xl",
} as const;

export type BrandWordmarkProps = {
  size?: keyof typeof SIZE_CLASS;
  /** default: blue+orange on light bg; light: for dark backgrounds; mono: single line compact */
  variant?: "default" | "light" | "mono";
  showTagline?: boolean;
  className?: string;
  taglineClassName?: string;
};

export function BrandWordmark({
  size = "md",
  variant = "default",
  showTagline = false,
  className,
  taglineClassName,
}: BrandWordmarkProps) {
  const apnaClass =
    variant === "light"
      ? "brand-wordmark-apna-light"
      : variant === "mono"
        ? "brand-wordmark-apna"
        : "brand-wordmark-apna";

  const internClass =
    variant === "light"
      ? "brand-wordmark-intern-light"
      : "brand-wordmark-intern";

  return (
    <div className={cn("leading-tight", className)}>
      <p
        className={cn(
          "font-display font-extrabold tracking-tight",
          SIZE_CLASS[size],
          variant === "mono" && "inline-flex flex-wrap items-baseline gap-0"
        )}
      >
        <span className={apnaClass}>Apna</span>
        <span className={internClass}> Intern</span>
      </p>
      {showTagline ? (
        <p
          className={cn(
            "mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400",
            variant === "light" && "text-slate-400/90",
            taglineClassName
          )}
        >
          {BRAND_TAGLINE}
        </p>
      ) : null}
    </div>
  );
}
