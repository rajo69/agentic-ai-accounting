"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useReducedMotion } from "framer-motion";

const Aurora = dynamic(() => import("@/components/aurora"), { ssr: false });

/**
 * The one effect on the page (DESIGN.md section 3): the aurora, unchanged, 680 px tall, fading
 * to the canvas over its last 224 px; a 32 px dot grid at 0.08 over the hero only. Hidden under
 * reduced motion, so the hero sits on the plain canvas.
 */
export function Backdrop() {
  const prefersReduced = useReducedMotion();
  // Decided after mount so the server and first client render match.
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(Boolean(prefersReduced)), [prefersReduced]);
  // The WebGL aurora mounts once hydration has settled, so the headline paints first on slow devices.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 1500 });
      return () => window.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setReady(true), 300);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[680px] bg-background">
      {!reduced && ready && (
        <div className="absolute inset-0 animate-in fade-in duration-1000">
          <Aurora
            colorStops={["#4338CA", "#7C3AED", "#0EA5E9"]}
            amplitude={1.1}
            blend={0.55}
            speed={0.45}
          />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-b from-transparent to-background" />
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: "radial-gradient(hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
        }}
      />
    </div>
  );
}
