import { useEffect, useState } from "react";

export function useAnimatedCounter(
  target: number,
  active: boolean,
  durationMs = 2000
): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return;

    const frames = 60;
    const interval = durationMs / frames;
    let frame = 0;

    const timer = window.setInterval(() => {
      frame++;
      const progress = frame / frames;
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(eased * target));
      if (frame >= frames) {
        setValue(target);
        window.clearInterval(timer);
      }
    }, interval);

    return () => window.clearInterval(timer);
  }, [active, target, durationMs]);

  return value;
}
