"use client";

import type { ReactNode } from "react";
import { ArrowLeftRight, FileText, GitCompare, LayoutDashboard, Settings, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { Lockup } from "@/components/brand/logo";

import { ORG } from "./data";

export type ShellPage = "dashboard" | "transactions" | "reconciliation" | "documents" | "team" | "settings";

const NAV: { id: ShellPage; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "transactions", label: "Transactions", icon: ArrowLeftRight },
  { id: "reconciliation", label: "Reconciliation", icon: GitCompare },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "team", label: "Team", icon: Users },
  { id: "settings", label: "Settings", icon: Settings },
];

/**
 * The app shell as DESIGN.md section 7 and 10 specify it (sidebar, demo banner, content area),
 * drawn at the frame's design size. Decorative: the frame is aria-hidden.
 */
export function Shell({ active, children }: { active: ShellPage; children: ReactNode }) {
  return (
    <div className="flex h-full w-full bg-background text-sm text-foreground">
      <aside className="flex w-[208px] shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex h-14 items-center px-5">
          <Lockup />
        </div>
        <nav className="flex flex-col gap-0.5 px-3">
          {NAV.map((item) => (
            <span
              key={item.id}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-muted-foreground",
                active === item.id && "bg-surface-2 text-foreground shadow-[inset_2px_0_0_0_hsl(var(--primary))]"
              )}
            >
              <item.icon className="size-4" strokeWidth={1.75} />
              {item.label}
            </span>
          ))}
        </nav>
        <div className="mt-auto border-t border-border px-5 py-4">
          <div className="truncate text-small text-foreground">{ORG.name}</div>
          <div className="font-mono text-xs text-muted-foreground">{ORG.periodLabel}</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-border bg-surface-2 px-4 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          <span>Demo with synthetic data · nothing is written to Xero</span>
          <span className="flex items-center gap-4">
            <span>Reset demo</span>
            <span className="text-foreground">Connect Xero</span>
          </span>
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
