"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Two looks (DESIGN.md section 7): `line` (default) is the underline tab bar with a 2 px primary
 * indicator that slides between tabs; `segmented` is the pill group used for filters.
 * `default` is kept as an alias of `segmented` for shadcn compatibility.
 */
function Tabs({ className, orientation = "horizontal", ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn("group/tabs flex gap-4 data-[orientation=horizontal]:flex-col", className)}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list relative inline-flex w-fit text-muted-foreground group-data-[orientation=vertical]/tabs:flex-col",
  {
    variants: {
      variant: {
        line: "items-end gap-5 border-b border-border",
        segmented: "h-9 items-center gap-0.5 rounded-md border border-border bg-surface p-0.5",
        default: "h-9 items-center gap-0.5 rounded-md border border-border bg-surface p-0.5",
      },
    },
    defaultVariants: {
      variant: "line",
    },
  }
)

const tabsIndicatorVariants = cva(
  "pointer-events-none absolute left-[var(--active-tab-left)] w-[var(--active-tab-width)] transition-[left,width,top,height] duration-200 ease-out-quart",
  {
    variants: {
      variant: {
        line: "-bottom-px h-0.5 bg-primary",
        segmented:
          "top-[var(--active-tab-top)] z-0 h-[var(--active-tab-height)] rounded-sm border border-border-strong bg-surface-2 shadow-highlight",
        default:
          "top-[var(--active-tab-top)] z-0 h-[var(--active-tab-height)] rounded-sm border border-border-strong bg-surface-2 shadow-highlight",
      },
    },
    defaultVariants: {
      variant: "line",
    },
  }
)

function TabsList({
  className,
  variant = "line",
  children,
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    >
      {children}
      <TabsPrimitive.Indicator
        data-slot="tabs-indicator"
        renderBeforeHydration
        className={tabsIndicatorVariants({ variant })}
      />
    </TabsPrimitive.List>
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative z-10 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm text-sm font-medium text-muted-foreground select-none",
        "transition-colors duration-150 ease-out-quart outline-none",
        "hover:text-foreground data-[active]:text-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-50 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        "group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start",
        // line: 40 px tall, text sits on the hairline
        "group-data-[variant=line]/tabs-list:h-10 group-data-[variant=line]/tabs-list:px-0.5",
        // segmented: 32 px pills
        "group-data-[variant=segmented]/tabs-list:h-8 group-data-[variant=segmented]/tabs-list:px-3",
        "group-data-[variant=default]/tabs-list:h-8 group-data-[variant=default]/tabs-list:px-3",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
