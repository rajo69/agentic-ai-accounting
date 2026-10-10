import type { CSSProperties, ReactNode } from "react";
import { colors, fonts, radius } from "../theme";
import { enterStyle, pct, seg } from "../timeline";

/**
 * The product's primitives (DESIGN.md section 7) redrawn with inline styles so Remotion renders
 * them without Tailwind. Sizes are the app's own at 1x; the console frame scales them up.
 */

export function alpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export type Tone = "success" | "warning" | "danger" | "info" | "primary" | "muted";

export const toneColor: Record<Tone, string> = {
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
  info: colors.info,
  primary: colors.primary,
  muted: colors.mutedForeground,
};

export const STATUS: Record<string, { tone: Tone; label: string; outline?: boolean }> = {
  auto_categorised: { tone: "success", label: "Auto-categorised" },
  suggested: { tone: "warning", label: "Suggested" },
  needs_review: { tone: "warning", label: "Needs review", outline: true },
  confirmed: { tone: "success", label: "Confirmed" },
  rejected: { tone: "danger", label: "Rejected" },
  uncategorised: { tone: "muted", label: "Uncategorised" },
  auto_matched: { tone: "success", label: "Auto-matched" },
  unmatched: { tone: "muted", label: "Unmatched" },
  high: { tone: "danger", label: "High risk" },
  medium: { tone: "warning", label: "Medium risk" },
  low: { tone: "muted", label: "Low risk" },
};

