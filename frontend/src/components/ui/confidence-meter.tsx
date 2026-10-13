import * as React from "react"

import { cn } from "@/lib/utils"

/** Tiers match the thresholds the explanation panel already uses (0.85 / 0.5). */
export const CONFIDENCE_THRESHOLDS = { high: 0.85, medium: 0.5 } as const

export type ConfidenceTier = "high" | "medium" | "low" | "none"

export function confidenceTier(value: number | null | undefined): ConfidenceTier {
  if (value === null || value === undefined || Number.isNaN(value)) return "none"
  if (value >= CONFIDENCE_THRESHOLDS.high) return "high"
  if (value >= CONFIDENCE_THRESHOLDS.medium) return "medium"
  return "low"
}

const barTone: Record<ConfidenceTier, string> = {
  high: "bg-success",
  medium: "bg-warning",
  low: "bg-danger",
  none: "bg-border-strong",
}

export interface ConfidenceMeterProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0 to 1. Null renders an empty track and an em dash. */
  value: number | null | undefined
  showValue?: boolean
  label?: string
}

/** 4 px track, tier-coloured fill, mono percentage. Width changes ease over 600 ms. */
function ConfidenceMeter({
  value,
  showValue = true,
  label = "Confidence",
  className,
  ...props
}: ConfidenceMeterProps) {
  const tier = confidenceTier(value)
  const pct = tier === "none" ? 0 : Math.round(Math.min(Math.max(value as number, 0), 1) * 100)
  return (
    <div
      data-slot="confidence-meter"
      data-tier={tier}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={tier === "none" ? undefined : pct}
      aria-valuetext={tier === "none" ? "No confidence score" : `${pct} percent`}
      className={cn("flex min-w-0 items-center gap-3", className)}
      {...props}
    >
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn("h-full rounded-full transition-[width] duration-600 ease-out-expo", barTone[tier])}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showValue && (
        <span className="w-9 shrink-0 text-right font-mono text-small tabular-nums text-muted-foreground">
          {tier === "none" ? "-" : `${pct}%`}
        </span>
      )}
    </div>
  )
}

export { ConfidenceMeter }
