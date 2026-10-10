/**
 * Design tokens for the launch video, copied from `.claude/plan/DESIGN.md` section 3 (HSL triplets) and
 * `frontend/src/app/globals.css`. Same colours as the landing page and the console, so the video and the product
 * cannot drift apart. Values are hex equivalents of the HSL tokens.
 */
export const colors = {
  background: "#09090c", // 240 10% 4%
  surface: "#101014", // 240 8% 7%
  surface2: "#17171c", // 240 7% 10%
  border: "#26262e", // 240 6% 16%
  borderStrong: "#35353f", // 240 6% 22%
  foreground: "#ebebf0", // 240 8% 93%
  mutedForeground: "#92939d", // 240 5% 60%
  subtleForeground: "#66676f", // 240 5% 42%
  primary: "#5d4fe6", // 246 80% 63% (darkened in S2 for AA)
  success: "#33b37b", // 152 56% 45%
  warning: "#f3a71c", // 38 92% 55%
  danger: "#e05252", // 0 70% 60%
  info: "#0ea5e9", // 199 89% 48%
} as const;

/**
 * The aurora's own stops; the landing headline word "evidence" borrows them. The kinetic type's accent
 * (`kit/kinetic.tsx`, `#a594ff`) is the middle stop lifted to read on the dark canvas: the one place the
 * reference's coloured keyword enters this brand (recorded exception, S7 voice-and-video pass 2026-10-10).
 */
export const auroraStops = ["#4338CA", "#7C3AED", "#0EA5E9"] as const;

export const radius = { chip: 4, control: 6, card: 8, frame: 12 } as const;

/** Fonts: Geist (local woff in public/fonts), Geist Mono, Instrument Serif (Google, loaded by @remotion/google-fonts). */
export const fonts = {
  sans: "Geist, ui-sans-serif, system-ui, sans-serif",
  mono: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  serif: "'Instrument Serif', Georgia, serif",
} as const;

/** DESIGN.md section 6: out-expo for reveals, out-quart for UI state. Use with Remotion's `interpolate` easing. */
export const easeOutExpo = (t: number): number => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeOutQuart = (t: number): number => 1 - Math.pow(1 - t, 4);

/**
 * Frame rate of the render. The composition is clocked in milliseconds (`layout.ts` `toMs`), so this only sets
 * how finely motion is sampled: 30 for the S7 rough cuts, 60 for the final (S8 brief: 1920x1080, 60 fps, H.264).
 * The few constants kept in frames (`timing.ts`, `music.ts`, mirrored in `scripts/timing.py`) scale with it via `F`.
 */
export const fps = 60;
/** A count of frames at the 30 fps design rate, converted to this render's frames (leads and ramps keep their length). */
export const F = (framesAt30: number): number => Math.round((framesAt30 * fps) / 30);
/** Durations in frames (hover 150 ms, UI 200 ms, reveal 600 ms). */
export const frames = { hover: F(5), ui: F(6), reveal: F(18) } as const;

export const video = { width: 1920, height: 1080, fps } as const;
