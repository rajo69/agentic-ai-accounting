"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusChip } from "@/components/ui/status-chip";
import { Eyebrow } from "@/components/ui/eyebrow";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Search,
  Link2,
  GitCompare,
} from "lucide-react";
import {
  getBankStatements,
  getBankStatement,
  confirmMatch,
  unmatch,
  manualMatch,
  getTransactions,
  type BankStatement,
  type BankStatementDetail,
  type Transaction,
} from "@/lib/api";
import { ExplanationPanel } from "@/components/explanation-panel";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { PanelSection } from "@/components/app/panel-section";
import { MiniBar, toneForScore } from "@/components/app/mini-bar";
import { Skeleton } from "@/components/app/skeleton";
import { uiTransition } from "@/lib/motion";

// ── Status filter ─────────────────────────────────────────────────────────────

const MATCH_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "unmatched", label: "Unmatched" },
  { value: "suggested", label: "Suggested" },
  { value: "auto_matched", label: "Auto-matched" },
  { value: "confirmed", label: "Confirmed" },
];
const MATCH_ITEMS: Record<string, string> = Object.fromEntries([
  ["", "All statuses"],
  ...MATCH_OPTIONS.map((o) => [o.value, o.label]),
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAmount(amount: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(parseFloat(amount));
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtPct(n: number) {
  return `${(n * 100).toFixed(0)}%`;
}

function onActivate(fn: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); }
  };
}

