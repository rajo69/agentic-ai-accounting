"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Renders children at a fixed design size and scales them to the container's width, so the
 * product scenes keep one layout at every viewport (the Linear/Attio screenshot pattern).
 * The outer box reserves the right aspect ratio from the first paint, so nothing shifts when
 * the scale is measured.
 */
export function ScaledFrame({
  designWidth,
  designHeight,
  maxScale = 1,
  className,
  innerClassName,
  children,
}: {
  designWidth: number;
  designHeight: number;
  maxScale?: number;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setScale(Math.min(maxScale, el.clientWidth / designWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [designWidth, maxScale]);

  return (
    <div ref={ref} className={cn("relative w-full overflow-hidden", className)} style={{ aspectRatio: `${designWidth} / ${designHeight}` }}>
      <div
        className={cn("absolute left-0 top-0 origin-top-left", innerClassName)}
        style={{ width: designWidth, height: designHeight, transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}
