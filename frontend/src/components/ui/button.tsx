"use client"

import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * DESIGN.md section 7 (amended 2026-10-10): default/primary is the foreground colour on the dark
 * canvas, like Linear and Vercel; the accent token stays for focus rings, active bars and chips.
 * Three real tiers: default/primary, outline (hairline), ghost.
 * `secondary` is a tonal fill for grouped toolbars; `destructive` is a tinted chip-style button
 * for reject actions. Heights: xs 28, sm 32, default 36, lg 40.
 */
const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent text-sm font-medium select-none",
    "transition duration-150 ease-out-quart",
    "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    "aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-danger/30",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-foreground text-background hover:bg-white aria-expanded:bg-white",
        primary:
          "bg-foreground text-background hover:bg-white aria-expanded:bg-white",
        outline:
          "border-border bg-transparent text-foreground hover:border-border-strong hover:bg-surface-2 aria-expanded:border-border-strong aria-expanded:bg-surface-2",
        secondary:
          "border-border bg-surface-2 text-foreground hover:border-border-strong hover:bg-border/60 aria-expanded:border-border-strong",
        ghost:
          "text-muted-foreground hover:bg-surface-2 hover:text-foreground aria-expanded:bg-surface-2 aria-expanded:text-foreground",
        destructive:
          "bg-danger/10 text-danger ring-1 ring-inset ring-danger/20 hover:bg-danger/15 hover:ring-danger/30 focus-visible:ring-danger",
        link: "text-foreground underline-offset-4 hover:text-primary hover:underline",
        /** A job in progress: the info tone of the status chip, kept at full strength while disabled. */
        running:
          "bg-info/10 text-info ring-1 ring-inset ring-info/20 disabled:opacity-100",
      },
      size: {
        default: "h-9 px-3.5",
        xs: "h-7 gap-1.5 px-2 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 gap-1.5 px-2.5 text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 px-4",
        icon: "size-9",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type ButtonProps = ButtonPrimitive.Props & VariantProps<typeof buttonVariants>

/** forwardRef so Base UI `render={<Button />}` (Dialog/Sheet triggers and close) can attach its ref. */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "default", size = "default", ...props },
  ref
) {
  return (
    <ButtonPrimitive
      ref={ref}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
})

export { Button, buttonVariants }
export type { ButtonProps }
