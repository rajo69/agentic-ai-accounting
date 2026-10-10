import { colors, fonts } from "../theme";
import { enterStyle, gbp, pressStyle, seg } from "../timeline";
import {
  alpha,
  Btn,
  CategoryLabel,
  CountingConfidence,
  Eyebrow,
  ExplanationSections,
  JobChip,
  StatusChip,
  Td,
  Th,
  Tr,
  type JobState,
} from "../kit/primitives";
import { SceneHeader } from "../kit/shell";
import { CATEGORISE_ROWS, ORG, SCAFFOLD_EXPLANATION } from "./data";

/**
 * The signature scene (DESIGN.md section 6) with every event keyed to the voice: rows settle in, the
 * Categorise job runs, each row receives its category, a confidence that counts up and a tier chip;
 * the row that needs review is selected and the drawer slides in; DECISION, REASONING and RISK arrive
 * on their own beats; the reviewer approves; the audit row appears in HISTORY.
 */
export interface CategoriseEvents {
  enter: number;
  press: number;
  resolveFrom: number;
  select: number;
  drawer: number;
  decisionAt: number;
  reasoningAt: number;
  riskAt: number;
  approvePress: number;
  historyAt: number;
}

export const REVIEWED_ID = "t4";
export const ROW_STEP = 360;

/** Layout constants used by the camera and cursor (design coordinates inside the content area). */
export const CATEGORISE_LAYOUT = {
  categoriseButton: { x: 1200 - 24 - 48, y: 32 + 32 },
  rowY: (i: number) => 64 + 36 + 22 + i * 44, // header 64, table header 36, row centre
  drawerLeft: 1200 - 480,
  approveButton: { x: 1200 - 480 + 24 + 36, y: 675 - 32 - 32 },
};

const HISTORY = [
  { kind: "ai" as const, title: "AI proposed 416 General Expenses", detail: "Sonnet 4.6 · escalated from Haiku 4.5 · confidence 0.62 · risk high", at: "28 Apr · 09:14" },
  { kind: "human" as const, title: "Approved by the reviewer", detail: "Recorded in the audit log · now a precedent", at: "10 Jul · 10:41" },
];

function HistoryRow({ item, p, last }: { item: (typeof HISTORY)[number]; p: number; last: boolean }) {
  const human = item.kind === "human";
  const c = human ? colors.success : colors.primary;
  return (
    <li style={{ position: "relative", display: "flex", gap: 12, paddingBottom: last ? 0 : 18, listStyle: "none", ...enterStyle(p) }}>
      {!last && <span style={{ position: "absolute", left: 11, top: 28, bottom: 0, width: 1, background: colors.border }} />}
      <span style={{ width: 24, height: 24, borderRadius: 12, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: alpha(c, 0.1), boxShadow: `inset 0 0 0 1px ${alpha(c, 0.2)}`, color: c }}>
        {human ? (
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 11l2 2 4-4M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" />
          </svg>
        ) : (
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 8V4H8M4 8h16v12H4zM2 14h2M20 14h2M15 13v2M9 13v2" />
          </svg>
        )}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, color: colors.foreground }}>{item.title}</div>
        <div style={{ fontSize: 12, color: colors.mutedForeground, lineHeight: "18px" }}>{item.detail}</div>
        <div style={{ marginTop: 2, fontFamily: fonts.mono, fontSize: 11, color: colors.mutedForeground }}>{item.at}</div>
      </div>
    </li>
  );
}

