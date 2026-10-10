import { useCurrentFrame } from "remotion";
import { toMs, MARGIN_X } from "../layout";
import { BEATS, ms } from "../timing";
import { enterStyle, seg } from "../timeline";
import { colors, fonts } from "../theme";
import { Headline, sectionOpacity } from "./text";

/**
 * Three things that needed judgement (README engineering record, items 1, 2 and 9), one row per beat.
 * Rows, not cards: a mono index, the problem, and one line on how it was resolved.
 */
const ROWS = [
  {
    title: "Xero changed its OAuth scope scheme mid-build.",
    detail: "Apps created after 2 March 2026 need granular scopes; the broad ones returned unauthorized_client. Found the working names against the token endpoint, then caught a silent regression by cross-checking git history with Xero's scope table.",
  },
  {
    title: "A CORS fix took production down in a loop.",
    detail: "Every fetch from Vercel threw a TypeError with no HTTP status; the dashboard read it as \"Xero not connected\" while OAuth kept working. Diagnosed by telling a browser-level CORS failure from a 401.",
  },
  {
    title: "A six-lens review of my own code found what green tests could not.",
    detail: "106 findings, 14 high: an explainer that never ran for three or more classes, one session shared by five concurrent tasks, VAT arithmetic wrong by construction. Published in the README, not patched quietly.",
  },
];

export function Judgement() {
  const frame = useCurrentFrame();
  const t = toMs(frame);
  const j1 = ms("judgement1");
  const j2 = ms("judgement2");
  const j3 = ms("judgement3");
  const out = ms("honest") - 350;
  const opacity = sectionOpacity(t, j1 - 300, out);
  const rowAt = [j1 + BEATS.judgement1.durationMs * 0.4, j2 + 150, j3 + 200];
  return (
    <div style={{ position: "absolute", inset: 0, opacity }}>
      <div style={{ position: "absolute", left: MARGIN_X, top: 120, width: 1520 }}>
        <Headline size={68} p={seg(t, j1 - 200, 700)}>
          Three things that needed judgement.
        </Headline>
        <div style={{ marginTop: 56, display: "flex", flexDirection: "column" }}>
          {ROWS.map((row, i) => (
            <div
              key={row.title}
              style={{
                display: "grid",
                gridTemplateColumns: "64px 1fr",
                gap: 24,
                padding: "28px 0",
                borderTop: `1px solid ${colors.border}`,
                ...enterStyle(seg(t, rowAt[i], 600), 10),
              }}
            >
              <span style={{ fontFamily: fonts.mono, fontSize: 18, color: colors.subtleForeground, paddingTop: 6 }}>{String(i + 1).padStart(2, "0")}</span>
              <div>
                <div style={{ fontFamily: fonts.sans, fontSize: 34, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.2, color: colors.foreground }}>{row.title}</div>
                <div style={{ marginTop: 10, fontFamily: fonts.sans, fontSize: 21, lineHeight: 1.45, color: colors.mutedForeground, maxWidth: 1300, ...enterStyle(seg(t, rowAt[i] + 250, 600), 6) }}>{row.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
