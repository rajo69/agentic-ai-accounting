import * as React from "react"

import { cn } from "@/lib/utils"

export type ChipTone = "success" | "warning" | "danger" | "info" | "primary" | "muted"

export interface StatusStyle {
  tone: ChipTone
  label: string
  /** Transparent fill with a stronger ring (used for needs_review). */
  outline?: boolean
}

/**
 * DESIGN.md section 7 status map. Keys are the exact strings the API returns
 * (`categorisation_status`, `match_status`, `risk_label`).
 */
export const STATUS_STYLES: Record<string, StatusStyle> = {
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
}

function humanise(status: string) {
  const s = status.replace(/_/g, " ").trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Resolve any status string to a style; unknown statuses fall back to muted. */
export function statusStyle(status: string | null | undefined): StatusStyle {
  if (!status) return { tone: "muted", label: "Unknown" }
  return STATUS_STYLES[status] ?? { tone: "muted", label: humanise(status) }
}

const filled: Record<ChipTone, string> = {
  success: "bg-success/10 text-success ring-success/20",
  warning: "bg-warning/10 text-warning ring-warning/20",
  danger: "bg-danger/10 text-danger ring-danger/20",
  info: "bg-info/10 text-info ring-info/20",
  primary: "bg-primary/10 text-primary ring-primary/20",
  muted: "bg-surface-2 text-muted-foreground ring-border",
}

const outlined: Record<ChipTone, string> = {
  success: "bg-transparent text-success ring-success/40",
  warning: "bg-transparent text-warning ring-warning/40",
  danger: "bg-transparent text-danger ring-danger/40",
  info: "bg-transparent text-info ring-info/40",
  primary: "bg-transparent text-primary ring-primary/40",
  muted: "bg-transparent text-muted-foreground ring-border-strong",
}

export interface StatusChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** API status string; sets tone, label and outline from STATUS_STYLES. */
  status?: string | null
  /** Override the tone resolved from `status`. */
  tone?: ChipTone
  outline?: boolean
  /** Show the 6 px leading dot (default on). */
  dot?: boolean
}

/** 22 px, radius 4, 10 percent fill, 20 percent ring. Children override the label. */
function StatusChip({ status, tone, outline, dot = true, className, children, ...props }: StatusChipProps) {
  const resolved = statusStyle(status)
  const t = tone ?? resolved.tone
  const isOutline = outline ?? resolved.outline ?? false
  return (
    <span
      data-slot="status-chip"
      data-tone={t}
      className={cn(
        "inline-flex h-[22px] w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-2 text-xs font-medium ring-1 ring-inset",
        isOutline ? outlined[t] : filled[t],
        className
      )}
      {...props}
    >
      {dot && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current opacity-80" />}
      {children ?? resolved.label}
    </span>
  )
}

export { StatusChip }