function Drawer({ t, ev }: { t: number; ev: CategoriseEvents }) {
  const open = seg(t, ev.drawer, 550);
  if (open === 0) return null;
  const row = CATEGORISE_ROWS.find((r) => r.id === REVIEWED_ID)!;
  const confirmed = t >= ev.approvePress + 250;
  const historyCount = t >= ev.historyAt + 1800 ? 2 : 1;
  const scroll = seg(t, ev.historyAt, 700) * 150;
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: alpha(colors.background, 0.5), opacity: open }} />
      <aside
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          right: 0,
          width: 480,
          display: "flex",
          flexDirection: "column",
          borderLeft: `1px solid ${colors.border}`,
          background: colors.surface,
          transform: `translateX(${((1 - open) * 100).toFixed(2)}%)`,
        }}
      >
        <header style={{ position: "relative", display: "flex", flexDirection: "column", gap: 4, borderBottom: `1px solid ${colors.border}`, padding: "16px 56px 16px 24px" }}>
          <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: "-0.01em", color: colors.foreground }}>{row.description}</div>
          <div style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.mutedForeground }}>
            {row.date} 2026 · {gbp(row.amount)} · {row.reference}
          </div>
          <span style={{ position: "absolute", right: 12, top: 12, width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", color: colors.mutedForeground }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </span>
        </header>
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: "16px 24px" }}>
          <div style={{ transform: `translateY(-${scroll.toFixed(1)}px)`, display: "flex", flexDirection: "column", gap: 20 }}>
            <ExplanationSections t={t} data={SCAFFOLD_EXPLANATION} decisionAt={ev.decisionAt} reasoningAt={ev.reasoningAt} riskAt={ev.riskAt} status={confirmed ? "confirmed" : undefined} />
            <section style={{ display: "flex", flexDirection: "column", gap: 12, ...enterStyle(seg(t, ev.historyAt + 200, 400)) }}>
              <Eyebrow color={colors.mutedForeground}>History</Eyebrow>
              <ol style={{ margin: 0, padding: 0 }}>
                {HISTORY.slice(0, historyCount).map((item, i) => (
                  <HistoryRow key={item.title} item={item} p={seg(t, ev.historyAt + 300 + i * 1500, 500)} last={i === historyCount - 1} />
                ))}
              </ol>
            </section>
          </div>
        </div>
        <footer style={{ display: "flex", gap: 8, borderTop: `1px solid ${colors.border}`, padding: "16px 24px" }}>
          <Btn style={{ ...pressStyle(t, ev.approvePress), opacity: confirmed ? 0.5 : 1 }}>Approve</Btn>
          <Btn variant="outline" style={{ opacity: confirmed ? 0.5 : 1 }}>
            Correct
          </Btn>
          <Btn variant="destructive" style={{ opacity: confirmed ? 0.5 : 1 }}>
            Reject
          </Btn>
        </footer>
      </aside>
    </>
  );
}

export function CategoriseScene({ t, ev }: { t: number; ev: CategoriseEvents }) {
  const lastResolve = ev.resolveFrom + (CATEGORISE_ROWS.length - 1) * ROW_STEP + 500;
  const job: JobState = t < ev.press + 150 ? "idle" : t < lastResolve ? "running" : "completed";
  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", height: "100%" }}>
      <SceneHeader title="Transactions" meta={`${ORG.name} · ${ORG.period}`}>
        <JobChip t={t} state={job} label={job === "idle" ? "7 uncategorised" : job === "running" ? "Categorising 7" : "7 categorised · 1 to review"} />
        <Btn variant="outline">Sync</Btn>
        <Btn style={pressStyle(t, ev.press)}>Categorise</Btn>
      </SceneHeader>
      <div style={{ padding: "0 24px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr>
              <Th width={76}>Date</Th>
              <Th>Description</Th>
              <Th width={112} align="right">
                Amount
              </Th>
              <Th width={224}>Category</Th>
              <Th width={124}>Confidence</Th>
              <Th width={136}>Status</Th>
            </tr>
          </thead>
          <tbody>
            {CATEGORISE_ROWS.map((row, i) => {
              const pin = seg(t, ev.enter + 150 + i * 90, 500);
              const pr = seg(t, ev.resolveFrom + i * ROW_STEP, 600);
              const resolved = t >= ev.resolveFrom + i * ROW_STEP + 450;
              const selected = row.id === REVIEWED_ID && t >= ev.select;
              const status = resolved ? (row.id === REVIEWED_ID && t >= ev.approvePress + 250 ? "confirmed" : row.status) : "uncategorised";
              return (
                <Tr key={row.id} selected={selected} style={enterStyle(pin)}>
                  <Td mono color={colors.mutedForeground}>
                    {row.date}
                  </Td>
                  <Td style={{ fontWeight: 500 }}>{row.description}</Td>
                  <Td align="right" mono>
                    {gbp(row.amount)}
                  </Td>
                  <Td>{pr > 0 && <CategoryLabel code={row.code} name={row.category} />}</Td>
                  <Td>
                    <CountingConfidence value={row.confidence} p={pr} />
                  </Td>
                  <Td>
                    <StatusChip status={status} />
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 40, fontFamily: fonts.mono, fontSize: 12, color: colors.mutedForeground }}>
          <span>7 transactions · page 1 of 1</span>
          <span>Sorted by date</span>
        </div>
      </div>
      <Drawer t={t} ev={ev} />
    </div>
  );
}
