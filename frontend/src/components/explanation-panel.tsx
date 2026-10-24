"use client";

import { useEffect, useState } from "react";
import { Bot, Check, Info, UserCheck, UserPen, UserX } from "lucide-react";
import { getExplanation, type ExplanationResponse } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ConfidenceMeter } from "@/components/ui/confidence-meter";
import { StatusChip } from "@/components/ui/status-chip";
import { PanelSection } from "@/components/app/panel-section";
import { MiniBar, toneForRisk } from "@/components/app/mini-bar";
import { Skeleton } from "@/components/app/skeleton";

// ── Feature bar (EBM only) ────────────────────────────────────────────────────

function FeatureBar({
  name,
  value,
  contribution,
  maxContribution,
}: {
  name: string;
  value: number;
  contribution: number;
  maxContribution: number;
}) {
  const pct = maxContribution > 0 ? Math.abs(contribution) / maxContribution : 0;
  const isPositive = contribution >= 0;
  const label = name.replace(/_/g, " ");
  const formattedValue =
    name === "amount"
      ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value)
      : value.toFixed(1);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span className="capitalize text-foreground">{label}</span>
        <span className="font-mono tabular-nums text-muted-foreground">{formattedValue}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className={cn("h-full rounded-full transition-[width] duration-600 ease-out-expo", isPositive ? "bg-primary" : "bg-warning")}
            style={{ width: `${pct * 100}%` }}
          />
        </div>
        <span className={cn("w-10 shrink-0 text-right font-mono text-xs tabular-nums", isPositive ? "text-primary" : "text-warning")}>
          {isPositive ? "+" : ""}{contribution.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

// ── History timeline ──────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  ai_categorise: "AI categorised",
  human_approve: "Approved by reviewer",
  human_reject: "Rejected by reviewer",
  human_correct: "Corrected by reviewer",
  ai_match: "AI matched",
  human_confirm: "Match confirmed",
  human_unmatch: "Match removed",
  human_match: "Matched manually",
};

