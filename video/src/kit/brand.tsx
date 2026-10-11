import { colors, fonts } from "../theme";
import { outExpo, seg } from "../timeline";

/** The mark's gap path from `components/brand/logo.tsx`: enters at the left edge, turns, exits top-right. */
const DISC_GAP = "M-1 10.5 L9 20 L25 3.5";

/**
 * The animated mark, in time (DESIGN.md section 7). `t` is ms since `start`: the disc lands
 * (scale 0.6 to 1, 0 to 300 ms) and the tick cuts through it (250 to 900 ms), both out-expo.
 */
export function Mark({ size = 64, t, start = 0, color = colors.foreground, id = "mark" }: { size?: number; t: number; start?: number; color?: string; id?: string }) {
  const land = seg(t, start, 300);
  const cut = seg(t, start + 250, 650, outExpo);
  const gap = size <= 20 ? 4.4 : 3.4;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ transform: `scale(${0.6 + 0.4 * land})`, opacity: land, transformOrigin: "center", display: "block" }}
    >
      <mask id={id} maskUnits="userSpaceOnUse" x="-4" y="-4" width="32" height="32">
        <rect x="-4" y="-4" width="32" height="32" fill="white" />
        <path d={DISC_GAP} stroke="black" strokeWidth={gap} strokeLinejoin="miter" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - cut} />
      </mask>
      <circle cx="12" cy="12" r="10" fill={color} mask={`url(#${id})`} />
    </svg>
  );
}

/** "AI" in Instrument Serif italic, "Accountant" in Geist 600. */
export function Wordmark({ size = 15, color = colors.foreground }: { size?: number; color?: string }) {
  return (
    <span style={{ whiteSpace: "nowrap", fontFamily: fonts.sans, fontSize: size, fontWeight: 600, lineHeight: 1, letterSpacing: "-0.02em", color }}>
      <span style={{ fontFamily: fonts.serif, fontSize: size * (19 / 15), fontWeight: 400, fontStyle: "italic", letterSpacing: 0 }}>AI</span> Accountant
    </span>
  );
}

export function Lockup({ size = 20, t = 10_000, start = 0, color = colors.foreground, id = "lockup" }: { size?: number; t?: number; start?: number; color?: string; id?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: size * 0.4, color }}>
      <Mark size={size} t={t} start={start} color={color} id={id} />
      <Wordmark size={size * 0.75} color={color} />
    </span>
  );
}
