"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

import { finalT } from "./timeline";

/**
 * A looping millisecond clock for a scene. Advances with requestAnimationFrame while `running`
 * (not hovered, in view), holds its value while paused, and wraps at `duration`. Under the OS
 * reduced-motion setting it returns the scene's final instant and never ticks.
 * Time is wall-clock, sampled on animation frames and throttled to about 40 updates per second.
 */
export function useSceneClock(duration: number, running: boolean) {
  const prefersReduced = useReducedMotion();
  // Honoured after mount only, so the server and first client render agree (no hydration mismatch).
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(Boolean(prefersReduced)), [prefersReduced]);
  const [t, setT] = useState(0);
  const acc = useRef(0);

  useEffect(() => {
    if (reduced || !running) return;
    // Wall-clock time from the moment the loop resumed, so a slow frame rate never slows the scene.
    let raf = 0;
    const base = acc.current;
    const started = performance.now();
    let lastSet = 0;
    const tick = (now: number) => {
      acc.current = (base + (now - started)) % duration;
      if (now - lastSet >= 25) {
        lastSet = now;
        setT(acc.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, running, duration]);

  return reduced ? finalT(duration) : t;
}
