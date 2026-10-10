import { useCurrentFrame } from "remotion";
import { toMs, MARGIN_X } from "../layout";
import { BEATS, ms } from "../timing";
import { enterStyle, seg } from "../timeline";
import { colors, fonts } from "../theme";
import { Aurora } from "../kit/aurora";
import { Mark, Wordmark } from "../kit/brand";
import { Evidence, Headline } from "./text";

/** The ask: demo, code, and the owner. The aurora returns; the mark replays. */
export function Close() {
  const frame = useCurrentFrame();
  const t = toMs(frame);
  const c = ms("close");
  const d = BEATS.close.durationMs;
  if (t < c - 700) return null;
  const start = c - 500;
  // Sentence shares by word count: 6 / 6 / 9.
  const at = [c + 100, c + d * 0.3, c + d * 0.58];
  const lines = [
    { label: "Demo", value: "agentic-ai-accounting.vercel.app/demo", note: "synthetic company · no account" },
    { label: "Code", value: "github.com/rajo69/agentic-ai-accounting", note: "MIT · README written for hiring managers" },
    { label: "Built by", value: "Rajarshi Nandi", note: "open to AI engineering roles · linkedin.com/in/rajarshi-nandi" },
  ];
  return (
    <div style={{ position: "absolute", inset: 0, opacity: seg(t, start, 500, (p) => p) }}>
      <Aurora frame={frame} opacity={seg(t, start, 900, (p) => p)} />
      <div style={{ position: "absolute", left: MARGIN_X, top: 190 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, color: colors.foreground }}>
          <Mark size={56} t={t} start={start + 200} id="close-mark" />
          <div style={{ opacity: seg(t, start + 550, 500) }}>
            <Wordmark size={34} />
          </div>
        </div>
        <Headline size={64} p={seg(t, start + 700, 700)} style={{ marginTop: 44, maxWidth: 1400 }}>
          Every AI-coded transaction, reviewed with <Evidence t={t} />.
        </Headline>
        <div style={{ marginTop: 72, display: "flex", flexDirection: "column", gap: 30 }}>
          {lines.map((line, i) => (
            <div key={line.label} style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 24, alignItems: "baseline", ...enterStyle(seg(t, at[i], 600), 10) }}>
              <span style={{ fontFamily: fonts.mono, fontSize: 15, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.subtleForeground }}>{line.label}</span>
              <div>
                <div style={{ fontFamily: fonts.sans, fontSize: 40, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.2, color: colors.foreground }}>{line.value}</div>
                <div style={{ marginTop: 6, fontFamily: fonts.mono, fontSize: 18, color: colors.mutedForeground }}>{line.note}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
