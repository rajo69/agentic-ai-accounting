"use client";

import { useEffect, useState, useCallback } from "react";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  getTransactions,
  getTransaction,
  approveTransaction,
  rejectTransaction,
  correctTransaction,
  type Transaction,
  type TransactionDetail,
} from "@/lib/api";

const STATUS_COLOURS: Record<string, string> = {
  confirmed: "bg-green-100 text-green-800",
  auto_categorised: "bg-blue-100 text-blue-800",
  suggested: "bg-yellow-100 text-yellow-800",
  needs_review: "bg-red-100 text-red-800",
  uncategorised: "bg-gray-100 text-gray-600",
  rejected: "bg-gray-100 text-gray-600",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        STATUS_COLOURS[status] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function fmtAmount(amount: string) {
  const n = parseFloat(amount);
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(n);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB");
}

function fmtConfidence(c: string | null) {
  if (!c) return "—";
  return `${(parseFloat(c) * 100).toFixed(0)}%`;
}

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

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (id: string) => {
    try {
      const detail = await getTransaction(id);
      setSelected(detail);
      setDetailOpen(true);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleApprove = async (id: string) => {
    setActionLoading(true);
    try {
      await approveTransaction(id);
      toast.success("Category confirmed");
      load();
      setDetailOpen(false);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (id: string) => {
    setActionLoading(true);
    try {
      await rejectTransaction(id);
      toast.success("Rejected — transaction is uncategorised again");
      load();
      setDetailOpen(false);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCorrect = async () => {
    if (!selected || !correctCategory.trim()) return;
    setActionLoading(true);
    try {
      await correctTransaction(selected.id, { category: correctCategory });
      toast.success("Category corrected");
      load();
      setCorrectOpen(false);
      setDetailOpen(false);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4 max-w-6xl">
      <h1 className="text-xl font-semibold text-gray-900">Transactions</h1>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Search description…"
          className="w-64"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <Select value={status} onValueChange={(v) => { setStatus(v === "all" ? "" : v ?? ""); setPage(1); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="uncategorised">Uncategorised</SelectItem>
            <SelectItem value="suggested">Suggested</SelectItem>
            <SelectItem value="auto_categorised">Auto categorised</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="needs_review">Needs review</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-gray-400 py-8">
                  Loading…
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-gray-400 py-8">
                  No transactions found
                </TableCell>
              </TableRow>
            ) : (
              items.map((tx) => (
                <TableRow key={tx.id} className="cursor-pointer hover:bg-gray-50">
                  <TableCell className="text-sm">{fmtDate(tx.date)}</TableCell>
                  <TableCell
                    className="text-sm max-w-xs truncate"
                    onClick={() => openDetail(tx.id)}
                  >
                    {tx.description}
                  </TableCell>
                  <TableCell className="text-sm text-right font-mono">
                    {fmtAmount(tx.amount)}
                  </TableCell>
                  <TableCell className="text-sm">{tx.category ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={tx.categorisation_status} />
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {fmtConfidence(tx.category_confidence)}
                  </TableCell>
                  <TableCell>
                    {tx.categorisation_status === "suggested" && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => handleApprove(tx.id)}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-red-600"
                          onClick={() => handleReject(tx.id)}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span>
            Page {page} of {totalPages} ({total} total)
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Transaction Detail</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-y-2">
                <span className="text-gray-500">Date</span>
                <span>{fmtDate(selected.date)}</span>
                <span className="text-gray-500">Amount</span>
                <span className="font-mono">{fmtAmount(selected.amount)}</span>
                <span className="text-gray-500">Description</span>
                <span>{selected.description}</span>
                {selected.reference && (
                  <>
                    <span className="text-gray-500">Reference</span>
                    <span>{selected.reference}</span>
                  </>
                )}
                <span className="text-gray-500">Category</span>
                <span>{selected.category ?? "—"}</span>
                <span className="text-gray-500">Status</span>
                <StatusBadge status={selected.categorisation_status} />
                <span className="text-gray-500">Confidence</span>
                <span>{fmtConfidence(selected.category_confidence)}</span>
              </div>

              {selected.audit_history.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-gray-500 text-xs font-medium">
                    Audit history ({selected.audit_history.length})
                  </summary>
                  <ol className="mt-2 space-y-1 border-l border-gray-200 pl-4">
                    {selected.audit_history.map((log) => (
                      <li key={log.id} className="text-xs text-gray-600">
                        <span className="font-medium">{log.action}</span>
                        {log.ai_explanation && (
                          <p className="text-gray-400 mt-0.5">{log.ai_explanation}</p>
                        )}
                        <p className="text-gray-400">
                          {new Date(log.created_at).toLocaleString("en-GB")}
                        </p>
                      </li>
                    ))}
                  </ol>
                </details>
              )}

              <div className="flex gap-2 pt-2">
                {(selected.categorisation_status === "suggested" ||
                  selected.categorisation_status === "auto_categorised") && (
                  <Button
                    size="sm"
                    onClick={() => handleApprove(selected.id)}
                    disabled={actionLoading}
                  >
                    Accept
                  </Button>
                )}
                {selected.categorisation_status === "suggested" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600"
                    onClick={() => handleReject(selected.id)}
                    disabled={actionLoading}
                  >
                    Reject
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setCorrectCategory(selected.category ?? "");
                    setCorrectOpen(true);
                  }}
                >
                  Edit Category
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Correct category dialog */}
      <Dialog open={correctOpen} onOpenChange={setCorrectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Correct Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Enter correct category name"
              value={correctCategory}
              onChange={(e) => setCorrectCategory(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                onClick={handleCorrect}
                disabled={actionLoading || !correctCategory.trim()}
              >
                Save
              </Button>
              <Button variant="outline" onClick={() => setCorrectOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
