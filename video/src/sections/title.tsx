import { useCurrentFrame } from "remotion";
import { toMs, MARGIN_X } from "../layout";
import { ms } from "../timing";
import { seg } from "../timeline";
import { Aurora } from "../kit/aurora";
import { Mark, Wordmark } from "../kit/brand";
import { Evidence, Headline, Mono, sectionOpacity } from "./text";
import { colors } from "../theme";

/**
 * 0 to ~6 s: the aurora, the mark landing and cutting, the wordmark, then the headline. The voice
 * ("Xero's AI now codes the books...") starts 1.2 s in, once the mark has landed.
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
      <div style={{ position: "absolute", left: MARGIN_X, top: 300 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, color: colors.foreground }}>
          <Mark size={56} t={t} start={start} id="title-mark" />
          <div style={{ opacity: seg(t, start + 350, 500) }}>
            <Wordmark size={34} />
          </div>
        </div>
        <Headline size={92} p={seg(t, start + 900, 700)} style={{ marginTop: 56, maxWidth: 1400 }}>
          Every AI-coded transaction,
        </Headline>
        <Headline size={92} p={seg(t, start + 1050, 700)}>
          reviewed with <Evidence t={t} />.
        </Headline>
        <Mono p={seg(t, start + 1700, 600)} style={{ marginTop: 40 }}>
          The review layer for Xero books that AI already coded · live October 2026
        </Mono>
      </div>
    </div>
  );
}
