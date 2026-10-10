"use client";

import { useEffect, useState } from "react";
import { exitDemo, isDemo } from "@/demo/flag";

/**
 * Shown above the app content while demo mode is on. Plain for now; S4 restyles it.
 * The flag is read after mount so server and client render the same markup.
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
      className="flex h-8 items-center justify-between gap-4 border-b border-border bg-surface-2 px-4 font-mono text-[11px] text-muted-foreground"
    >
      <span className="truncate">Demo: a synthetic company. Nothing leaves your browser.</span>
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          className="text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => {
            window.location.href = "/demo?skip_onboarding=1";
          }}
        >
          Reset data
        </button>
        <button
          type="button"
          className="text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => exitDemo()}
        >
          Exit demo
        </button>
      </div>
    </div>
  );
}
