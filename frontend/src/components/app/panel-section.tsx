import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Eyebrow } from "@/components/ui/eyebrow";

/** Eyebrow-headed block used by the explanation panel, the reconciliation detail and settings. */
export function PanelSection({
  eyebrow,
  aside,
  className,
  children,
}: {
  eyebrow: string;
  /** Right-hand slot on the eyebrow line (a count, a chip). */
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <Eyebrow className="text-muted-foreground">{eyebrow}</Eyebrow>
        {aside}
      </div>
      {children}
    </section>
  );
}
