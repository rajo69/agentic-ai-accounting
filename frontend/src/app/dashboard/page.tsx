"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  RefreshCw,
  Tag,
  GitCompare,
  Unlink2,
  Loader2,
} from "lucide-react";
import {
  getDashboardSummary,
  triggerSync,
  submitCategoriseJob,
  submitReconcileJob,
  pollJob,
  getJob,
  type DashboardSummary,
} from "@/lib/api";
import { KpiTile } from "@/components/ui/kpi-tile";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { StatusChip } from "@/components/ui/status-chip";
import { PageHeader } from "@/components/app/page-header";
import { cn } from "@/lib/utils";
import { isDemo } from "@/demo/flag";
import { Skeleton } from "@/components/app/skeleton";
import { uiTransition } from "@/lib/motion";

// ── Count-up hook ─────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof target !== "number") return;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * ease));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return value;
}

/** Mono numeral that counts up to its target (DESIGN.md section 6: the one counting animation). */
function Counted({ value }: { value: number }) {
  const counted = useCountUp(value);
  return <>{counted.toLocaleString("en-GB")}</>;
}

// ── Pipeline row ──────────────────────────────────────────────────────────────

interface ActionRowProps {
  index: number;
  label: string;
  description: string;
  loadingLabel: string;
  icon: React.ElementType;
  loading: boolean;
  onClick: () => void;
  variant?: "primary" | "secondary";
}

