import { useCurrentFrame } from "remotion";
import { toMs, W, H } from "../layout";
import { ms } from "../timing";
import { enterStyle, gbp, outExpo, seg } from "../timeline";
import { colors, fonts } from "../theme";
import { alpha, Chip } from "../kit/primitives";
import { Kinetic, KINETIC_ACCENT } from "../kit/kinetic";
import { poseStyle, Stage } from "../kit/depth";
import { Mono, sectionOpacity } from "./text";
import { beatWords } from "../words";

/**
 * The problem, in the reference's grammar. Beat one: a ledger Xero's AI has coded stands tilted in
 * space on the left, a green tick landing on each row, while the spoken words pop in on the right and
 * "evidence" takes the serif accent. Beat two: the words continue, a hundred ticks fill the canvas
 * behind them and three turn red; then a single large numeral counts "90%" and flips to "99%" on the
 * words that say so, with the bar beneath it, the reference's score count-up.
 *
 * problem1 words: 0 Sign 1 off 2 a 3 client's 4 quarter 5 and 6 you 7 are 8 reviewing 9 a 10 model's
 * 11 work. 12 A 13 green 14 tick 15 is 16 not 17 evidence.
 * problem2 words: 0 Finding 1 the 2 three 3 wrong 4 lines 5 in 6 a 7 hundred 8 costs 9 the 10 same
 * 11 whether 12 the 13 books 14 are 15 ninety 16 percent 17 right, 18 or 19 ninety-nine.
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

function Tick({ size = 14, stroke = 3 }: { size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5 L10 17.5 L19 7" />
    </svg>
  );
}

export function Problem() {
  const frame = useCurrentFrame();
  const t = toMs(frame);
  const p1 = ms("problem1");
  const w1 = beatWords("problem1");
  const w2 = beatWords("problem2");
  const out = ms("product") - 350;
  const opacity = sectionOpacity(t, p1 - 300, out);

  // Beat one geometry: the ledger card enters 300 ms before the voice and leaves as beat two's grid arrives.
  const ledgerIn = p1 - 300;
  const gridAt = w2[5].start - 200; // "in a hundred"
  const wrongAt = w2[3].start; // "wrong" (the grid is not up yet: they turn red as soon as it fills)
  const ledgerOut = seg(t, w2[0].start - 350, 300, (p) => p);
  const tickPulse = seg(t, w1[13].start, 500); // "green"
  const pose = poseStyle({ rx: 22, ry: -22, rz: 2, scale: 0.96, z: -320, blur: 10, opacity: 0 }, { rx: 12, ry: -16, rz: 1.5, scale: 1.12, blur: 0, opacity: 1 }, seg(t, ledgerIn, 900));

  // Beat two: numerals.
  const nineties = w2[15].start; // "ninety"
  const ninetyNine = w2[19].start; // "ninety-nine."
  const numeralIn = seg(t, nineties - 150, 500);
  const value = t < ninetyNine ? Math.round(90 * seg(t, nineties - 150, 700)) : 90 + Math.round(9 * seg(t, ninetyNine, 500));
  const bar = t < ninetyNine ? 0.9 * seg(t, nineties - 150, 800) : 0.9 + 0.09 * seg(t, ninetyNine, 500);
  const numeralsOut = 1 - seg(t, out - 400, 400, (p) => p);

  return (
    <div style={{ position: "absolute", inset: 0, opacity }}>
      {/* Beat one: the AI-coded ledger, tilted in space */}
      <Stage style={{ opacity: 1 - ledgerOut }}>
        <div
          style={{
            position: "absolute",
            left: 170,
            top: 230,
            width: 740,
            padding: "22px 26px 10px",
            borderRadius: 12,
            background: colors.surface,
            boxShadow: `0 0 0 1px ${colors.border}, inset 0 1px 0 0 ${alpha("#ffffff", 0.05)}, 0 50px 120px -30px rgba(0,0,0,0.9)`,
            ...pose,
          }}
        >
          <div style={{ fontFamily: fonts.mono, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.subtleForeground, marginBottom: 14 }}>
            Bank transactions · coded by Xero's AI
          </div>
          {LEDGER.map((row, i) => {
            const land = seg(t, p1 + 250 + i * 420, 400);
            return (
              <div
                key={row.desc}
                style={{
                  display: "grid",
                  gridTemplateColumns: "70px 1fr 120px 30px",
                  alignItems: "center",
                  gap: 14,
                  height: 58,
                  borderTop: `1px solid ${colors.border}`,
                  fontSize: 17,
                  color: colors.foreground,
                  ...enterStyle(seg(t, ledgerIn + 150 + i * 70, 500), 8),
                }}
              >
                <span style={{ fontFamily: fonts.mono, fontSize: 14, color: colors.mutedForeground }}>{row.d}</span>
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{row.desc}</span>
                  <span style={{ fontSize: 13, color: colors.mutedForeground }}>{row.cat}</span>
                </span>
                <span style={{ fontFamily: fonts.mono, fontSize: 15, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{gbp(row.amount)}</span>
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: alpha(colors.success, 0.12 + 0.12 * tickPulse),
                    color: colors.success,
                    transform: `scale(${(land * (1 + 0.18 * Math.sin(Math.PI * tickPulse))).toFixed(3)})`,
                    opacity: land,
                  }}
                >
                  <Tick size={13} />
                </span>
              </div>
            );
          })}
        </div>
      </Stage>
      <Kinetic
        t={t}
        beat="problem1"
        size={86}
        cx={1340}
        cy={H / 2 - 20}
        phrases={[
          { from: 0, to: 5 },
          { from: 5, to: 8 },
          { from: 8, to: 12 },
          { from: 12, to: 15, accent: [13] },
          { from: 15, to: 18, accent: [17], hold: 500 },
        ]}
      />

      {/* Beat two: a hundred ticks behind the words, three wrong */}
      <div style={{ position: "absolute", left: 0, top: 660, width: W, display: "flex", justifyContent: "center", opacity: seg(t, gridAt, 300, (p) => p) * numeralsOut }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(20, 44px)", gap: 12, opacity: 0.75 }}>
          {Array.from({ length: 100 }, (_, i) => {
            const wrong = WRONG.has(i) && t >= Math.max(wrongAt, gridAt + 100 + i * 9 + 350);
            const pin = seg(t, gridAt + 60 + i * 9, 350);
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
                  background: alpha(c, wrong ? 0.22 : 0.08),
                  color: c,
                  transform: `scale(${wrong ? 1.12 : pin})`,
                  opacity: wrong ? 1 : pin * 0.8,
                }}
              >
                {wrong ? (
                  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
                    <path d="M12 6v8M12 18h.01" />
                  </svg>
                ) : (
                  <Tick size={16} />
                )}
              </span>
            );
          })}
        </div>
      </div>
      <Kinetic
        t={t}
        beat="problem2"
        size={108}
        cx={W / 2}
        cy={400}
        phrases={[
          { from: 0, to: 5, accent: [2, 3] },
          { from: 5, to: 8, accent: [7] },
          { from: 8, to: 11 },
          { from: 11, to: 15, hold: 0 },
        ]}
      />

      {/* The score count-up: 90% then 99% */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 210, display: "flex", flexDirection: "column", alignItems: "center", opacity: numeralIn * numeralsOut }}>
        <div style={{ fontFamily: fonts.mono, fontSize: 16, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.subtleForeground, marginBottom: 18 }}>Books coded right</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, fontFamily: fonts.mono, fontVariantNumeric: "tabular-nums", color: colors.foreground, transform: `scale(${(1.15 - 0.15 * numeralIn).toFixed(3)})` }}>
          <span style={{ fontSize: 240, lineHeight: 1, letterSpacing: "-0.04em" }}>{value}</span>
          <span style={{ fontSize: 96, color: colors.mutedForeground }}>%</span>
        </div>
        <div style={{ marginTop: 26, width: 760, height: 10, borderRadius: 5, background: colors.surface2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(bar * 100).toFixed(2)}%`, borderRadius: 5, background: `linear-gradient(90deg, ${colors.primary}, ${KINETIC_ACCENT})` }} />
        </div>
        <div style={{ marginTop: 22, fontFamily: fonts.sans, fontSize: 30, color: colors.mutedForeground, letterSpacing: "-0.01em", ...enterStyle(seg(t, ninetyNine + 150, 450), 8) }}>
          Three wrong lines in a hundred. The same work to find them.
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 86, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, opacity: numeralsOut }}>
        <div style={enterStyle(seg(t, w2[8].start, 500, outExpo), 6)}>
          <Chip tone="info" dot={false} style={{ height: 28, fontSize: 14, padding: "0 10px" }}>
            Making Tax Digital for Income Tax
          </Chip>
        </div>
        <Mono p={seg(t, w2[8].start + 150, 500)} style={{ fontSize: 16 }}>
          Quarterly updates to HMRC since 6 April 2026 for sole traders and landlords over GBP 50,000.
        </Mono>
      </div>
    </div>
  );
}
