import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

/** 36 px, surface-2, hairline; focus = ring border plus a soft 2 px halo. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-border bg-surface-2 px-3 text-base text-foreground md:text-sm",
        "transition duration-150 ease-out-quart outline-none",
        "placeholder:text-subtle-foreground",
        "hover:border-border-strong",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border",
        "aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-danger/30",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        "[&[type=number]]:tabular-nums",
        className
      )}
      {...props}
    />
  )
}

export { Input }