function ActionRow({ index, label, description, loadingLabel, icon: Icon, loading, onClick, variant = "secondary" }: ActionRowProps) {
  return (
    <li className="flex flex-col justify-center gap-3 px-5 py-5 sm:flex-row sm:items-center sm:gap-4">
      <span className="hidden size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-muted-foreground sm:flex">
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-xs tabular-nums text-subtle-foreground">{String(index).padStart(2, "0")}</span>
          <span className="text-sm font-medium text-foreground">{label}</span>
        </div>
        <p className="mt-0.5 text-small text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-3 sm:shrink-0">
        <Button
          variant={loading ? "running" : variant === "primary" ? "default" : "outline"}
          size="sm"
          onClick={onClick}
          disabled={loading}
          aria-busy={loading || undefined}
          data-state={loading ? "running" : "idle"}
          className="min-w-36"
        >
          {loading ? <Loader2 className="animate-spin" /> : <Icon />}
          {/* Both labels share one grid cell, so the button keeps one width in both states. */}
          <span className="grid">
            <span className={cn("col-start-1 row-start-1", loading && "invisible")}>{label}</span>
            <span className={cn("col-start-1 row-start-1", !loading && "invisible")}>{loadingLabel}</span>
          </span>
        </Button>
      </div>
    </li>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [categorising, setCategorising] = useState(false);
  const [reconciling, setReconciling] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const fetchSummary = useCallback(async () => {
    try {
      const data = await getDashboardSummary();
      setSummary(data);
      setError(false);
    } catch {
      setError(true);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  // First-run onboarding: if we were redirected here from OAuth with an
  // initial sync job queued, poll it and show progress.
  useEffect(() => {
    const jobId = typeof window !== "undefined"
      ? sessionStorage.getItem("first_sync_job_id")
      : null;
    if (!jobId) return;
    sessionStorage.removeItem("first_sync_job_id");

    (async () => {
      const tid = toast.loading(
        isDemo() ? "Importing your Xero data…" : "Importing your Xero data… this may take a minute.",
      );
      setSyncing(true);
      try {
        // Intermediate progress checks — useful for a long sync
        const intervalId = setInterval(async () => {
          try {
            const j = await getJob(jobId);
            if (j.status === "running" && j.progress_total > 0) {
              toast.loading(
                `Importing… ${j.progress_current} / ${j.progress_total}`,
                { id: tid },
              );
            }
          } catch { /* ignore — pollJob below will surface the real error */ }
        }, 2000);

        const job = await pollJob(jobId, { intervalMs: 1500 });
        clearInterval(intervalId);
        const r = job.result as { synced_accounts?: number; synced_transactions?: number } | null;
        toast.success(
          `Welcome! Imported ${r?.synced_accounts ?? 0} accounts and ${r?.synced_transactions ?? 0} transactions from Xero.`,
          { id: tid },
        );
        await fetchSummary();
      } catch (e) {
        toast.error(`First sync failed: ${e instanceof Error ? e.message : String(e)}. You can retry with the Sync button.`, { id: tid });
      } finally {
        setSyncing(false);
      }
    })();
  }, [fetchSummary]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await triggerSync();
      toast.success(`Sync complete: ${res.synced_transactions} transactions, ${res.synced_accounts} accounts`);
      await fetchSummary();
    } catch (e) { toast.error(String(e)); } finally { setSyncing(false); }
  };

  const handleCategorise = async () => {
    setCategorising(true);
    const tid = toast.loading("Starting categorisation…");
    try {
      const { job_id } = await submitCategoriseJob();
      toast.loading("Categorising transactions…", { id: tid });
      const job = await pollJob(job_id, { intervalMs: 1500 });
      const r = job.result as { total_processed?: number; auto_categorised?: number; suggested?: number } | null;
      toast.success(
        `Categorised ${r?.total_processed ?? 0}: ${r?.auto_categorised ?? 0} auto, ${r?.suggested ?? 0} suggested`,
        { id: tid },
      );
      await fetchSummary();
    } catch (e) { toast.error(String(e), { id: tid }); } finally { setCategorising(false); }
  };

  const handleReconcile = async () => {
    setReconciling(true);
    const tid = toast.loading("Starting reconciliation…");
    try {
      const { job_id } = await submitReconcileJob();
      toast.loading("Matching bank statements…", { id: tid });
      const job = await pollJob(job_id, { intervalMs: 1500 });
      const r = job.result as { total_processed?: number; auto_matched?: number; suggested?: number } | null;
      toast.success(
        `Reconciled ${r?.total_processed ?? 0}: ${r?.auto_matched ?? 0} auto, ${r?.suggested ?? 0} suggested`,
        { id: tid },
      );
      await fetchSummary();
    } catch (e) { toast.error(String(e), { id: tid }); } finally { setReconciling(false); }
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-[108px] rounded-lg bg-surface" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-lg bg-surface" />
      </div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={uiTransition}
        className="flex h-[60vh] flex-col items-center justify-center gap-6"
      >
        <div className="flex size-12 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground">
          <Unlink2 className="size-5" strokeWidth={1.75} />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-medium tracking-[-0.01em] text-foreground">Xero not connected.</h2>
          <p className="mt-1 text-small text-muted-foreground">Connect a Xero organisation to sync its books into the review console.</p>
        </div>
        <Button nativeButton={false} render={<a href={`${API_BASE}/auth/xero/connect`} />}>
          Connect Xero
        </Button>
      </motion.div>
    );
  }

  const isFirstRun = !summary?.last_sync_at && (summary?.total_transactions ?? 0) === 0;

  const lastSync = summary?.last_sync_at
    ? new Date(summary.last_sync_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
    : "Never";

  const uncategorised = summary?.uncategorised_count ?? 0;
  const unreconciled = summary?.unreconciled_count ?? 0;
  const totalTx = summary?.total_transactions ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={uiTransition}
      className="space-y-8"
    >
      {/* Header */}
      <PageHeader
        title={summary?.organisation_name ?? "Dashboard"}
        meta={<>Last sync {lastSync}</>}
        chip={isFirstRun ? <StatusChip tone="info" dot={false}>First run</StatusChip> : undefined}
      />

      {/* First-run prompt */}
      {isFirstRun && (
        <div className="flex items-start gap-4 rounded-lg border border-border bg-surface p-5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-muted-foreground">
            {syncing
              ? <Loader2 className="size-4 animate-spin" />
              : <RefreshCw className="size-4" strokeWidth={1.75} />}
          </span>
          <div className="min-w-0 flex-1">
            {syncing ? (
              <>
                <p className="text-sm font-medium text-foreground">Importing the books.</p>
                <p className="mt-0.5 text-small text-muted-foreground">
                  Accounts and transactions are being read from Xero in the background. This usually takes under a minute.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground">Connected. Run the first sync.</p>
                <p className="mt-0.5 text-small text-muted-foreground">
                  Sync imports the chart of accounts and the quarter&apos;s transactions; Categorise then codes each one with evidence.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile
          label="Accounts"
          value={<Counted value={summary?.total_accounts ?? 0} />}
          delta="Chart of accounts"
        />
        <KpiTile
          label="Transactions"
          value={<Counted value={totalTx} />}
          delta={totalTx > 0 ? "Imported from Xero" : "Nothing imported yet"}
        />
        <KpiTile
          label="Uncategorised"
          value={<Counted value={uncategorised} />}
          delta={totalTx === 0 ? "Sync first" : uncategorised > 0 ? "Awaiting categorisation" : "All categorised"}
          deltaTone={totalTx > 0 && uncategorised === 0 ? "success" : "muted"}
        />
        <KpiTile
          label="Unreconciled"
          value={<Counted value={unreconciled} />}
          delta={totalTx === 0 ? "Sync first" : unreconciled > 0 ? "Awaiting a bank match" : "All reconciled"}
          deltaTone={totalTx > 0 && unreconciled === 0 ? "success" : "muted"}
        />
      </div>

      {/* Pipeline */}
      <Card className="gap-0 pb-0">
        <CardHeader className="border-b pb-5">
          <Eyebrow>Pipeline</Eyebrow>
          <p className="text-sm text-muted-foreground">Three steps, each one a job you can watch. Every AI decision writes an audit row.</p>
        </CardHeader>
        <CardContent className="px-0">
          <ul className="grid auto-rows-fr divide-y divide-border">
            <ActionRow
              index={1}
              label="Sync"
              description="Read the chart of accounts, transactions and bank statement lines from Xero."
              loadingLabel="Syncing…"
              icon={RefreshCw}
              loading={syncing}
              onClick={handleSync}
              variant="primary"
            />
            <ActionRow
              index={2}
              label="Categorise"
              description="Code every uncategorised transaction with a confidence, a reasoning and a risk score."
              loadingLabel="Categorising…"
              icon={Tag}
              loading={categorising}
              onClick={handleCategorise}
            />
            <ActionRow
              index={3}
              label="Reconcile"
              description="Match bank statement lines to transactions; suggestions wait for a human."
              loadingLabel="Reconciling…"
              icon={GitCompare}
              loading={reconciling}
              onClick={handleReconcile}
            />
          </ul>
        </CardContent>
      </Card>
    </motion.div>
  );
}
