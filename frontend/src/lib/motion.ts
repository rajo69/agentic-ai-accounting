import type { Transition, Variants } from "framer-motion";

/** DESIGN.md section 6. Reveals use out-expo; hovers and UI state use out-quart. */
export const easeOutExpo: [number, number, number, number] = [0.16, 1, 0.3, 1];
export const easeOutQuart: [number, number, number, number] = [0.25, 1, 0.5, 1];

export const durations = {
  hover: 0.15,
  ui: 0.2,
  reveal: 0.6,
} as const;

/** Section header or product frame entrance: opacity 0 to 1, y 12 to 0, 600 ms. */
export const reveal: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: durations.reveal, ease: easeOutExpo },
  },
};

/** Parent variants that stagger `reveal` children (default 50 ms). */
export const stagger = (delay = 0.05): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: delay } },
});

/** Viewport options for `whileInView`: trigger once at 20 percent in view. */
export const revealOnce = { once: true, amount: 0.2 } as const;

/** Small state changes (chips, toggles, drawers). */
export const uiTransition: Transition = { duration: durations.ui, ease: easeOutQuart };
