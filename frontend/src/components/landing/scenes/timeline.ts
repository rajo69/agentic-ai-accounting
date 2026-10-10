import type { CSSProperties } from "react";

/**
 * Scenes are pure functions of a clock `t` (milliseconds into the loop). Every visual state is
 * derived from `t`, so a scene can loop, pause, scrub and render its final state (reduced
 * motion, static crops) without any extra code paths.
 */

/** The last 350 ms of every loop fade the scene out before it restarts. */
export const OUTRO = 350;

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const linear = (p: number) => clamp01(p);
export const outExpo = (p: number) => (p >= 1 ? 1 : p <= 0 ? 0 : 1 - Math.pow(2, -10 * p));
export const outQuart = (p: number) => 1 - Math.pow(1 - clamp01(p), 4);

/** Progress 0 to 1 of a segment that starts at `start` and lasts `duration`. */
export function seg(t: number, start: number, duration: number, ease: (p: number) => number = outExpo) {
  return ease(clamp01((t - start) / duration));
}

/** Entrance: opacity 0 to 1, translateY `dy` to 0. */
export function enterStyle(p: number, dy = 8): CSSProperties {
  return { opacity: p, transform: `translateY(${((1 - p) * dy).toFixed(2)}px)` };
}

/** A 200 ms press at `at`: scale 0.98, matching the real button's active state. */
export function pressStyle(t: number, at: number): CSSProperties {
  const pressed = t >= at && t < at + 200;
  return { transform: pressed ? "scale(0.98)" : undefined, filter: pressed ? "brightness(1.1)" : undefined };
}

/** Whole-scene opacity during the outro. */
export function outroOpacity(t: number, duration: number) {
  const start = duration - OUTRO;
  return t > start ? 1 - linear((t - start) / (OUTRO - 50)) : 1;
}

/** The instant a scene reaches its final state (end of the hold, before the outro). */
export function finalT(duration: number) {
  return duration - OUTRO;
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
