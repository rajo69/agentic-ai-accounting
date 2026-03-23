"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ArrowLeftRight,
  GitCompare,
  FileText,
  Settings,
  Sparkles,
  LogOut,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/reconciliation", label: "Reconciliation", icon: GitCompare },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings, soon: true },
];

interface SidebarProps {
  onNavigate?: () => void;
}

export default function Sidebar({ onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    localStorage.removeItem("session_token");
    document.cookie = "has_session=; Max-Age=0; path=/";
    router.push("/");
  }

  return (
    <aside className="w-60 flex-shrink-0 bg-[#0C0E14] flex flex-col border-r border-white/[0.06] h-screen">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-[15px] text-white tracking-tight">
            AI Accountant
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon, soon }) => {
          const active = href === "/dashboard" ? pathname.startsWith("/dashboard") : pathname === href;
          return (
            <Link
              key={href}
              href={soon ? "#" : href}
              onClick={soon ? undefined : onNavigate}
              className={cn(
                "group relative flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                active
                  ? "text-white"
                  : "text-slate-400 hover:text-white hover:bg-white/[0.05]",
                soon && "pointer-events-none opacity-40"
              )}
            >
              {active && (
                <motion.div
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-lg bg-indigo-600"
                  transition={{ type: "spring", stiffness: 400, damping: 35 }}
                />
              )}
              <span className="relative flex items-center gap-3">
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </span>
              {soon && (
                <span className="relative text-[10px] bg-white/10 text-slate-400 rounded px-1.5 py-0.5">
                  Soon
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-white/[0.06] space-y-1">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.05] transition-all duration-150"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Disconnect Xero
        </button>
        <p className="text-[11px] text-slate-600 text-center pt-1">v0.1.0 · Beta</p>
      </div>
    </aside>
  );
}
