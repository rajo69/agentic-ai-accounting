"use client";

import { useId, useState } from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

/**
 * Brand mark (owner decision 2026-10-10): a disc split by a check-shaped gap. The stamp, seen up
 * close. Drawn on a 24-unit grid in `currentColor`; the gap is thicker at 20 px and below so the
 * two pieces still read in a browser tab.
 */

/** The gap enters at the left edge, turns inside the disc, exits top-right. Two pieces, never three. */
export const DISC_GAP = "M-1 10.5 L9 20 L25 3.5";

const gapWidth = (size: number) => (size <= 20 ? 4.4 : 3.4);

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export interface LogoProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

/** Static mark. */
export function Logo({ size = 20, className, ...props }: LogoProps) {
  const maskId = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("shrink-0", className)}
      {...props}
    >
      <mask id={maskId} maskUnits="userSpaceOnUse" x="-4" y="-4" width="32" height="32">
        <rect x="-4" y="-4" width="32" height="32" fill="white" />
        <path d={DISC_GAP} stroke="black" strokeWidth={gapWidth(size)} strokeLinejoin="miter" />
      </mask>
      <circle cx="12" cy="12" r="10" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  );
}

export interface AnimatedMarkProps {
  size?: number;
  className?: string;
  /** "mount": play once on mount and again on hover. "loop": replay every `every` ms (video). */
  mode?: "mount" | "loop";
  every?: number;
}

/**
 * The mark, in time. Beat 1 (0 to 300 ms): the disc lands, scale 0.6 to 1 with a fade.
 * Beat 2 (250 to 900 ms): the tick cuts through it, drawn as a gap in the mask.
 * Hover replays. Under reduced motion (MotionConfig) it renders complete and still.
 */
export function AnimatedMark({ size = 64, className, mode = "mount", every = 4000 }: AnimatedMarkProps) {
  const maskId = useId();
  const [run, setRun] = useState(0);
  return (
    <motion.span
      key={run}
      className={cn("inline-flex shrink-0 cursor-default", className)}
      style={{ width: size, height: size }}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3, ease: EASE }}
      onMouseEnter={() => setRun((r) => r + 1)}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="-4" y="-4" width="32" height="32">
          <rect x="-4" y="-4" width="32" height="32" fill="white" />
          <motion.path
            d={DISC_GAP}
            stroke="black"
            strokeWidth={gapWidth(size)}
            strokeLinejoin="miter"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.65, delay: 0.25, ease: EASE }}
            onAnimationComplete={() => {
              if (mode === "loop") window.setTimeout(() => setRun((r) => r + 1), every);
            }}
          />
        </mask>
        <circle cx="12" cy="12" r="10" fill="currentColor" mask={`url(#${maskId})`} />
      </svg>
    </motion.span>
  );
}

/** "AI" in Instrument Serif italic, "Accountant" in Geist 600. Inherits colour from its parent. */
export function Wordmark({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("whitespace-nowrap font-sans text-[15px] font-semibold leading-none tracking-[-0.02em]", className)}
      {...props}
    >
      <span className="font-serif text-[19px] font-normal italic tracking-normal">AI</span> Accountant
    </span>
  );
}

export interface LockupProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: number;
  /** Use the animated mark (landing nav). */
  animated?: boolean;
}

/** Mark + wordmark, 8 px gap. Colour comes from `className` (defaults to foreground). */
export function Lockup({ size = 20, animated = false, className, ...props }: LockupProps) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-foreground", className)} {...props}>
      {animated ? <AnimatedMark size={size} /> : <Logo size={size} />}
      <Wordmark />
    </span>
  );
}
