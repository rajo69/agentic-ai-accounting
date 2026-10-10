import { useCurrentFrame } from "remotion";
import { toMs, MARGIN_X } from "../layout";
import { BEATS, ms } from "../timing";
import { enterStyle, gbp, seg } from "../timeline";
import { colors, fonts } from "../theme";
import { alpha, Chip } from "../kit/primitives";
import { Headline, Mono, sectionOpacity } from "./text";

/**
 * Problem, in two beats. Beat one: a ledger that Xero's AI has coded, every row with a green tick,
 * and the headline "A green tick is not evidence." Beat two: a hundred ticks, three of which turn
 * out to be wrong, and the reason the review now happens every quarter.
 */
const LEDGER = [
  { d: "14 Apr", desc: "ADOBE SYSTEMS INC", amount: -999, cat: "404 Computer Equipment & Software" },
  { d: "16 Apr", desc: "REGUS FLEET STREET", amount: -1200, cat: "401 Rent" },
  { d: "21 Apr", desc: "PREMIER INN MANCHESTER", amount: -85, cat: "493 Travel" },
  { d: "28 Apr", desc: "BARKER SCAFFOLD HIRE LTD", amount: -3450, cat: "416 General Expenses" },
  { d: "02 May", desc: "COSTA COFFEE CANARY WHARF", amount: -34.5, cat: "429 Entertainment" },
  { d: "09 May", desc: "HMRC PAYE", amount: -2500, cat: "820 Tax & Statutory" },
];

const WRONG = new Set([13, 47, 81]);

export function Problem() {
  const frame = useCurrentFrame();
  const t = toMs(frame);
  const p1 = ms("problem1");
  const p2 = ms("problem2");
  const d1 = BEATS.problem1.durationMs;
  const d2 = BEATS.problem2.durationMs;
  const out = ms("product") - 350;
  const opacity = sectionOpacity(t, p1 - 300, out);
  const headlineAt = p1 + d1 * 0.6;
  const gridAt = p2 - 150;
  const wrongAt = p2 + d2 * 0.1;
  const noteAt = p2 + d2 * 0.72;
  const ledgerOut = 1 - seg(t, gridAt - 200, 300, (p) => p);
  return (
    <div style={{ position: "absolute", inset: 0, opacity }}>
      {/* Beat one: the AI-coded ledger */}
      <div style={{ position: "absolute", left: MARGIN_X, top: 150, width: 700, opacity: ledgerOut }}>
        <div style={{ fontFamily: fonts.mono, fontSize: 14, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.subtleForeground, marginBottom: 20, ...enterStyle(seg(t, p1 - 100, 500), 6) }}>
          Bank transactions · coded by Xero's AI
        </div>
        {LEDGER.map((row, i) => (
          <div
            key={row.desc}
            style={{
              display: "grid",
              gridTemplateColumns: "80px 1fr 130px 32px",
              alignItems: "center",
              gap: 16,
              height: 60,
              borderTop: `1px solid ${colors.border}`,
              fontSize: 19,
              color: colors.foreground,
              ...enterStyle(seg(t, p1 + 100 + i * 130, 500), 8),
            }}
          >
            <span style={{ fontFamily: fonts.mono, fontSize: 16, color: colors.mutedForeground }}>{row.d}</span>
            <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{row.desc}</span>
              <span style={{ fontSize: 14, color: colors.mutedForeground }}>{row.cat}</span>
            </span>
            <span style={{ fontFamily: fonts.mono, fontSize: 17, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{gbp(row.amount)}</span>
            <span style={{ width: 28, height: 28, borderRadius: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", background: alpha(colors.success, 0.12), color: colors.success, transform: `scale(${seg(t, p1 + 400 + i * 130, 400)})` }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5 L10 17.5 L19 7" />
              </svg>
            </span>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 1000, top: 300, width: 760, opacity: ledgerOut }}>
        <Headline size={76} p={seg(t, headlineAt, 700)}>
          A green tick is not evidence.
        </Headline>
      </div>

      {/* Beat two: a hundred ticks, three wrong */}
      <div style={{ position: "absolute", left: MARGIN_X, top: 170, opacity: seg(t, gridAt, 300, (p) => p) }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 44px)", gap: 14 }}>
          {Array.from({ length: 100 }, (_, i) => {
            const wrong = WRONG.has(i) && t >= wrongAt + (i / 100) * 600;
            const pin = seg(t, gridAt + 60 + i * 14, 350);
            const c = wrong ? colors.danger : colors.success;
            return (
              <span
                key={i}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: alpha(c, wrong ? 0.18 : 0.1),
                  color: c,
                  transform: `scale(${wrong ? 1.08 : pin})`,
                  opacity: pin,
                }}
              >
                {wrong ? (
                  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
                    <path d="M12 6v8M12 18h.01" />
                  </svg>
                ) : (
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5 L10 17.5 L19 7" />
                  </svg>
                )}
              </span>
            );
          })}
        </div>
      </div>
      <div style={{ position: "absolute", left: 900, top: 250, width: 860, opacity: seg(t, gridAt, 300, (p) => p) }}>
        <Headline size={64} p={seg(t, gridAt + 300, 700)}>
          Three wrong lines in a hundred.
        </Headline>
        <Headline size={64} p={seg(t, wrongAt + 900, 700)} style={{ color: colors.mutedForeground }}>
          The same effort to find at 90% as at 99%.
        </Headline>
        <div style={{ marginTop: 44, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={enterStyle(seg(t, noteAt, 500), 6)}>
            <Chip tone="info" dot={false} style={{ height: 28, fontSize: 14, padding: "0 10px" }}>
              Making Tax Digital for Income Tax
            </Chip>
          </div>
          <Mono p={seg(t, noteAt + 150, 500)}>Quarterly updates to HMRC since 6 April 2026 for sole traders and landlords over GBP 50,000.</Mono>
        </div>
      </div>
    </div>
  );
}
