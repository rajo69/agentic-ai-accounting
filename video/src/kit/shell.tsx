import type { ReactNode } from "react";
import { colors, fonts } from "../theme";
import { CONSOLE } from "../layout";
import { Lockup } from "./brand";
import { ORG } from "../scenes/data";

export type ShellPage = "dashboard" | "transactions" | "reconciliation" | "documents" | "team" | "settings";

const NAV: { id: ShellPage; label: string; icon: ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <Icon d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z" /> },
  { id: "transactions", label: "Transactions", icon: <Icon d="M4 7h13M13 3l4 4-4 4M20 17H7M11 13l-4 4 4 4" /> },
  { id: "reconciliation", label: "Reconciliation", icon: <Icon d="M8 3v12a4 4 0 0 0 4 4h4M16 3v18M12 7l4-4 4 4" /> },
  { id: "documents", label: "Documents", icon: <Icon d="M6 2h8l5 5v15H6zM14 2v5h5M9 13h6M9 17h6" /> },
  { id: "team", label: "Team", icon: <Icon d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /> },
  { id: "settings", label: "Settings", icon: <Icon d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1" /> },
];

function Icon({ d }: { d: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/** The app shell at the console's design size: sidebar 208, demo banner 32, content area below. */
export function Shell({ active, children }: { active: ShellPage; children: ReactNode }) {
  return (
    <div style={{ display: "flex", width: CONSOLE.designW, height: CONSOLE.designH, background: colors.background, color: colors.foreground, fontFamily: fonts.sans, fontSize: 13 }}>
      <aside style={{ display: "flex", flexDirection: "column", width: 208, flexShrink: 0, borderRight: `1px solid ${colors.border}`, background: colors.surface }}>
        <div style={{ display: "flex", alignItems: "center", height: 56, padding: "0 20px" }}>
          <Lockup size={20} id="shell-lockup" />
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 12px" }}>
          {NAV.map((item) => {
            const isActive = item.id === active;
            return (
              <span
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  height: 36,
                  padding: "0 10px",
                  borderRadius: 6,
                  color: isActive ? colors.foreground : colors.mutedForeground,
                  background: isActive ? colors.surface2 : "transparent",
                  boxShadow: isActive ? `inset 2px 0 0 0 ${colors.primary}` : undefined,
                }}
              >
                {item.icon}
                {item.label}
              </span>
            );
          })}
        </nav>
        <div style={{ marginTop: "auto", borderTop: `1px solid ${colors.border}`, padding: "16px 20px" }}>
          <div style={{ fontSize: 13, color: colors.foreground, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ORG.name}</div>
          <div style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.mutedForeground }}>{ORG.periodLabel}</div>
        </div>
      </aside>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 32,
            flexShrink: 0,
            padding: "0 16px",
            borderBottom: `1px solid ${colors.border}`,
            background: colors.surface2,
            fontFamily: fonts.mono,
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: colors.mutedForeground,
          }}
        >
          <span>Demo with synthetic data · nothing is written to Xero</span>
          <span style={{ display: "flex", gap: 16 }}>
            <span>Reset demo</span>
            <span style={{ color: colors.foreground }}>Connect Xero</span>
          </span>
        </div>
        <div style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden" }}>{children}</div>
      </div>
    </div>
  );
}

/** Page title row inside the frame: title, mono meta, right-hand actions. */
export function SceneHeader({ title, meta, chip, children }: { title: string; meta?: string; chip?: ReactNode; children?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, height: 64, flexShrink: 0, padding: "0 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: "-0.01em", color: colors.foreground, whiteSpace: "nowrap" }}>{title}</div>
          {meta && <div style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.mutedForeground, whiteSpace: "nowrap" }}>{meta}</div>}
        </div>
        {chip}
      </div>
      {children && <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>{children}</div>}
    </div>
  );
}
