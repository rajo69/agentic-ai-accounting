"use client";

import type { CSSProperties, ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants, type ButtonProps } from "@/components/ui/button";
import { ConfidenceMeter } from "@/components/ui/confidence-meter";
import { Eyebrow } from "@/components/ui/eyebrow";
import { StatusChip } from "@/components/ui/status-chip";

import type { Explanation, RiskRule } from "./data";
import { enterStyle, pct, seg } from "./timeline";

/**
 * Pieces shared by the four scenes and the capability crops. Everything here is decorative:
 * the product frame is `aria-hidden`, so buttons are spans (not focusable) and nothing
 * carries interactive semantics.
 */

/** A button that looks exactly like `ui/button` but cannot receive focus. */
export function FauxButton({
  variant = "default",
  size = "sm",
  className,
  style,
  children,
}: {
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <span className={cn(buttonVariants({ variant, size }), "transition-transform duration-150", className)} style={style}>
      {children}
    </span>
  );
}

/**
 * A pipeline job button as the dashboard draws it: while the job runs it takes the info tone, a
 * spinner and the running label; both labels share one grid cell, so the width never changes.
 */
export function FauxJobButton({
  running,
  label,
  runningLabel,
  size = "sm",
  style,
}: {
  running: boolean;
  label: string;
  runningLabel: string;
  size?: ButtonProps["size"];
  style?: CSSProperties;
}) {
  return (
    <FauxButton variant={running ? "running" : "default"} size={size} style={style} className="min-w-36">
      {running && <Loader2 className="animate-spin" />}
      <span className="grid">
        <span className={cn("col-start-1 row-start-1", running && "invisible")}>{label}</span>
        <span className={cn("col-start-1 row-start-1", !running && "invisible")}>{runningLabel}</span>
      </span>
    </FauxButton>
  );
}

/** Page title row inside the frame: title, mono meta, right-hand actions. */
export function SceneHeader({
  title,
  meta,
  chip,
  children,
}: {
  title: string;
  meta?: string;
  chip?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-16 shrink-0 items-center justify-between gap-4 px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <div className="truncate text-base font-medium tracking-[-0.01em] text-foreground">{title}</div>
          {meta && <div className="truncate font-mono text-xs text-muted-foreground">{meta}</div>}
        </div>
        {chip}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

export type JobState = "idle" | "queued" | "running" | "completed";

/** The inline job indicator the pipeline actions show. */
export function JobChip({ state, label }: { state: JobState; label: string }) {
  if (state === "idle") {
    return (
      <span className="font-mono text-xs text-muted-foreground" data-state={state}>
        {label}
      </span>
    );
  }
  const tone = state === "completed" ? "success" : state === "running" ? "info" : "muted";
  return (
    <StatusChip tone={tone} dot={state !== "running"} data-state={state}>
      {state === "running" && <Loader2 className="size-3 animate-spin" />}
      {label}
    </StatusChip>
  );
}

const barTones = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  primary: "bg-primary",
  muted: "bg-border-strong",
} as const;

export type BarTone = keyof typeof barTones;

export function toneForRisk(label: "high" | "medium" | "low"): BarTone {
  return label === "high" ? "danger" : label === "medium" ? "warning" : "muted";
}

export function toneForScore(value: number): BarTone {
  return value >= 0.85 ? "success" : value >= 0.5 ? "warning" : "muted";
}

/** 4 px bar plus a mono value; `p` scales both so the bar grows with the clock. */
export function MiniBar({
  value,
  tone,
  p = 1,
  width = "flex-1",
  compact = false,
  className,
}: {
  value: number;
  tone: BarTone;
  p?: number;
  width?: string;
  /** Smaller value text for table cells. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center", compact ? "gap-1.5" : "gap-2", className)}>
      <span className={cn("h-1 shrink-0 overflow-hidden rounded-full bg-surface-2", width)}>
        <span className={cn("block h-full rounded-full", barTones[tone])} style={{ width: `${value * p * 100}%` }} />
      </span>
      <span
        className={cn(
          "shrink-0 text-right font-mono tabular-nums text-muted-foreground",
          compact ? "w-7 text-[11px]" : "w-9 text-small"
        )}
      >
        {(value * p).toFixed(2)}
      </span>
    </span>
  );
}

/** Eyebrow-headed block, as in the explanation panel. */
export function PanelSection({
  eyebrow,
  style,
  className,
  children,
}: {
  eyebrow: string;
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)} style={style}>
      <Eyebrow className="text-muted-foreground">{eyebrow}</Eyebrow>
      {children}
    </section>
  );
}

/** One fired fuzzy rule: check, antecedents, consequent, firing strength. */
export function RuleLine({ rule, p }: { rule: RiskRule; p: number }) {
  return (
    <div className="flex items-start gap-2.5" style={enterStyle(p, 6)}>
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm bg-success/10 ring-1 ring-inset ring-success/20">
        <Check
          className="size-3 text-success transition-transform duration-200 ease-out-quart"
          style={{ transform: `scale(${p > 0.6 ? 1 : 0})` }}
          strokeWidth={2.5}
        />
      </span>
      <span className="min-w-0 flex-1 text-xs leading-5">
        <span className="text-foreground">{rule.when}</span>
        <span className="text-muted-foreground"> → risk {rule.then}</span>
      </span>
      <span className="shrink-0 font-mono text-xs leading-5 tabular-nums text-muted-foreground">{rule.strength.toFixed(2)}</span>
    </div>
  );
}

/** Account code (mono) and name. */
export function CategoryLabel({ code, name, className }: { code: string; name: string; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-baseline gap-2", className)}>
      <span className="shrink-0 font-mono text-small text-muted-foreground">{code}</span>
      <span className="truncate text-foreground">{name}</span>
    </span>
  );
}

/** A confidence meter whose percentage counts up with `p` while the bar eases to the final width. */
export function CountingConfidence({ value, p, className }: { value: number; p: number; className?: string }) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <ConfidenceMeter value={p > 0 ? value : null} showValue={false} className="flex-1" />
      <span className="w-9 shrink-0 text-right font-mono text-small tabular-nums text-muted-foreground">
        {p > 0 ? `${pct(value, p)}%` : ""}
      </span>
    </span>
  );
}

