import { colors, fonts } from "../theme";
import { enterStyle, seg } from "../timeline";
import { Btn, Card, Chip, Eyebrow } from "../kit/primitives";
import { SceneHeader } from "../kit/shell";
import { ORG } from "./data";

/**
 * The dashboard as the demo opens it: four KPI tiles and the pipeline card with its three actions.
 * Counts agree with the Categorise (7 uncategorised) and Reconcile (8 unmatched) scenes.
 */
const KPIS = [
  { label: "Bank transactions", value: "142", delta: "Synced 2 min ago" },
  { label: "Uncategorised", value: "7", delta: "Of 142 this quarter" },
  { label: "Unreconciled", value: "8", delta: "Statement lines" },
  { label: "Documents", value: "2", delta: "Last: 07 Apr 2026" },
];

const PIPELINE = [
  { label: "Sync", meta: "Incremental · last run 2 min ago", action: "Sync", state: "Up to date", tone: "success" as const },
  { label: "Categorise", meta: "7 uncategorised transactions", action: "Categorise", state: "Ready", tone: "muted" as const },
  { label: "Reconcile", meta: "8 unmatched statement lines", action: "Reconcile", state: "Ready", tone: "muted" as const },
];

export function DashboardScene({ t, enter }: { t: number; enter: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <SceneHeader title="Dashboard" meta={`${ORG.name} · ${ORG.period}`} chip={<Chip tone="muted" dot={false}>{ORG.periodLabel}</Chip>} />
      <div style={{ padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {KPIS.map((k, i) => (
            <Card key={k.label} style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, ...enterStyle(seg(t, enter + 100 + i * 60, 500), 10) }}>
              <Eyebrow>{k.label}</Eyebrow>
              <div style={{ fontFamily: fonts.mono, fontSize: 28, lineHeight: "32px", color: colors.foreground, fontVariantNumeric: "tabular-nums" }}>{k.value}</div>
              <div style={{ fontSize: 13, color: colors.mutedForeground }}>{k.delta}</div>
            </Card>
          ))}
        </div>
        <Card style={{ padding: "16px 20px 8px", ...enterStyle(seg(t, enter + 420, 500), 10) }}>
          <Eyebrow style={{ marginBottom: 8 }}>Pipeline</Eyebrow>
          {PIPELINE.map((row, i) => (
            <div
              key={row.label}
              style={{
                display: "grid",
                gridTemplateColumns: "160px 1fr 140px 120px",
                alignItems: "center",
                gap: 16,
                height: 56,
                borderTop: i === 0 ? undefined : `1px solid ${colors.border}`,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 500, color: colors.foreground }}>{row.label}</div>
              <div style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.mutedForeground }}>{row.meta}</div>
              <div>
                <Chip tone={row.tone}>{row.state}</Chip>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Btn variant={i === 0 ? "outline" : "default"}>{row.action}</Btn>
              </div>
            </div>
          ))}
        </Card>
        <div style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.subtleForeground, ...enterStyle(seg(t, enter + 700, 500), 6) }}>
          Last categorisation run: none this quarter · Audit log: 0 rows for this period
        </div>
      </div>
    </div>
  );
}
