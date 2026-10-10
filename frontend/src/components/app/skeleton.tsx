import { cn } from "@/lib/utils";

/** Pulsing placeholder block; pass a width class or style. */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden className={cn("animate-pulse rounded-sm bg-surface-2", className)} style={style} />;
}
