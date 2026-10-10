"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { enterDemo } from "@/demo/flag";

/**
 * `/demo` starts (or restarts) demo mode and lands on the dashboard.
 * Default: the first-run import plays as it would after a real Xero login.
 * `?skip_onboarding=1`: the quarter is already imported and categorised.
 */
function DemoEntry() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const skip = params.get("skip_onboarding") === "1";
      enterDemo({ skipOnboarding: skip });
      const { resetDemoState } = await import("@/demo");
      resetDemoState({ populated: skip });
      if (!cancelled) router.replace("/dashboard");
    })();
    return () => {
      cancelled = true;
    };
  }, [params, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="font-mono text-xs text-muted-foreground">Preparing the demo…</p>
    </div>
  );
}

export default function DemoPage() {
  return (
    <Suspense>
      <DemoEntry />
    </Suspense>
  );
}
