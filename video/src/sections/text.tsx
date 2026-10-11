import type { CSSProperties, ReactNode } from "react";
import { auroraStops, colors, fonts } from "../theme";
import { enterStyle, seg } from "../timeline";

/** Serif headline: sentence case, left-aligned, ends with a full stop (DESIGN.md section 4). */
export function Headline({ children, size = 72, style, p = 1 }: { children: ReactNode; size?: number; style?: CSSProperties; p?: number }) {
  return (
    <div
      style={{
        fontFamily: fonts.serif,
        fontSize: size,
        lineHeight: 1.05,
        letterSpacing: "-0.01em",
        color: colors.foreground,
        ...enterStyle(p, 12),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** The one gradient in the film: "evidence", italic, in the aurora's stops, drifting with the frame. */
export function Evidence({ t }: { t: number }) {
  const pos = ((t / 1000) * 14 * 2) % 100;
  return (
    <span
      style={{
        fontStyle: "italic",
        backgroundImage: `linear-gradient(135deg, ${[...auroraStops, auroraStops[0]].join(", ")})`,
        backgroundSize: "300% 300%",
        backgroundPosition: `${pos.toFixed(2)}% 50%`,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        paddingRight: "0.08em",
        marginRight: "-0.08em",
      }}
    >
      evidence
    </span>
  );
}

export function Lead({ children, p = 1, style }: { children: ReactNode; p?: number; style?: CSSProperties }) {
  return (
    <div style={{ fontFamily: fonts.sans, fontSize: 26, lineHeight: 1.5, color: colors.mutedForeground, maxWidth: 820, ...enterStyle(p, 10), ...style }}>{children}</div>
  );
}

export function Mono({ children, p = 1, style, color = colors.mutedForeground }: { children: ReactNode; p?: number; style?: CSSProperties; color?: string }) {
  return <div style={{ fontFamily: fonts.mono, fontSize: 18, lineHeight: 1.5, color, ...enterStyle(p, 6), ...style }}>{children}</div>;
}

/** Whole-section fade: in over 400 ms at `inAt`, out over 400 ms ending at `outAt`. */
export function sectionOpacity(t: number, inAt: number, outAt: number) {
  const i = seg(t, inAt, 400, (p) => p);
  const o = 1 - seg(t, outAt - 400, 400, (p) => p);
  return Math.min(i, o);
}
