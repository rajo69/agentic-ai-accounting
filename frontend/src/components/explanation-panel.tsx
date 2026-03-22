"use client";

import { useEffect, useState } from "react";
import { getExplanation, type ExplanationResponse } from "@/lib/api";

// ── Risk badge ────────────────────────────────────────────────────────────────

const RISK_STYLES: Record<string, string> = {
  low: "bg-green-100 text-green-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-800",
};

function RiskBadge({ label }: { label: string | null }) {
  if (!label) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        RISK_STYLES[label] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {label.charAt(0).toUpperCase() + label.slice(1)} risk
    </span>
  );
}

// ── Feature bar chart (div-based, no charting library) ───────────────────────

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
  const pct =
    maxContribution > 0 ? Math.abs(contribution) / maxContribution : 0;
  const isPositive = contribution >= 0;
  const barWidth = `${Math.round(pct * 100)}%`;
  const label = name.replace(/_/g, " ");
  const formattedValue =
    name === "amount"
      ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value)
      : value.toFixed(1);

  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs text-gray-600">
        <span className="font-medium capitalize">{label}</span>
        <span className="text-gray-400">{formattedValue}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${
              isPositive ? "bg-blue-500" : "bg-orange-400"
            }`}
            style={{ width: barWidth }}
          />
        </div>
        <span
          className={`text-[10px] w-10 text-right font-mono ${
            isPositive ? "text-blue-600" : "text-orange-500"
          }`}
        >
          {isPositive ? "+" : ""}
          {contribution.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface ExplanationPanelProps {
  transactionId: string;
  /** If true, renders as a compact embedded panel rather than a standalone card */
  inline?: boolean;
}

export function ExplanationPanel({
  transactionId,
  inline = false,
}: ExplanationPanelProps) {
  const [data, setData] = useState<ExplanationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getExplanation(transactionId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [transactionId]);

  const wrapClass = inline
    ? "space-y-3 text-sm"
    : "rounded-md border bg-white p-4 space-y-3 text-sm shadow-sm";

  if (loading) {
    return (
      <div className={wrapClass}>
        <p className="text-xs text-gray-400">Loading explanation…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={wrapClass}>
        <p className="text-xs text-red-400">
          {error ?? "No explanation available"}
        </p>
      </div>
    );
  }

  const { prediction, xai, risk } = data;
  const confidence = prediction?.confidence ?? data.category_confidence;
  const topFeatures = xai?.top_features ?? [];
  const maxContrib =
    topFeatures.length > 0
      ? Math.max(...topFeatures.map((f) => Math.abs(f.contribution)), 0.001)
      : 1;

  return (
    <div className={wrapClass}>
      {/* Decision header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
            AI Decision
          </p>
          <p className="font-semibold text-gray-900 mt-0.5">
            {prediction?.category ?? data.category ?? "—"}
          </p>
        </div>
        <div className="text-right space-y-1">
          {confidence !== null && confidence !== undefined && (
            <p className="text-2xl font-bold text-blue-600">
              {Math.round(confidence * 100)}%
            </p>
          )}
          <RiskBadge label={risk?.risk_label ?? null} />
        </div>
      </div>

      {/* Feature contribution bars */}
      {topFeatures.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            Feature contributions
            {xai.model_type === "ebm" && (
              <span className="ml-1 text-blue-400">(EBM)</span>
            )}
          </p>
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
      )}

      {/* AI reasoning text */}
      {xai.explanation_text && (
        <div className="rounded bg-gray-50 px-3 py-2 text-xs text-gray-600 leading-relaxed">
          {xai.explanation_text}
        </div>
      )}

      {/* Fuzzy risk detail */}
      {risk?.fired_rules && risk.fired_rules.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs text-gray-400 font-medium list-none flex items-center gap-1">
            <span className="group-open:rotate-90 inline-block transition-transform">▶</span>
            Why this risk level?
          </summary>
          <ol className="mt-2 space-y-1 border-l-2 border-gray-200 pl-3">
            {risk.fired_rules.map((rule, i) => (
              <li key={i} className="text-xs text-gray-500">
                {rule}
              </li>
            ))}
          </ol>
        </details>
      )}

      {/* Full audit trail */}
      {data.audit_history.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs text-gray-400 font-medium list-none flex items-center gap-1">
            <span className="group-open:rotate-90 inline-block transition-transform">▶</span>
            Full audit trail ({data.audit_history.length})
          </summary>
          <ol className="mt-2 space-y-2 border-l-2 border-gray-200 pl-3">
            {data.audit_history.map((entry) => (
              <li key={entry.id} className="text-xs text-gray-500 space-y-0.5">
                <p className="font-medium text-gray-700">{entry.action}</p>
                {entry.ai_explanation && (
                  <p className="text-gray-400 italic">{entry.ai_explanation}</p>
                )}
                {entry.ai_confidence !== null && entry.ai_confidence !== undefined && (
                  <p className="text-gray-400">
                    Confidence: {Math.round(entry.ai_confidence * 100)}%
                  </p>
                )}
                {entry.created_at && (
                  <p className="text-gray-300">
                    {new Date(entry.created_at).toLocaleString("en-GB")}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