const rowClass =
  "flex w-full cursor-pointer flex-col justify-center gap-1 border-b border-border px-4 py-3 text-left outline-none transition-colors duration-150 ease-out-quart last:border-b-0 hover:bg-surface-2/60 focus-visible:bg-surface-2/60 focus-visible:shadow-[inset_2px_0_0_0_hsl(var(--ring))]";

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReconciliationPage() {
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [matchStatus, setMatchStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<BankStatementDetail | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [txSearch, setTxSearch] = useState("");
  const [txResults, setTxResults] = useState<Transaction[]>([]);
  const [txSearching, setTxSearching] = useState(false);

  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBankStatements({ page, page_size: PAGE_SIZE, match_status: matchStatus || undefined });
      setStatements(res.items);
      setTotal(res.total);
    } catch (e) { toast.error(String(e)); } finally { setLoading(false); }
  }, [page, matchStatus]);

  useEffect(() => { load(); }, [load]);

  const openStatement = async (id: string) => {
    try {
      const detail = await getBankStatement(id);
      setSelected(detail);
    } catch (e) { toast.error(String(e)); }
  };

  const handleConfirm = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await confirmMatch(selected.id);
      toast.success("Match confirmed");
      load(); setSelected(null);
    } catch (e) { toast.error(String(e)); } finally { setActionLoading(false); }
  };

  const handleUnmatch = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await unmatch(selected.id);
      toast.success("Match removed");
      load(); setSelected(null);
    } catch (e) { toast.error(String(e)); } finally { setActionLoading(false); }
  };

  const handleManualMatch = async (txId: string) => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await manualMatch(selected.id, txId);
      toast.success("Manually matched");
      load(); setSearchOpen(false); setSelected(null);
    } catch (e) { toast.error(String(e)); } finally { setActionLoading(false); }
  };

  const searchTransactions = async () => {
    if (!txSearch.trim()) return;
    setTxSearching(true);
    try {
      const res = await getTransactions({ search: txSearch, page_size: 10 });
      setTxResults(res.items);
    } catch (e) { toast.error(String(e)); } finally { setTxSearching(false); }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={uiTransition}
      className="space-y-6"
    >
      {/* Header */}
      <PageHeader
        title="Reconciliation"
        meta={total > 0 ? `${total.toLocaleString("en-GB")} statement lines · page ${page} of ${Math.max(totalPages, 1)}` : "Match bank statement lines to transactions"}
      >
        <Select
          value={matchStatus}
          onValueChange={(v) => { setMatchStatus(v === "all" ? "" : v ?? ""); setPage(1); }}
          items={MATCH_ITEMS}
        >
          <SelectTrigger className="w-44" aria-label="Filter by match status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            {MATCH_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* Left pane: statement lines */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            {loading ? (
              <ul>
                {[...Array(6)].map((_, i) => (
                  <li key={i} className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0">
                    <div className="flex items-center justify-between gap-3">
                      <Skeleton className="h-3 w-2/3" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-[22px] w-20" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : statements.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={<GitCompare />}
                title="No bank statement lines."
                hint={matchStatus
                  ? "Try a different filter."
                  : "Sync with Xero to import statement lines, then run Reconcile from the dashboard."}
              />
            ) : (
              <ul>
                {statements.map((s) => {
                  const isSelected = selected?.id === s.id;
                  return (
                    <li key={s.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-pressed={isSelected}
                        onClick={() => openStatement(s.id)}
                        onKeyDown={onActivate(() => openStatement(s.id))}
                        className={cn(rowClass, isSelected && "bg-surface-2 shadow-[inset_2px_0_0_0_hsl(var(--primary))]")}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="min-w-0 flex-1 truncate text-table font-medium text-foreground">{s.description}</span>
                          <span className="shrink-0 font-mono text-table tabular-nums text-foreground">{fmtAmount(s.amount)}</span>
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="font-mono text-xs text-muted-foreground">{fmtDate(s.date)}</span>
                          <StatusChip status={s.match_status} />
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft /> Previous
              </Button>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight />
              </Button>
            </div>
          )}
        </div>

        {/* Right pane: detail */}
        <div className="min-w-0">
          {selected ? (
            <div key={selected.id} className="flex min-w-0 flex-col rounded-lg border border-border bg-surface">
              {/* Statement info + actions */}
              <div className="flex flex-col gap-4 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 truncate text-base font-medium tracking-[-0.01em] text-foreground">{selected.description}</p>
                    <StatusChip status={selected.match_status} />
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {fmtDate(selected.date)} · {fmtAmount(selected.amount)}
                    {selected.reference && <> · {selected.reference}</>}
                    {selected.match_confidence && <> · match {fmtPct(parseFloat(selected.match_confidence))}</>}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {selected.match_status === "unmatched" && (
                    <Button size="sm" variant="outline" onClick={() => { setTxSearch(""); setTxResults([]); setSearchOpen(true); }}>
                      <Link2 /> Manual search
                    </Button>
                  )}
                  {selected.match_status !== "unmatched" && (
                    <Button size="sm" variant="destructive" onClick={handleUnmatch} disabled={actionLoading}>
                      <X /> Unmatch
                    </Button>
                  )}
                  {(selected.match_status === "suggested" || selected.match_status === "auto_matched") && (
                    <Button size="sm" onClick={handleConfirm} disabled={actionLoading}>
                      <Check /> Confirm match
                    </Button>
                  )}
                </div>
              </div>

              {/* Match candidates */}
              {selected.candidates.length > 0 ? (
                <div className="flex flex-col gap-3 px-3 py-4">
                  <Eyebrow className="px-2 text-muted-foreground">Candidates</Eyebrow>
                  <Table className="min-w-[560px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="px-2">Record</TableHead>
                        <TableHead className="w-[104px] px-2 text-right">Amount</TableHead>
                        <TableHead className="w-[84px] px-2">Amount</TableHead>
                        <TableHead className="w-[84px] px-2">Date</TableHead>
                        <TableHead className="w-[84px] px-2">Text</TableHead>
                        <TableHead className="w-[96px] px-2">Combined</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selected.candidates.map((c) => {
                        const isMatched = selected.matched_transaction_id === c.transaction_id;
                        return (
                          <TableRow key={c.transaction_id} data-state={isMatched ? "selected" : undefined} className="h-12">
                            <TableCell className="max-w-0 px-2">
                              <span className="flex min-w-0 flex-col leading-tight">
                                <span className="truncate text-small text-foreground">{c.description}</span>
                                <span className="truncate font-mono text-xs text-muted-foreground">{fmtDate(c.date)}</span>
                              </span>
                            </TableCell>
                            <TableCell className="px-2 text-right font-mono tabular-nums text-foreground">{fmtAmount(c.amount)}</TableCell>
                            <TableCell className="px-2"><MiniBar value={c.amount_score} tone={toneForScore(c.amount_score)} width="w-6" compact /></TableCell>
                            <TableCell className="px-2"><MiniBar value={c.date_score} tone={toneForScore(c.date_score)} width="w-6" compact /></TableCell>
                            <TableCell className="px-2"><MiniBar value={c.description_score} tone={toneForScore(c.description_score)} width="w-6" compact /></TableCell>
                            <TableCell className="px-2">
                              <span className={cn("font-mono text-small tabular-nums", isMatched ? "text-foreground" : "text-muted-foreground")}>
                                {c.combined_score.toFixed(2)}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="px-5 py-4 text-small text-muted-foreground">
                  No candidates scored for this line. Use manual search to pick a transaction.
                </p>
              )}

              {/* Matched transaction AI explanation */}
              {selected.matched_transaction_id && (
                <div className="border-t border-border px-5 py-5">
                  <PanelSection eyebrow="Matched transaction">
                    <ExplanationPanel transactionId={selected.matched_transaction_id} inline />
                  </PanelSection>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              icon={<GitCompare />}
              title="Select a statement line."
              hint="Its scored candidates, the matched transaction and the actions appear here."
              className="min-h-[240px]"
            />
          )}
        </div>
      </div>

      {/* Manual match search dialog */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Find a transaction to match</DialogTitle>
            <DialogDescription>Search by description, then choose the record this statement line settles.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
                <label htmlFor="match-search" className="sr-only">Search transactions</label>
                <Input
                  id="match-search"
                  placeholder="Search by description"
                  className="pl-9"
                  value={txSearch}
                  onChange={(e) => setTxSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchTransactions()}
                />
              </div>
              <Button onClick={searchTransactions} disabled={txSearching} className="shrink-0">
                {txSearching ? "Searching" : "Search"}
              </Button>
            </div>
            {txResults.length > 0 && (
              <ul className="max-h-64 overflow-y-auto rounded-md border border-border">
                {txResults.map((tx) => (
                  <li key={tx.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      className={cn(rowClass, "flex-row items-center justify-between gap-3 py-2.5")}
                      onClick={() => handleManualMatch(tx.id)}
                      onKeyDown={onActivate(() => handleManualMatch(tx.id))}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-small font-medium text-foreground">{tx.description}</span>
                        <span className="block font-mono text-xs text-muted-foreground">{fmtDate(tx.date)}</span>
                      </span>
                      <span className="shrink-0 font-mono text-small tabular-nums text-foreground">{fmtAmount(tx.amount)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
