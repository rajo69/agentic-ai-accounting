"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { exitDemo } from "@/demo/flag";
import { Lockup } from "@/components/brand/logo";

function CallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const token = params.get("token");
    const firstSyncJob = params.get("first_sync_job");
    if (token) {
      exitDemo({ silent: true }); // a real session always wins over a demo one
      localStorage.setItem("session_token", token);
      // Set a plain cookie so the middleware can detect the session
      document.cookie = "has_session=1; path=/; SameSite=Lax; Max-Age=86400";
      // Pass the initial sync job id through sessionStorage so the dashboard
      // can poll it and show progress on first load.
      if (firstSyncJob) {
        sessionStorage.setItem("first_sync_job_id", firstSyncJob);
      }
      router.replace("/dashboard");
    } else {
      router.replace("/");
    }
  }, [params, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-foreground">
      <Lockup size={22} />
      <div className="flex items-center gap-3" role="status" aria-live="polite">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <p className="font-mono text-xs text-muted-foreground">Connecting your Xero organisation</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <CallbackHandler />
    </Suspense>
  );
}
