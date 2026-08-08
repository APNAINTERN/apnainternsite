import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export type RegistrationProgressHeaderProps = {
  step: number;
  maxStep: number;
  stepLabels: readonly string[];
  loading?: boolean;
  showLogo?: boolean;
  title?: string;
  subtitle?: string;
  className?: string;
};

export function RegistrationProgressHeader({
  step,
  maxStep,
  stepLabels,
  loading = false,
  showLogo = true,
  title = "Student Registration",
  subtitle = "UGC-mandated internship programme",
  className,
}: RegistrationProgressHeaderProps) {
  const progress = Math.min(100, Math.round((step / Math.max(maxStep, 1)) * 100));

  return (
    <div className={cn("mb-6 space-y-4", className)}>
      {showLogo ? (
        <div className="flex flex-col items-center text-center gap-3">
          <div className="relative">
            <div
              className="absolute inset-0 rounded-full bg-primary/15 blur-md scale-110"
              aria-hidden
            />
            <div className="relative size-[4.5rem] sm:size-24 rounded-full border-[3px] border-white bg-white shadow-md overflow-hidden ring-2 ring-primary/25">
              <img
                src="/logo-icon.png"
                alt="Apna Intern"
                className="size-full object-cover"
                width={96}
                height={96}
              />
            </div>
          </div>
          <div className="space-y-0.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/80">
              Apna Intern
            </p>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">{title}</h2>
            {subtitle ? (
              <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto leading-snug">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-primary/10 bg-gradient-to-br from-primary/5 via-background to-background p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">
            Registration progress
          </p>
          <p className="text-[11px] sm:text-xs font-semibold text-muted-foreground tabular-nums">
            {loading ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden />
                Loading…
              </span>
            ) : (
              <>
                Step {step} of {maxStep}
                <span className="text-primary"> · {progress}%</span>
              </>
            )}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 rounded-lg bg-background/80 border border-dashed border-primary/20 px-3 py-3">
            <Loader2 className="size-5 animate-spin text-primary shrink-0" aria-hidden />
            <p className="text-sm text-muted-foreground">
              Preparing universities, colleges, and internship options…
            </p>
          </div>
        ) : (
          <>
            <Progress value={progress} className="h-2.5 bg-primary/10" />
            <div className="flex justify-between gap-0.5 sm:gap-1">
              {stepLabels.map((label, i) => {
                const stepNum = i + 1;
                const done = step > stepNum;
                const active = step === stepNum;
                return (
                  <div
                    key={label}
                    className={cn(
                      "flex min-w-0 flex-1 flex-col items-center gap-1 text-center",
                      active ? "text-primary" : done ? "text-primary/80" : "text-muted-foreground"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-5 sm:size-6 shrink-0 items-center justify-center rounded-full text-[9px] sm:text-[10px] font-bold transition-colors",
                        done
                          ? "bg-primary text-primary-foreground"
                          : active
                            ? "bg-primary/15 border-2 border-primary text-primary"
                            : "bg-muted text-muted-foreground"
                      )}
                      aria-hidden
                    >
                      {done ? "✓" : stepNum}
                    </span>
                    <span
                      className={cn(
                        "hidden sm:block text-[9px] leading-tight line-clamp-2",
                        active && "font-semibold"
                      )}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
