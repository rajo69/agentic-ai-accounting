import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Neutral label: 22 px, radius 4, hairline ring, no fills louder than 10 percent.
 * For semantic statuses use `StatusChip` instead.
 */
const badgeVariants = cva(
  "group/badge inline-flex h-[22px] w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-sm px-2 text-xs font-medium ring-1 ring-inset transition-colors duration-150 [&>svg]:pointer-events-none [&>svg]:!size-3",
  {
    variants: {
      variant: {
        default: "bg-surface-2 text-foreground ring-border",
        primary: "bg-primary/10 text-primary ring-primary/20",
        secondary: "bg-transparent text-muted-foreground ring-border",
        destructive: "bg-danger/10 text-danger ring-danger/20",
        outline: "bg-transparent text-foreground ring-border-strong",
        ghost: "bg-transparent text-muted-foreground ring-transparent",
        link: "bg-transparent text-primary ring-transparent underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
