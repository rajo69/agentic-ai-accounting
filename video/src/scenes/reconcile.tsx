import { colors, fonts } from "../theme";
import { enterStyle, gbp, pressStyle, seg } from "../timeline";
import { Btn, Card, Eyebrow, JobChip, MiniBar, StatusChip, Td, Th, toneForScore, Tr, type JobState } from "../kit/primitives";
import { SceneHeader } from "../kit/shell";
import { CANDIDATES, ORG, STATEMENT_LINES } from "./data";

/**
 * Two panes: statement lines on the left receive match statuses; the suggested line is opened and its
 * scored candidates fill in on the right; the reviewer confirms the best match.
 */
export interface ReconcileEvents {
  enter: number;
  press: number;
  resolveFrom: number;
  select: number;
  candidatesFrom: number;
  best: number;
  confirmPress: number;
}

export const LINE_STEP = 280;
const SELECTED_ID = "s1";

export const RECONCILE_LAYOUT = {
  reconcileButton: { x: 1200 - 24 - 44, y: 32 + 32 },
  lineY: (i: number) => 64 + 28 + i * 56,
  listLeft: 24,
  confirmButton: { x: 1200 - 24 - 60, y: 64 + 34 },
  candidatesCentre: { x: 24 + 360 + 24 + (1200 - 24 - 360 - 24 - 24) / 2, y: 64 + 150 },
};

export function ReconcileScene({ t, ev }: { t: number; ev: ReconcileEvents }) {
  const lastResolve = ev.resolveFrom + (STATEMENT_LINES.length - 1) * LINE_STEP + 400;
  const job: JobState = t < ev.press + 150 ? "idle" : t < lastResolve ? "running" : "completed";
  const selectedVisible = t >= ev.select;
  const confirmed = t >= ev.confirmPress + 300;
  const best = t >= ev.best;
  const line = STATEMENT_LINES.find((l) => l.id === SELECTED_ID)!;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <SceneHeader title="Reconciliation" meta={`${ORG.name} · ${ORG.period}`}>
        <JobChip t={t} state={job} label={job === "idle" ? "8 unmatched" : job === "running" ? "Matching 8" : "5 auto-matched · 2 to review"} />
        <Btn style={pressStyle(t, ev.press)}>Reconcile</Btn>
      </SceneHeader>
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24, padding: "0 24px 24px", minHeight: 0, flex: 1 }}>
        <Card style={{ overflow: "hidden", alignSelf: "start" }}>
          {STATEMENT_LINES.map((l, i) => {
            const pin = seg(t, ev.enter + 150 + i * 90, 500);
            const resolved = t >= ev.resolveFrom + i * LINE_STEP;
            const status = !resolved ? "unmatched" : l.id === SELECTED_ID && confirmed ? "confirmed" : l.status;
            const selected = l.id === SELECTED_ID && selectedVisible;
            return (
              <div
                key={l.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 4,
                  height: 56,
                  padding: "0 16px",
                  borderBottom: i === STATEMENT_LINES.length - 1 ? undefined : `1px solid ${colors.border}`,
                  background: selected ? colors.surface2 : "transparent",
                  boxShadow: selected ? `inset 2px 0 0 0 ${colors.primary}` : undefined,
                  ...enterStyle(pin),
                }}
              >
                <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: 500, color: colors.foreground }}>{l.description}</span>
                  <span style={{ flexShrink: 0, fontFamily: fonts.mono, fontSize: 13, color: colors.foreground, fontVariantNumeric: "tabular-nums" }}>{gbp(l.amount)}</span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.mutedForeground }}>{l.date} 2026</span>
                  <StatusChip status={status} />
                </span>
              </div>
            );
          })}
        </Card>

        <Card style={{ alignSelf: "start", minWidth: 0, ...enterStyle(seg(t, ev.select + 100, 400)) }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, borderBottom: `1px solid ${colors.border}`, padding: "16px 20px" }}>
            <div style={{ minWidth: 0 }}>
              <Eyebrow color={colors.mutedForeground}>Candidates</Eyebrow>
              <div style={{ marginTop: 6, fontSize: 14, color: colors.foreground, whiteSpace: "nowrap" }}>{line.description}</div>
              <div style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.mutedForeground }}>
                {line.date} 2026 · {gbp(line.amount)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <Btn variant="outline">Manual search</Btn>
              <Btn style={{ ...pressStyle(t, ev.confirmPress), opacity: confirmed ? 0.5 : 1 }}>Confirm match</Btn>
            </div>
          </div>
          <div style={{ padding: "0 8px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <Th>Record</Th>
                  <Th width={98} align="right">
                    Amount
                  </Th>
                  <Th width={62}>Amount</Th>
                  <Th width={62}>Date</Th>
                  <Th width={62}>Text</Th>
                  <Th width={96}>Combined</Th>
                </tr>
              </thead>
              <tbody>
                {CANDIDATES.map((c, i) => {
                  const pin = seg(t, ev.candidatesFrom + i * 250, 450);
                  const pb = seg(t, ev.candidatesFrom + i * 250 + 200, 700);
                  const isBest = i === 0 && best;
                  return (
                    <Tr key={c.id} selected={isBest} style={enterStyle(pin)}>
                      <Td style={{ height: 52 }}>
                        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
                          <span style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.foreground }}>{c.record}</span>
                          <span style={{ fontSize: 12, color: colors.mutedForeground }}>
                            {c.party} · {c.date}
                          </span>
                        </span>
                      </Td>
                      <Td align="right" mono>
                        {gbp(c.amount)}
                      </Td>
                      <Td>
                        <MiniBar value={c.scores.amount} tone={toneForScore(c.scores.amount)} p={pb} width={16} compact />
                      </Td>
                      <Td>
                        <MiniBar value={c.scores.date} tone={toneForScore(c.scores.date)} p={pb} width={16} compact />
                      </Td>
                      <Td>
                        <MiniBar value={c.scores.description} tone={toneForScore(c.scores.description)} p={pb} width={16} compact />
                      </Td>
                      <Td>
                        {isBest && confirmed ? (
                          <StatusChip status="confirmed" />
                        ) : (
                          <span style={{ fontFamily: fonts.mono, fontSize: 13, color: isBest ? colors.foreground : colors.mutedForeground, fontVariantNumeric: "tabular-nums" }}>
                            {(c.scores.combined * pb).toFixed(2)}
                          </span>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
