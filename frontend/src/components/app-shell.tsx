"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Lockup } from "@/components/brand/logo";
import Sidebar from "@/components/sidebar";
import ErrorBoundary from "@/components/error-boundary";
import DemoBanner from "@/components/demo-banner";

const APP_ROUTES = ["/dashboard", "/transactions", "/reconciliation", "/documents", "/team", "/settings"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const showSidebar = APP_ROUTES.some((r) => pathname.startsWith(r));

  if (!showSidebar) return <ErrorBoundary>{children}</ErrorBoundary>;

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar onNavigate={() => {}} />
      </div>

      {/* Mobile sidebar drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-60 max-w-[240px] p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar: the demo banner sits below it, so nothing overlaps */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-2 md:hidden">
          <Button variant="ghost" size="icon-sm" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
            <Menu />
          </Button>
          <Lockup />
        </div>

        <DemoBanner />

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1280px] px-4 py-6 md:px-8 md:py-8">
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
