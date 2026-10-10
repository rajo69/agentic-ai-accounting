import { useCurrentFrame } from "remotion";
import { toMs, MARGIN_X } from "../layout";
import { BEATS, ms } from "../timing";
import { enterStyle, seg } from "../timeline";
import { colors, fonts } from "../theme";
import { Chip } from "../kit/primitives";
import { Headline, sectionOpacity } from "./text";

/** The honesty line (RULES.md section 4): three facts, each landing on its sentence. */
const LINES = [
  { chip: "Live", tone: "success" as const, text: "The pipeline runs on a connected Xero organisation with real Claude calls." },
  { chip: "Demo", tone: "info" as const, text: "A synthetic company with pre-written reasoning and simulated jobs. No account needed." },
  { chip: "Not published", tone: "warning" as const, text: "No accuracy or time-saved figure until a reproducible evaluation is committed with provenance." },
];

export function Honest() {
  const frame = useCurrentFrame();
  const t = toMs(frame);
  const h = ms("honest");
  const d = BEATS.honest.durationMs;
  const out = ms("close") - 400;
  const opacity = sectionOpacity(t, h - 300, out);
  // Sentence shares by word count: 9 / 4 / 10 words.
  const at = [h + 150, h + d * 0.41, h + d * 0.58];
  return (
    <div style={{ position: "absolute", inset: 0, opacity }}>
      <div style={{ position: "absolute", left: MARGIN_X, top: 150, width: 1520 }}>
        <Headline size={68} p={seg(t, h - 200, 700)}>
          What is real.
        </Headline>
        <div style={{ marginTop: 64, display: "flex", flexDirection: "column", gap: 36 }}>
          {LINES.map((line, i) => (
            <div key={line.chip} style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 28, alignItems: "baseline", ...enterStyle(seg(t, at[i], 600), 10) }}>
              <Chip tone={line.tone} style={{ height: 32, fontSize: 16, padding: "0 12px" }}>
                {line.chip}
              </Chip>
              <div style={{ fontFamily: fonts.sans, fontSize: 32, lineHeight: 1.35, letterSpacing: "-0.015em", color: colors.foreground, maxWidth: 1250 }}>{line.text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
