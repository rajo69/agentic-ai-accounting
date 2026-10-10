import { Loader2 } from "lucide-react";

import { StatusChip } from "@/components/ui/status-chip";

export type JobState = "idle" | "queued" | "running" | "completed";

/** Inline job indicator for pipeline actions: mono text when idle, a chip otherwise. */
export function JobChip({ state, label }: { state: JobState; label: string }) {
  if (state === "idle") {
    return (
      <span className="font-mono text-xs text-muted-foreground" data-state={state}>
        {label}
      </span>
    );
  }
  const tone = state === "completed" ? "success" : state === "running" ? "info" : "muted";
  return (
    <StatusChip tone={tone} dot={state !== "running"} data-state={state}>
      {state === "running" && <Loader2 className="size-3 animate-spin" />}
      {label}
    </StatusChip>
  );
}
