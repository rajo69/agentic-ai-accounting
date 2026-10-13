"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Lockup } from "@/components/brand/logo";
import { exitDemo, isDemo } from "@/demo/flag";
import {
  LayoutDashboard,
  ArrowLeftRight,
  GitCompare,
  FileText,
  Users,
  Settings,
  LogOut,
} from "lucide-react";

/** Settings ships in demo mode only (S0 decision 4), so its item renders only when `isDemo()`. */
const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/reconciliation", label: "Reconciliation", icon: GitCompare },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/team", label: "Team", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings, demoOnly: true },
];

const itemClass =
  "flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-sm font-medium outline-none transition-colors duration-150 ease-out-quart focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

interface SidebarProps {
  onNavigate?: () => void;
}

export default function Sidebar({ onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  // Demo flag read after mount so server and client render the same markup.
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    setDemo(isDemo());
  }, []);

  function handleLogout() {
    localStorage.removeItem("session_token");
    document.cookie = "has_session=; Max-Age=0; path=/";
    router.push("/");
  }

  return (
    <aside className="flex h-full w-60 flex-shrink-0 flex-col border-r border-border bg-surface">
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center px-5">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          aria-label="AI Accountant dashboard"
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <Lockup />
        </Link>
      </div>

      {/* Nav */}
      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 px-3 pt-1">
        {navItems.map(({ href, label, icon: Icon, demoOnly }) => {
          if (demoOnly && !demo) return null;
          const active = href === "/dashboard" ? pathname.startsWith("/dashboard") : pathname === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                itemClass,
                active
                  ? "bg-surface-2 text-foreground shadow-[inset_2px_0_0_0_hsl(var(--primary))]"
                  : "text-muted-foreground hover:bg-surface-2/60 hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" strokeWidth={1.75} />
              {label}
              {demoOnly && (
                <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.08em] text-subtle-foreground">
                  demo
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="flex flex-col gap-1 border-t border-border p-3">
        <button
          type="button"
          onClick={demo ? () => exitDemo() : handleLogout}
          className={cn(itemClass, "text-muted-foreground hover:bg-surface-2/60 hover:text-foreground")}
        >
          <LogOut className="size-4 shrink-0" strokeWidth={1.75} />
          {demo ? "Exit demo" : "Sign out"}
        </button>
        <p className="px-2.5 pt-1 font-mono text-[11px] text-subtle-foreground">v0.2.8</p>
      </div>
    </aside>
  );
}
