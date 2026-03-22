"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  getDashboardSummary,
  triggerSync,
  triggerCategorise,
  triggerReconcile,
  type DashboardSummary,
} from "@/lib/api";

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [categorising, setCategorising] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [notConnected, setNotConnected] = useState(false);

  const fetchSummary = useCallback(async () => {
    try {
      const data = await getDashboardSummary();
      setSummary(data);
      setNotConnected(false);
    } catch {
      setNotConnected(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await triggerSync();
      toast.success(
        `Sync complete — ${res.synced_transactions} transactions, ${res.synced_accounts} accounts`
      );
      await fetchSummary();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSyncing(false);
    }
  };

  const handleCategorise = async () => {
    setCategorising(true);
    try {
      const res = await triggerCategorise();
      toast.success(
        `Categorised ${res.total_processed} — ${res.auto_categorised} auto, ${res.suggested} suggested, ${res.needs_review} review`
      );
      await fetchSummary();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setCategorising(false);
    }
  };

  const handleReconcile = async () => {
    setReconciling(true);
    try {
      const res = await triggerReconcile();
      toast.success(
        `Reconciled ${res.total_processed} — ${res.auto_matched} auto, ${res.suggested} suggested, ${res.needs_review} review`
      );
      await fetchSummary();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setReconciling(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  if (notConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-gray-600 text-sm">
          No Xero account connected yet.
        </p>
        <a href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/auth/xero/connect`}>
          <Button>Connect with Xero</Button>
        </a>
      </div>
    );
  }

  const stats = [
    { label: "Total Transactions", value: summary?.total_transactions ?? 0 },
    { label: "Uncategorised", value: summary?.uncategorised_count ?? 0 },
    { label: "Unreconciled", value: summary?.unreconciled_count ?? 0 },
    {
      label: "Last Sync",
      value: summary?.last_sync_at
        ? new Date(summary.last_sync_at).toLocaleString("en-GB", {
            dateStyle: "short",
            timeStyle: "short",
          })
        : "Never",
    },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        {summary?.organisation_name && (
          <p className="text-sm text-gray-500 mt-0.5">{summary.organisation_name}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map(({ label, value }) => (
          <Card key={label}>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-gray-500">{label}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <span className="text-2xl font-bold text-gray-900">{value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap">
        <Button onClick={handleSync} disabled={syncing}>
          {syncing ? "Syncing…" : "Sync with Xero"}
        </Button>
        <Button onClick={handleCategorise} disabled={categorising} variant="outline">
          {categorising ? "Categorising…" : "Categorise All"}
        </Button>
        <Button onClick={handleReconcile} disabled={reconciling} variant="outline">
          {reconciling ? "Reconciling…" : "Reconcile All"}
        </Button>
      </div>
    </div>
  );
}
