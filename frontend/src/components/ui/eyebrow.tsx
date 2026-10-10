import * as React from "react"

import { cn } from "@/lib/utils"

/** Mono 11 px uppercase label with an optional zero-padded numeral prefix ("01"). */
function Eyebrow({
  index,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { index?: number | string }) {
  return (
    <span
      data-slot="eyebrow"
      className={cn(
        "inline-flex items-center gap-2.5 font-mono text-eyebrow uppercase text-subtle-foreground",
        className
      )}
      {...props}
    >
      {index !== undefined && (
        <span className="tabular-nums text-muted-foreground">{String(index).padStart(2, "0")}</span>
      )}
      {children}
    </span>
  )
}

export { Eyebrow }