export function Eyebrow({ children, style, color = colors.subtleForeground }: { children: ReactNode; style?: CSSProperties; color?: string }) {
  return (
    <div
      style={{
        fontFamily: fonts.mono,
        fontSize: 11,
        lineHeight: "16px",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Chip({
  tone = "muted",
  outline = false,
  dot = true,
  children,
  style,
}: {
  tone?: Tone;
  outline?: boolean;
  dot?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const c = toneColor[tone];
  const muted = tone === "muted";
  const bg = outline ? "transparent" : muted ? colors.surface2 : alpha(c, 0.1);
  const ring = outline ? (muted ? colors.borderStrong : alpha(c, 0.4)) : muted ? colors.border : alpha(c, 0.2);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 22,
        padding: "0 8px",
        borderRadius: radius.chip,
        background: bg,
        boxShadow: `inset 0 0 0 1px ${ring}`,
        color: c,
        fontFamily: fonts.sans,
        fontSize: 12,
        fontWeight: 500,
        lineHeight: "22px",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: 3, background: c, flexShrink: 0 }} />}
      {children}
    </span>
  );
}

export function StatusChip({ status, style }: { status: string; style?: CSSProperties }) {
  const s = STATUS[status] ?? { tone: "muted" as Tone, label: status };
  return (
    <Chip tone={s.tone} outline={s.outline} style={style}>
      {s.label}
    </Chip>
  );
}

export type ButtonVariant = "default" | "outline" | "ghost" | "destructive";

export function Btn({
  variant = "default",
  size = "sm",
  children,
  style,
}: {
  variant?: ButtonVariant;
  size?: "sm" | "default";
  children: ReactNode;
  style?: CSSProperties;
}) {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: size === "sm" ? 32 : 36,
    padding: size === "sm" ? "0 12px" : "0 16px",
    borderRadius: radius.control,
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: "nowrap",
    boxSizing: "border-box",
  };
  const variants: Record<ButtonVariant, CSSProperties> = {
    default: { background: colors.foreground, color: colors.background },
    outline: { background: "transparent", color: colors.foreground, boxShadow: `inset 0 0 0 1px ${colors.border}` },
    ghost: { background: "transparent", color: colors.mutedForeground },
    destructive: { background: "transparent", color: colors.danger, boxShadow: `inset 0 0 0 1px ${alpha(colors.danger, 0.3)}` },
  };
  return <span style={{ ...base, ...variants[variant], ...style }}>{children}</span>;
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.card,
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function toneForRisk(label: "high" | "medium" | "low"): Tone {
  return label === "high" ? "danger" : label === "medium" ? "warning" : "muted";
}
export function toneForScore(v: number): Tone {
  return v >= 0.85 ? "success" : v >= 0.5 ? "warning" : "muted";
}
export function tierColor(v: number) {
  return v >= 0.85 ? colors.success : v >= 0.5 ? colors.warning : colors.danger;
}

/** 4 px bar plus mono value; `p` scales both so the bar grows with the clock. */
export function MiniBar({
  value,
  tone,
  p = 1,
  width = 56,
  compact = false,
  grow = false,
}: {
  value: number;
  tone: Tone;
  p?: number;
  width?: number;
  compact?: boolean;
  grow?: boolean;
}) {
  const c = tone === "muted" ? colors.borderStrong : toneColor[tone];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: compact ? 6 : 8, flex: grow ? 1 : undefined, minWidth: 0 }}>
      <span style={{ height: 4, width: grow ? undefined : width, flex: grow ? 1 : undefined, borderRadius: 2, background: colors.surface2, overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", borderRadius: 2, background: c, width: `${value * p * 100}%` }} />
      </span>
      <span
        style={{
          width: compact ? 28 : 36,
          textAlign: "right",
          fontFamily: fonts.mono,
          fontSize: compact ? 11 : 13,
          color: colors.mutedForeground,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {(value * p).toFixed(2)}
      </span>
    </span>
  );
}

/** Confidence meter: tier-coloured 4 px bar, mono percentage counting up with `p`. */
export function CountingConfidence({ value, p, grow = true }: { value: number; p: number; grow?: boolean }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 12, flex: grow ? 1 : undefined, minWidth: 0 }}>
      <span style={{ height: 4, flex: 1, borderRadius: 2, background: colors.surface2, overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", borderRadius: 2, background: p > 0 ? tierColor(value) : colors.borderStrong, width: `${value * p * 100}%` }} />
      </span>
      <span style={{ width: 36, textAlign: "right", fontFamily: fonts.mono, fontSize: 13, color: colors.mutedForeground, fontVariantNumeric: "tabular-nums" }}>
        {p > 0 ? `${pct(value, p)}%` : ""}
      </span>
    </span>
  );
}

export function CategoryLabel({ code, name, size = 13 }: { code: string; name: string; size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
      <span style={{ fontFamily: fonts.mono, fontSize: size, color: colors.mutedForeground, flexShrink: 0 }}>{code}</span>
      <span style={{ color: colors.foreground, fontSize: size, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
    </span>
  );
}

export function Check({ size = 12, color = colors.success, p = 1 }: { size?: number; color?: string; p?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ transform: `scale(${p})`, transformOrigin: "center" }}>
      <path d="M5 12.5 L10 17.5 L19 7" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Spinner({ size = 12, color = colors.info, t }: { size?: number; color?: string; t: number }) {
  const angle = ((t / 1000) * 360) % 360;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ transform: `rotate(${angle}deg)` }}>
      <circle cx="12" cy="12" r="9" stroke={alpha(color, 0.25)} strokeWidth={3} />
      <path d="M12 3 a9 9 0 0 1 9 9" stroke={color} strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}

export type JobState = "idle" | "queued" | "running" | "completed";

export function JobChip({ state, label, t }: { state: JobState; label: string; t: number }) {
  if (state === "idle") {
    return <span style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.mutedForeground }}>{label}</span>;
  }
  const tone: Tone = state === "completed" ? "success" : state === "running" ? "info" : "muted";
  return (
    <Chip tone={tone} dot={state !== "running"}>
      {state === "running" && <Spinner t={t} />}
      {label}
    </Chip>
  );
}

