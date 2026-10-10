import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Title row of every app page (DESIGN.md section 10): title, optional mono meta line, an
 * optional chip next to the title, actions on the right. Mirrors the landing frame's SceneHeader.
 */
export function PageHeader({
  title,
  meta,
  chip,
  className,
  children,
}: {
  title: string;
  meta?: ReactNode;
  chip?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-6 gap-y-3", className)}>
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-medium tracking-[-0.02em] text-foreground">{title}</h1>
          {meta && <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{meta}</div>}
        </div>
        {chip}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
