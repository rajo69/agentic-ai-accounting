import { cn } from "@/lib/utils";

const barTones = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  primary: "bg-primary",
  muted: "bg-border-strong",
} as const;

export type BarTone = keyof typeof barTones;

export function toneForRisk(label: string | null | undefined): BarTone {
  return label === "high" ? "danger" : label === "medium" ? "warning" : "muted";
}

export function toneForScore(value: number): BarTone {
  return value >= 0.85 ? "success" : value >= 0.5 ? "warning" : "muted";
}

/** 4 px bar plus a mono value (0 to 1, two decimals). Same look as the landing frame. */
export function MiniBar({
  value,
  tone,
  width = "flex-1",
  compact = false,
  className,
}: {
  value: number;
  tone: BarTone;
  width?: string;
  compact?: boolean;
  className?: string;
}) {
  const v = Math.min(Math.max(value, 0), 1);
  return (
    <span className={cn("inline-flex items-center", compact ? "gap-1.5" : "gap-2", className)}>
      <span className={cn("h-1 shrink-0 overflow-hidden rounded-full bg-surface-2", width)}>
        <span
          className={cn("block h-full rounded-full transition-[width] duration-600 ease-out-expo", barTones[tone])}
          style={{ width: `${v * 100}%` }}
        />
      </span>
      <span
        className={cn(
          "shrink-0 text-right font-mono tabular-nums text-muted-foreground",
          compact ? "w-7 text-[11px]" : "w-9 text-small"
        )}
      >
        {v.toFixed(2)}
      </span>
    </span>
  );
}