function actionLabel(action: string) {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  const s = action.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function actionIcon(action: string) {
  if (action.startsWith("human_reject") || action.startsWith("human_unmatch")) return UserX;
  if (action.startsWith("human_correct")) return UserPen;
  if (action.startsWith("human")) return UserCheck;
  return Bot;
}

function actionTone(action: string) {
  if (action.startsWith("human_reject") || action.startsWith("human_unmatch")) return "bg-danger/10 text-danger ring-danger/20";
  if (action.startsWith("human")) return "bg-success/10 text-success ring-success/20";
  return "bg-primary/10 text-primary ring-primary/20";
}

/** The old and new category of a correction, from its stored old and new values. */
function categoryChange(entry: ExplanationResponse["audit_history"][number]) {
  if (entry.action !== "human_correct") return null;
  const from = entry.old_value?.category;
  const to = entry.new_value?.category;
  if (typeof to !== "string") return null;
  return { from: typeof from === "string" ? from : null, to };
}

function fmtWhen(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function ExplanationPanel({
  transactionId,
  inline = false,
  escalatedFrom,
}: {
  transactionId: string;
  inline?: boolean;
  /** Primary model id when the categorisation was escalated (read by the caller from the audit data). */
  escalatedFrom?: string | null;
}) {
  const [data, setData] = useState<ExplanationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getExplanation(transactionId)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((e) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [transactionId]);

  const wrapClass = inline
    ? "flex flex-col gap-6 text-sm"
    : "flex flex-col gap-6 rounded-lg border border-border bg-surface p-5 text-sm";

  if (loading) {
    return (
      <div className={wrapClass} aria-busy="true">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-1 w-full" />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-1 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={cn(wrapClass, "flex-row items-center gap-2 text-small text-muted-foreground")}>
        <Info className="size-4 shrink-0" />
        {error ?? "No explanation yet. Run categorisation first."}
      </div>
    );
  }

  const { prediction, xai, risk } = data;
  const confidence = prediction?.confidence ?? data.category_confidence;
  const topFeatures = xai?.top_features ?? [];
  const maxContrib = topFeatures.length > 0
    ? Math.max(...topFeatures.map((f) => Math.abs(f.contribution)), 0.001)
    : 1;
  const category = prediction?.category ?? data.category;
  const model = prediction?.model ?? data.audit_history.find((e) => e.ai_model)?.ai_model ?? null;
  const reasoning = prediction?.reasoning ?? xai.explanation_text;
  const extraText = xai.explanation_text && xai.explanation_text !== reasoning ? xai.explanation_text : null;
  const hasRisk = risk && (risk.risk_label || risk.risk_score !== null || risk.fired_rules.length > 0);

  return (
    <div className={wrapClass}>
      {/* DECISION */}
      <PanelSection eyebrow="Decision">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex min-w-0 items-baseline gap-2 text-sm">
            {prediction?.category_code && (
              <span className="shrink-0 font-mono text-small text-muted-foreground">{prediction.category_code}</span>
            )}
            <span className="truncate font-medium text-foreground">{category ?? "No category"}</span>
          </span>
          <StatusChip status={data.categorisation_status} />
        </div>
        <ConfidenceMeter value={confidence} />
        {(model || escalatedFrom || xai.model_type === "ebm") && (
          <div className="flex flex-wrap items-center gap-2 text-small text-muted-foreground">
            <span>Model</span>
            {model && (
              <StatusChip tone="info" dot={false} className="font-mono">
                {model}
              </StatusChip>
            )}
            {escalatedFrom && (
              <StatusChip tone="info" dot={false}>
                Escalated from <span className="font-mono">{escalatedFrom}</span>
              </StatusChip>
            )}
            {xai.model_type === "ebm" && (
              <StatusChip tone="primary" dot={false}>
                EBM
              </StatusChip>
            )}
          </div>
        )}
      </PanelSection>

      {/* Feature contributions: only the glass-box model has them */}
      {xai.model_type === "ebm" && topFeatures.length > 0 && (
        <PanelSection eyebrow="Feature contributions">
          <div className="flex flex-col gap-2.5">
            {topFeatures.slice(0, 5).map((f) => (
              <FeatureBar
                key={f.name}
                name={f.name}
                value={f.value}
                contribution={f.contribution}
                maxContribution={maxContrib}
              />
            ))}
          </div>
        </PanelSection>
      )}

      {/* REASONING */}
      {(reasoning || extraText) && (
        <PanelSection eyebrow="Reasoning">
          {reasoning && <p className="text-small leading-5 text-foreground/90">{reasoning}</p>}
          {extraText && <p className="text-small leading-5 text-muted-foreground">{extraText}</p>}
        </PanelSection>
      )}

      {/* RISK */}
      {hasRisk && (
        <PanelSection eyebrow="Risk">
          <div className="flex items-center gap-4">
            <MiniBar value={risk.risk_score ?? 0} tone={toneForRisk(risk.risk_label)} className="flex flex-1" />
            {risk.risk_label && <StatusChip status={risk.risk_label} />}
          </div>
          {risk.fired_rules.length > 0 && (
            <ol className="flex flex-col gap-2">
              {risk.fired_rules.map((rule, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm bg-success/10 ring-1 ring-inset ring-success/20">
                    <Check className="size-3 text-success" strokeWidth={2.5} />
                  </span>
                  <span className="min-w-0 flex-1 text-xs leading-5 text-foreground">{rule}</span>
                </li>
              ))}
            </ol>
          )}
        </PanelSection>
      )}

      {/* HISTORY */}
      {data.audit_history.length > 0 && (
        <PanelSection
          eyebrow="History"
          aside={<span className="font-mono text-xs tabular-nums text-muted-foreground">{data.audit_history.length}</span>}
        >
          <ol className="flex flex-col">
            {data.audit_history.map((entry, i) => {
              const Icon = actionIcon(entry.action);
              const last = i === data.audit_history.length - 1;
              const when = fmtWhen(entry.created_at);
              const change = categoryChange(entry);
              return (
                <li key={entry.id} className={cn("relative flex gap-3", !last && "pb-5")}>
                  {!last && <span aria-hidden className="absolute left-[11px] top-7 h-[calc(100%-20px)] w-px bg-border" />}
                  <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full ring-1 ring-inset", actionTone(entry.action))}>
                    <Icon className="size-3.5" strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-small text-foreground">{actionLabel(entry.action)}</div>
                    {change && (
                      <div className="text-small leading-5 text-muted-foreground">
                        {change.from ?? "No category"} <span aria-hidden>→</span>
                        <span className="sr-only">changed to</span> <span className="text-foreground">{change.to}</span>
                      </div>
                    )}
                    {entry.ai_explanation && (
                      <div className="text-small leading-5 text-muted-foreground">{entry.ai_explanation}</div>
                    )}
                    <div className="mt-1 flex flex-wrap gap-x-3 font-mono text-xs text-muted-foreground">
                      {entry.ai_confidence !== null && entry.ai_confidence !== undefined && (
                        <span className="tabular-nums">{Math.round(entry.ai_confidence * 100)}%</span>
                      )}
                      {entry.ai_model && <span>{entry.ai_model}</span>}
                      {when && <span>{when}</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </PanelSection>
      )}
    </div>
  );
}
