"use client"

import type { CSSProperties } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react"

/** Dark theme, surface + hairline, no colour fills; the icon carries the semantic colour. */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4 text-info" />,
        warning: <TriangleAlertIcon className="size-4 text-warning" />,
        error: <OctagonXIcon className="size-4 text-danger" />,
        loading: <Loader2Icon className="size-4 animate-spin text-muted-foreground" />,
      }}
      style={
        {
          "--normal-bg": "hsl(var(--surface))",
          "--normal-text": "hsl(var(--foreground))",
          "--normal-border": "hsl(var(--border))",
          "--border-radius": "calc(var(--radius) + 2px)",
        } as CSSProperties
      }
      toastOptions={{
        style: { fontFamily: "var(--font-geist-sans)", fontSize: "0.8125rem" },
        classNames: {
          toast: "cn-toast shadow-popover",
          description: "!text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
