import { useCurrentFrame } from "remotion";
import { toMs, MARGIN_X, W, H } from "../layout";
import { ms } from "../timing";
import { seg } from "../timeline";
import { Aurora } from "../kit/aurora";
import { Mark, Wordmark } from "../kit/brand";
import { Kinetic } from "../kit/kinetic";
import { Mono, sectionOpacity } from "./text";
import { colors } from "../theme";

/**
 * The hook, in the reference's grammar: the aurora, a small lockup top-left (the reference keeps its
 * studio mark there), then the spoken words themselves as kinetic type in the centre of the frame, one
 * to four at a time, each landing on its own syllable. "AI" and "yours" carry the serif accent. The
 * brand headline moves to the close, where the ask is.
 *
 * Words: 0 Xero's 1 AI 2 now 3 codes 4 the 5 books. 6 The 7 errors 8 are 9 still 10 yours 11 to 12 find.
 */
export function Title() {
  const frame = useCurrentFrame();
  const t = toMs(frame);
  const start = 200;
  const out = ms("problem1") - 300;
  const opacity = sectionOpacity(t, 0, out);
  return (
    <div style={{ position: "absolute", inset: 0, opacity }}>
      <Aurora frame={frame} opacity={seg(t, 0, 900, (p) => p)} />
      <div style={{ position: "absolute", left: MARGIN_X, top: 64, display: "flex", alignItems: "center", gap: 14, color: colors.foreground }}>
        <Mark size={40} t={t} start={start} id="title-mark" />
        <div style={{ opacity: seg(t, start + 350, 500) }}>
          <Wordmark size={24} />
        </div>
      </div>
      <Kinetic
        t={t}
        beat="hook"
        size={124}
        cx={W / 2}
        cy={H / 2 - 20}
        phrases={[
          { from: 0, to: 2, accent: [1] },
          { from: 2, to: 6 },
          { from: 6, to: 10 },
          { from: 10, to: 13, accent: [10], hold: 900 },
        ]}
      />
      <div style={{ position: "absolute", left: 0, right: 0, top: H - 150, display: "flex", justifyContent: "center" }}>
        <Mono p={seg(t, ms("hook") + 2600, 600)} style={{ fontSize: 16, letterSpacing: "0.06em", textTransform: "uppercase", color: colors.subtleForeground }}>
          The review layer for Xero books that AI already coded · live October 2026
        </Mono>
      </div>
    </div>
  );
}
