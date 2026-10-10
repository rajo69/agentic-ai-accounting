import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Dashed hairline box with an icon, a one-line title and a muted hint. */
export function EmptyState({
  icon,
  title,
  hint,
  className,
  children,
}: {
  icon?: ReactNode;
  title: string;
  hint?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-14 text-center",
        className
      )}
    >
      {icon && <div className="mb-1 text-subtle-foreground [&_svg]:size-6 [&_svg]:stroke-[1.5]">{icon}</div>}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="max-w-xs text-small text-muted-foreground">{hint}</p>}
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
