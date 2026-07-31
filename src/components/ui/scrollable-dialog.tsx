import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

/** Fixed-height dialog shell — header/footer stay put; body scrolls inside. */
export const scrollableDialogShellClass =
  "flex flex-col overflow-hidden p-0 gap-0 h-[min(85vh,720px)] max-h-[90vh]";

export function ScrollableDialogBody({
  children,
  className,
  innerClassName,
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  return (
    <ScrollArea className={cn("flex-1 min-h-0", className)}>
      <div className={cn("p-6", innerClassName)}>{children}</div>
      <ScrollBar orientation="vertical" />
    </ScrollArea>
  );
}
