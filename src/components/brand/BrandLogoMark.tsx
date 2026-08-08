import { cn } from "@/lib/utils";

const SIZE_MAP = {
  xs: "size-8 p-0.5",
  sm: "size-10 p-1",
  md: "size-11 p-1",
  lg: "size-16 sm:size-20 p-1.5",
  xl: "size-24 p-2",
} as const;

export type BrandLogoMarkProps = {
  size?: keyof typeof SIZE_MAP;
  className?: string;
  showAccent?: boolean;
};

/** Rounded logo frame matching shield blue + orange accent from brand icon */
export function BrandLogoMark({
  size = "md",
  className,
  showAccent = true,
}: BrandLogoMarkProps) {
  return (
    <div className={cn("relative shrink-0", className)}>
      {showAccent ? (
        <span
          className="absolute -right-0.5 -top-0.5 z-10 size-2.5 rounded-full bg-[var(--brand-orange)] shadow-sm ring-2 ring-white sm:size-3"
          aria-hidden
        />
      ) : null}
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-full bg-white shadow-md",
          "ring-2 ring-[var(--brand-blue)]/25 ring-offset-1 ring-offset-white",
          SIZE_MAP[size]
        )}
      >
        <img
          src="/logo-icon.png"
          alt=""
          className="size-full object-contain"
          width={96}
          height={96}
          aria-hidden
        />
      </div>
    </div>
  );
}