/** Table pieces: header 11 px mono uppercase, rows 44 px, hairline between rows, selected rows carry a 2 px primary bar. */
export function Th({ children, width, align = "left" }: { children?: ReactNode; width?: number; align?: "left" | "right" }) {
  return (
    <th
      style={{
        width,
        textAlign: align,
        padding: "0 10px",
        height: 36,
        fontFamily: fonts.mono,
        fontSize: 11,
        fontWeight: 400,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: colors.mutedForeground,
        borderBottom: `1px solid ${colors.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

export function Td({ children, align = "left", mono = false, color, style }: { children?: ReactNode; align?: "left" | "right"; mono?: boolean; color?: string; style?: CSSProperties }) {
  return (
    <td
      style={{
        textAlign: align,
        padding: "0 10px",
        height: 44,
        fontFamily: mono ? fonts.mono : fonts.sans,
        fontSize: 13,
        color: color ?? colors.foreground,
        borderBottom: `1px solid ${colors.border}`,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        fontVariantNumeric: mono ? "tabular-nums" : undefined,
        ...style,
      }}
    >
      {children}
    </td>
  );
}

export function Tr({ children, selected = false, style }: { children: ReactNode; selected?: boolean; style?: CSSProperties }) {
  return (
    <tr
      style={{
        background: selected ? colors.surface2 : "transparent",
        boxShadow: selected ? `inset 2px 0 0 0 ${colors.primary}` : undefined,
        ...style,
      }}
    >
      {children}
    </tr>
  );
}

export function PanelSection({ eyebrow, children, style }: { eyebrow: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12, ...style }}>
      <Eyebrow color={colors.mutedForeground}>{eyebrow}</Eyebrow>
      {children}
    </section>
  );
}

export interface RiskRule {
  when: string;
  then: "high" | "medium" | "low";
  strength: number;
}

export function RuleLine({ rule, p }: { rule: RiskRule; p: number }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, ...enterStyle(p, 6) }}>
      <span
        style={{
          marginTop: 2,
          width: 16,
          height: 16,
          borderRadius: 3,
          background: alpha(colors.success, 0.1),
          boxShadow: `inset 0 0 0 1px ${alpha(colors.success, 0.2)}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Check p={p > 0.6 ? 1 : 0} />
      </span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: "20px", fontFamily: fonts.sans }}>
        <span style={{ color: colors.foreground }}>{rule.when}</span>
        <span style={{ color: colors.mutedForeground }}> → risk {rule.then}</span>
      </span>
      <span style={{ flexShrink: 0, fontFamily: fonts.mono, fontSize: 12, lineHeight: "20px", color: colors.mutedForeground, fontVariantNumeric: "tabular-nums" }}>
        {rule.strength.toFixed(2)}
      </span>
    </div>
  );
}

export interface Explanation {
  code: string;
  category: string;
  confidence: number;
  status: string;
  model: string;
  escalatedFrom?: string;
  reasoning: [string, string];
  risk: { score: number; label: "high" | "medium" | "low"; rules: RiskRule[] };
}

/**
 * DECISION, REASONING and RISK, each section keyed to its own absolute time so the voice can
 * call them in: `decisionAt` (chips and meter), `reasoningAt` (paragraphs), `riskAt` (bar, rules, chip).
 */
export function ExplanationSections({
  t,
  data,
  decisionAt,
  reasoningAt,
  riskAt,
  status,
}: {
  t: number;
  data: Explanation;
  decisionAt: number;
  reasoningAt: number;
  riskAt: number;
  status?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PanelSection eyebrow="Decision" style={enterStyle(seg(t, decisionAt, 450))}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <CategoryLabel code={data.code} name={data.category} size={14} />
          <StatusChip status={status ?? data.status} />
        </div>
        <CountingConfidence value={data.confidence} p={seg(t, decisionAt + 200, 600)} />
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 13, color: colors.mutedForeground }}>
          <span>Model</span>
          <Chip tone="info" dot={false}>
            {data.model}
          </Chip>
          {data.escalatedFrom && (
            <Chip tone="info" dot={false} style={enterStyle(seg(t, decisionAt + 600, 300), 4)}>
              Escalated from {data.escalatedFrom}
            </Chip>
          )}
        </div>
      </PanelSection>

      <PanelSection eyebrow="Reasoning" style={{ opacity: seg(t, reasoningAt - 100, 200) }}>
        <p style={{ margin: 0, fontSize: 13, lineHeight: "20px", color: alpha(colors.foreground, 0.9), ...enterStyle(seg(t, reasoningAt, 500)) }}>
          {data.reasoning[0]}
        </p>
        <p style={{ margin: 0, fontSize: 13, lineHeight: "20px", color: alpha(colors.foreground, 0.9), ...enterStyle(seg(t, reasoningAt + 350, 500)) }}>
          {data.reasoning[1]}
        </p>
      </PanelSection>

      <PanelSection eyebrow="Risk" style={enterStyle(seg(t, riskAt, 400))}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <MiniBar value={data.risk.score} tone={toneForRisk(data.risk.label)} p={seg(t, riskAt + 100, 700)} grow />
          <StatusChip status={data.risk.label} style={enterStyle(seg(t, riskAt + 1100, 300), 4)} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.risk.rules.map((rule, i) => (
            <RuleLine key={rule.when} rule={rule} p={seg(t, riskAt + 400 + i * 300, 400)} />
          ))}
        </div>
      </PanelSection>
    </div>
  );
}
