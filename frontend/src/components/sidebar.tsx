"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/reconciliation", label: "Reconciliation" },
  { href: "/documents", label: "Documents" },
  { href: "/settings", label: "Settings", soon: true },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-56 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
      <div className="h-16 flex items-center px-5 border-b border-gray-200">
        <span className="font-semibold text-base tracking-tight">AI Accountant</span>
      </div>
      <nav className="flex-1 py-4 space-y-0.5 px-3">
        {navItems.map(({ href, label, soon }) => (
          <Link
            key={href}
            href={soon ? "#" : href}
            className={cn(
              "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors",
              pathname === href
                ? "bg-gray-100 text-gray-900"
                : "text-gray-500 hover:bg-gray-50 hover:text-gray-900",
              soon && "pointer-events-none opacity-50"
            )}
          >
            {label}
            {soon && (
              <span className="text-[10px] bg-gray-100 text-gray-400 rounded px-1.5 py-0.5">
                Soon
              </span>
            )}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
