import type { CSSProperties } from "react";

/**
 * Ported from `frontend/src/components/landing/scenes/timeline.ts`: every visual state is a pure
 * function of a clock `t` in milliseconds. In the video `t` is derived from `useCurrentFrame()`,
 * so a scene renders identically in the studio, in the render and on the landing page.
 */

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const linear = (p: number) => clamp01(p);
export const outExpo = (p: number) => (p >= 1 ? 1 : p <= 0 ? 0 : 1 - Math.pow(2, -10 * p));
export const outQuart = (p: number) => 1 - Math.pow(1 - clamp01(p), 4);
export const inOutQuart = (p: number) => {
  const x = clamp01(p);
  return x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2;
};

/** Progress 0 to 1 of a segment that starts at `start` and lasts `duration` (ms). */
export function seg(t: number, start: number, duration: number, ease: (p: number) => number = outExpo) {
  return ease(clamp01((t - start) / duration));
}

/** Entrance: opacity 0 to 1, translateY `dy` to 0. */
export function enterStyle(p: number, dy = 8): CSSProperties {
  return { opacity: p, transform: `translateY(${((1 - p) * dy).toFixed(2)}px)` };
}

/** A 200 ms press at `at`: scale 0.98 with a touch of brightness, as the real button's active state. */
export function pressStyle(t: number, at: number): CSSProperties {
  const pressed = t >= at && t < at + 200;
  return pressed ? { transform: "scale(0.98)", filter: "brightness(1.12)" } : {};
}

const gbpFormat = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Amounts: thousands separators, two decimals, a true minus sign for spend. */
export function gbp(n: number) {
  const abs = gbpFormat.format(Math.abs(n));
  return n < 0 ? `−${abs}` : abs;
}

/** Integer count-up for percentages. */
export function pct(value: number, p: number) {
  return Math.round(value * 100 * p);
}

/** Opacity dip for a content swap centred on `at`: 1 → 0 → 1 across `width` ms (120 ms by default). */
export function swapDip(t: number, at: number, width = 120) {
  const d = Math.abs(t - at);
  return d >= width / 2 ? 1 : d / (width / 2);
}
