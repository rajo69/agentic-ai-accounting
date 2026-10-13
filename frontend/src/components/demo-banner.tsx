"use client";

import { useEffect, useState } from "react";
import { exitDemo, isDemo } from "@/demo/flag";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";

/**
 * DESIGN.md section 7: 32 px, surface-2, mono text, two ghost buttons; sits above the content
 * area inside the shell. The flag is read after mount so server and client render the same markup.
 */
export default function DemoBanner() {
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    setDemo(isDemo());
  }, []);
  if (!demo) return null;

  return (
    <div
      role="status"
      className="flex h-8 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface-2 px-3 font-mono text-[11px] text-muted-foreground md:px-4"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <StatusChip tone="info" dot={false} className="h-5 px-1.5 text-[10px] uppercase tracking-[0.08em]">
          Demo
        </StatusChip>
        <span className="truncate">Nothing leaves your browser; nothing is written to Xero.</span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="xs"
          className="h-6 px-2 font-mono text-[11px] font-normal"
          onClick={() => {
            window.location.href = "/demo?skip_onboarding=1";
          }}
        >
          Reset demo
        </Button>
        <Button
          variant="ghost"
          size="xs"
          className="h-6 px-2 font-mono text-[11px] font-normal"
          onClick={() => exitDemo()}
        >
          Exit demo
        </Button>
      </span>
    </div>
  );
}
