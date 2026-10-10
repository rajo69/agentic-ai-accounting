import * as React from "react"

import { cn } from "@/lib/utils"
import { Eyebrow } from "@/components/ui/eyebrow"

const deltaTones = {
  muted: "text-muted-foreground",
  success: "text-success",
  danger: "text-danger",
} as const

export interface KpiTileProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string
  value: React.ReactNode
  /** Second line, 13 px: a delta or a hint. */
  delta?: React.ReactNode
  deltaTone?: keyof typeof deltaTones
  index?: number | string
}

/** Surface, hairline, eyebrow label, 28 px mono tabular value, 13 px muted delta. */
function KpiTile({ label, value, delta, deltaTone = "muted", index, className, ...props }: KpiTileProps) {
  return (
    <div
      data-slot="kpi-tile"
      className={cn("flex flex-col gap-3 rounded-lg border border-border bg-surface p-5", className)}
      {...props}
    >
      <Eyebrow index={index}>{label}</Eyebrow>
      <div className="font-mono text-kpi tabular-nums text-foreground">{value}</div>
      {delta !== undefined && <div className={cn("text-small", deltaTones[deltaTone])}>{delta}</div>}
    </div>
  )
}

export { KpiTile }
