"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusChip } from "@/components/ui/status-chip";
import { ConfidenceMeter } from "@/components/ui/confidence-meter";
import { toast } from "sonner";
import { Search, ChevronLeft, ChevronRight, Check, X, Layers } from "lucide-react";
import {
  getTransactions,
  getTransaction,
  approveTransaction,
  rejectTransaction,
  correctTransaction,
  getChartOfAccounts,
  type ChartAccount,
  type Transaction,
  type TransactionDetail,
} from "@/lib/api";
import { ExplanationPanel } from "@/components/explanation-panel";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Skeleton } from "@/components/app/skeleton";
import { uiTransition } from "@/lib/motion";

// ── Status filter ─────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "uncategorised", label: "Uncategorised" },
  { value: "suggested", label: "Suggested" },
  { value: "auto_categorised", label: "Auto-categorised" },
  { value: "confirmed", label: "Confirmed" },
  { value: "needs_review", label: "Needs review" },
  { value: "rejected", label: "Rejected" },
];
/** Base UI renders the raw value in the trigger unless the root knows the labels. */
const STATUS_ITEMS: Record<string, string> = Object.fromEntries([
  ["", "All statuses"],
  ...STATUS_OPTIONS.map((o) => [o.value, o.label]),
]);

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtAmount(amount: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(parseFloat(amount));
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** The primary model id when the latest AI categorisation was escalated to a stronger model. */
function escalationOf(detail: TransactionDetail): string | null {
  const entry = detail.audit_history.find((a) => a.action === "ai_categorise" && a.ai_decision_data?.escalated === true);
  const primary = entry?.ai_decision_data?.primary_model;
  return typeof primary === "string" ? primary : null;
}

function accountLabel(a: ChartAccount) {
  return a.code ? `${a.code} · ${a.name}` : a.name;
}

/** Fixed skeleton widths (percent) so the loading state is identical on every render. */
const SKELETON_WIDTHS = [64, 88, 56, 72, 90, 60, 0];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const [items, setItems] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<TransactionDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [correctCategory, setCorrectCategory] = useState("");
  const [chart, setChart] = useState<ChartAccount[] | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getTransactions({
        page,
        page_size: PAGE_SIZE,
        search: search || undefined,
        status: status || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id: string) => {
    try {
      const detail = await getTransaction(id);
      setSelected(detail);
      setDetailOpen(true);
    } catch (e) { toast.error(String(e)); }
  };

  const handleApprove = async (id: string) => {
    setActionLoading(true);
    try {
      await approveTransaction(id);
      toast.success("Category confirmed");
      load();
      setDetailOpen(false);
    } catch (e) { toast.error(String(e)); } finally { setActionLoading(false); }
  };

  const handleReject = async (id: string) => {
    setActionLoading(true);
    try {
      await rejectTransaction(id);
      toast.success("Rejected. Transaction is uncategorised again.");
      load();
      setDetailOpen(false);
    } catch (e) { toast.error(String(e)); } finally { setActionLoading(false); }
  };

  const openCorrect = (current: string | null) => {
    setCorrectCategory(current ?? "");
    setCorrectOpen(true);
    getChartOfAccounts().then(setChart, () => setChart(null));
  };

  /** With a chart loaded, only one of its accounts can be saved. */
  const chosenAccount = chart?.find((a) => a.name === correctCategory) ?? null;
  const canSaveCorrection = chart ? chosenAccount !== null : correctCategory.trim() !== "";

  const handleCorrect = async () => {
    if (!selected || !canSaveCorrection) return;
    setActionLoading(true);
    try {
      await correctTransaction(
        selected.id,
        chosenAccount
          ? { category: chosenAccount.name, category_code: chosenAccount.code ?? undefined }
          : { category: correctCategory },
      );
      toast.success("Category corrected");
      load();
      setCorrectOpen(false);
      setDetailOpen(false);
    } catch (e) { toast.error(String(e)); } finally { setActionLoading(false); }
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
        title="Transactions"
        meta={total > 0 ? `${total.toLocaleString("en-GB")} transactions · page ${page} of ${Math.max(totalPages, 1)}` : "Review, approve and correct AI categorisations"}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
          <label htmlFor="tx-search" className="sr-only">Search descriptions</label>
          <Input
            id="tx-search"
            placeholder="Search descriptions"
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => { setStatus(v === "all" ? "" : v ?? ""); setPage(1); }}
          items={STATUS_ITEMS}
        >
          <SelectTrigger className="w-full sm:w-48" aria-label="Filter by status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <Table className="min-w-[1040px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[112px] pl-4">Date</TableHead>
              <TableHead className="min-w-[260px]">Description</TableHead>
              <TableHead className="w-[128px] text-right">Amount</TableHead>
              <TableHead className="w-[220px]">Category</TableHead>
              <TableHead className="w-[132px]">Confidence</TableHead>
              <TableHead className="w-[148px]">Status</TableHead>
              <TableHead className="w-[76px] pr-4"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(6)].map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {SKELETON_WIDTHS.map((w, j) => (
                    <TableCell key={j} className={j === 0 ? "pl-4" : j === 6 ? "pr-4" : undefined}>
                      {w > 0 && <Skeleton className="h-3" style={{ width: `${w}%` }} />}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="p-4">
                  <EmptyState
                    icon={<Layers />}
                    title="No transactions found."
                    hint={search || status
                      ? "Try a different search or status."
                      : "Sync with Xero first, then run Categorise from the dashboard."}
                  />
                </TableCell>
              </TableRow>
            ) : (
              items.map((tx) => {
                const conf = tx.category_confidence !== null ? parseFloat(tx.category_confidence) : null;
                const selectedRow = detailOpen && selected?.id === tx.id;
                return (
                  <TableRow
                    key={tx.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${tx.description}`}
                    data-state={selectedRow ? "selected" : undefined}
                    className="cursor-pointer outline-none focus-visible:bg-surface-2/60 focus-visible:shadow-[inset_2px_0_0_0_hsl(var(--ring))]"
                    onClick={() => openDetail(tx.id)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(tx.id); }
                    }}
                  >
                    <TableCell className="pl-4 font-mono text-muted-foreground">{fmtDate(tx.date)}</TableCell>
                    <TableCell className="max-w-0 font-medium text-foreground">
                      <span className="block truncate">{tx.description}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-foreground">{fmtAmount(tx.amount)}</TableCell>
                    <TableCell className="max-w-0 text-foreground">
                      <span className="block truncate">{tx.category ?? ""}</span>
                    </TableCell>
                    <TableCell>
                      {conf !== null && !Number.isNaN(conf) && <ConfidenceMeter value={conf} />}
                    </TableCell>
                    <TableCell><StatusChip status={tx.categorisation_status} /></TableCell>
                    <TableCell className="pr-4" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      {tx.categorisation_status === "suggested" && (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            className="text-success hover:bg-success/10 hover:text-success"
                            onClick={() => handleApprove(tx.id)}
                            aria-label="Approve suggested category"
                            title="Approve"
                          >
                            <Check />
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            className="text-danger hover:bg-danger/10 hover:text-danger"
                            onClick={() => handleReject(tx.id)}
                            aria-label="Reject suggested category"
                            title="Reject"
                          >
                            <X />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft /> Previous
          </Button>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">Page {page} of {totalPages}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next <ChevronRight />
          </Button>
        </div>
      )}

      {/* Detail drawer */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent>
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="leading-snug">{selected.description}</SheetTitle>
                <div className="font-mono text-xs text-muted-foreground">
                  {fmtDate(selected.date)} · {fmtAmount(selected.amount)}
                  {selected.reference && <> · {selected.reference}</>}
                </div>
                <div className="pt-1">
                  <StatusChip status={selected.categorisation_status} />
                </div>
              </SheetHeader>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                {selected.categorisation_status !== "uncategorised" ? (
                  <ExplanationPanel transactionId={selected.id} inline escalatedFrom={escalationOf(selected)} />
                ) : (
                  <p className="text-small text-muted-foreground">
                    Not categorised yet. Run Categorise from the dashboard, or set the category by hand with Correct.
                  </p>
                )}
              </div>

              <SheetFooter className="sm:justify-start">
                {(selected.categorisation_status === "suggested" ||
                  selected.categorisation_status === "auto_categorised") && (
                  <Button
                    onClick={() => handleApprove(selected.id)}
                    disabled={actionLoading}
                  >
                    <Check /> Approve
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => openCorrect(selected.category)}
                >
                  Correct
                </Button>
                {selected.categorisation_status === "suggested" && (
                  <Button
                    variant="destructive"
                    onClick={() => handleReject(selected.id)}
                    disabled={actionLoading}
                  >
                    <X /> Reject
                  </Button>
                )}
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Correct category dialog */}
      <Dialog open={correctOpen} onOpenChange={setCorrectOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Correct category</DialogTitle>
            <DialogDescription>The correction is recorded in the audit trail and becomes a precedent.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label htmlFor="correct-category" className="text-small text-muted-foreground">Category</label>
            {chart ? (
              <Select
                value={chosenAccount ? chosenAccount.name : null}
                onValueChange={(v) => setCorrectCategory(v ?? "")}
                items={Object.fromEntries(chart.map((a) => [a.name, accountLabel(a)]))}
              >
                <SelectTrigger id="correct-category" className="w-full">
                  <SelectValue placeholder="Choose an account" />
                </SelectTrigger>
                <SelectContent>
                  {chart.map((a) => (
                    <SelectItem key={a.name} value={a.name}>{accountLabel(a)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="correct-category"
                placeholder="Account name, for example Office supplies"
                value={correctCategory}
                onChange={(e) => setCorrectCategory(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCorrect()}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrectOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCorrect}
              disabled={actionLoading || !canSaveCorrection}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