/**
 * The explanation panel's DECISION, REASONING and RISK sections, driven by the clock from
 * `start`. Used inside the Categorise drawer, the Explain scene and the Explain capability crop.
 * Timings (relative to `start`): decision 300, meter 500 to 1100, reasoning 800 and 1150,
 * risk bar 1600, rules from 1900 every 300, risk chip 2600. Final by `start + 2900`.
 */
export function ExplanationSections({
  t,
  start,
  data,
  status,
}: {
  t: number;
  start: number;
  data: Explanation;
  /** Override the chip (the Explain scene flips it to confirmed). */
  status?: string;
}) {
  const s = start;
  return (
    <div className="flex flex-col gap-5">
      <PanelSection eyebrow="Decision" style={enterStyle(seg(t, s + 300, 450))}>
        <div className="flex items-center justify-between gap-3">
          <CategoryLabel code={data.code} name={data.category} className="text-sm" />
          <StatusChip status={status ?? data.status} />
        </div>
        <CountingConfidence value={data.confidence} p={seg(t, s + 500, 600)} />
        <div className="flex flex-wrap items-center gap-2 text-small text-muted-foreground">
          <span>Model</span>
          <StatusChip tone="info" dot={false}>
            {data.model}
          </StatusChip>
          {data.escalatedFrom && (
            <StatusChip tone="info" dot={false} style={enterStyle(seg(t, s + 900, 300), 4)}>
              Escalated from {data.escalatedFrom}
            </StatusChip>
          )}
        </div>
      </PanelSection>

      <PanelSection eyebrow="Reasoning">
        <p className="text-small leading-5 text-foreground/90" style={enterStyle(seg(t, s + 800, 500))}>
          {data.reasoning[0]}
        </p>
        <p className="text-small leading-5 text-foreground/90" style={enterStyle(seg(t, s + 1150, 500))}>
          {data.reasoning[1]}
        </p>
      </PanelSection>

      <PanelSection eyebrow="Risk" style={enterStyle(seg(t, s + 1500, 400))}>
        <div className="flex items-center gap-4">
          <MiniBar value={data.risk.score} tone={toneForRisk(data.risk.label)} p={seg(t, s + 1600, 700)} className="flex flex-1" />
          <StatusChip status={data.risk.label} style={enterStyle(seg(t, s + 2600, 300), 4)} />
        </div>
        <div className="flex flex-col gap-2">
          {data.risk.rules.map((rule, i) => (
            <RuleLine key={rule.when} rule={rule} p={seg(t, s + 1900 + i * 300, 400)} />
          ))}
        </div>
      </PanelSection>
    </div>
  );
}

/** Reaches its final state this many ms after `start`. */
export const EXPLANATION_SETTLE = 2900;
