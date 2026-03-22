"use client";

import { useEffect, useState, useCallback } from "react";
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

const MATCH_COLOURS: Record<string, string> = {
  confirmed: "bg-green-100 text-green-800",
  auto_matched: "bg-blue-100 text-blue-800",
  suggested: "bg-yellow-100 text-yellow-800",
  unmatched: "bg-gray-100 text-gray-600",
};

function MatchBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        MATCH_COLOURS[status] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function fmtAmount(amount: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(parseFloat(amount));
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB");
}

function fmtPct(n: number) {
  return `${(n * 100).toFixed(0)}%`;
}

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
      const res = await getBankStatements({
        page,
        page_size: PAGE_SIZE,
        match_status: matchStatus || undefined,
      });
      setStatements(res.items);
      setTotal(res.total);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  }, [page, matchStatus]);

  useEffect(() => {
    load();
  }, [load]);

  const openStatement = async (id: string) => {
    try {
      const detail = await getBankStatement(id);
      setSelected(detail);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleConfirm = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await confirmMatch(selected.id);
      toast.success("Match confirmed");
      load();
      setSelected(null);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnmatch = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await unmatch(selected.id);
      toast.success("Match removed");
      load();
      setSelected(null);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setActionLoading(false);
    }
  };

  const handleManualMatch = async (txId: string) => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await manualMatch(selected.id, txId);
      toast.success("Manually matched");
      load();
      setSearchOpen(false);
      setSelected(null);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setActionLoading(false);
    }
  };

  const searchTransactions = async () => {
    if (!txSearch.trim()) return;
    setTxSearching(true);
    try {
      const res = await getTransactions({ search: txSearch, page_size: 10 });
      setTxResults(res.items);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setTxSearching(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-4">Reconciliation</h1>

      <div className="flex gap-4">
        {/* Left panel — statements list */}
        <div className="flex-1 space-y-3">
          <Select value={matchStatus} onValueChange={(v) => { setMatchStatus(v === "all" ? "" : v ?? ""); setPage(1); }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="unmatched">Unmatched</SelectItem>
              <SelectItem value="suggested">Suggested</SelectItem>
              <SelectItem value="auto_matched">Auto matched</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
            </SelectContent>
          </Select>

          <div className="rounded-md border bg-white divide-y divide-gray-100 overflow-hidden">
            {loading ? (
              <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
            ) : statements.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                No bank statements found
              </p>
            ) : (
              statements.map((s) => (
                <div
                  key={s.id}
                  onClick={() => openStatement(s.id)}
                  className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 text-sm ${
                    selected?.id === s.id ? "bg-blue-50" : ""
                  }`}
                >
                  <div className="space-y-0.5">
                    <p className="font-medium truncate max-w-xs">{s.description}</p>
                    <p className="text-gray-400">{fmtDate(s.date)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-mono font-medium">{fmtAmount(s.amount)}</span>
                    <MatchBadge status={s.match_status} />
                  </div>
                </div>
              ))
            )}
          </div>

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
                {page}/{totalPages}
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
        </div>

        {/* Right panel — detail */}
        <div className="w-80 flex-shrink-0">
          {selected ? (
            <div className="rounded-md border bg-white p-4 space-y-4 text-sm">
              <div>
                <p className="font-semibold text-gray-900 text-base">{selected.description}</p>
                <p className="text-gray-400 text-xs mt-0.5">{fmtDate(selected.date)}</p>
              </div>

              <div className="grid grid-cols-2 gap-y-1.5">
                <span className="text-gray-500">Amount</span>
                <span className="font-mono">{fmtAmount(selected.amount)}</span>
                <span className="text-gray-500">Status</span>
                <MatchBadge status={selected.match_status} />
                {selected.match_confidence && (
                  <>
                    <span className="text-gray-500">Confidence</span>
                    <span>{fmtPct(parseFloat(selected.match_confidence))}</span>
                  </>
                )}
              </div>

              {/* Match candidates */}
              {selected.candidates.length > 0 && (
                <div>
                  <p className="font-medium text-gray-700 mb-2">Match candidates</p>
                  <div className="space-y-2">
                    {selected.candidates.map((c) => (
                      <div
                        key={c.transaction_id}
                        className="rounded border border-gray-100 p-2 space-y-1"
                      >
                        <p className="font-medium text-xs truncate">{c.description}</p>
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>{fmtDate(c.date)}</span>
                          <span className="font-mono">{fmtAmount(c.amount)}</span>
                        </div>
                        <div className="flex gap-2 text-[10px] text-gray-400">
                          <span>Amt {fmtPct(c.amount_score)}</span>
                          <span>Date {fmtPct(c.date_score)}</span>
                          <span>Desc {fmtPct(c.description_score)}</span>
                          <span className="font-semibold text-gray-600">
                            Overall {fmtPct(c.combined_score)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                {(selected.match_status === "suggested" ||
                  selected.match_status === "auto_matched") && (
                  <Button size="sm" onClick={handleConfirm} disabled={actionLoading}>
                    Confirm
                  </Button>
                )}
                {selected.match_status !== "unmatched" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600"
                    onClick={handleUnmatch}
                    disabled={actionLoading}
                  >
                    Unmatch
                  </Button>
                )}
                {selected.match_status === "unmatched" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setTxSearch("");
                      setTxResults([]);
                      setSearchOpen(true);
                    }}
                  >
                    Find &amp; Match
                  </Button>
                )}
              </div>

              {/* Audit history */}
              {selected.audit_history.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-xs text-gray-400 font-medium">
                    Audit history ({selected.audit_history.length})
                  </summary>
                  <ol className="mt-2 space-y-1 border-l border-gray-100 pl-3">
                    {selected.audit_history.map((log) => (
                      <li key={log.id} className="text-xs text-gray-500">
                        <span className="font-medium">{log.action}</span>
                        <p className="text-gray-400">
                          {new Date(log.created_at).toLocaleString("en-GB")}
                        </p>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </div>
          ) : (
            <div className="rounded-md border bg-white p-6 text-center text-sm text-gray-400">
              Select a statement to see details
            </div>
          )}
        </div>
      </div>

      {/* Manual match search dialog */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Find Transaction to Match</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Search by description…"
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchTransactions()}
              />
              <Button onClick={searchTransactions} disabled={txSearching}>
                {txSearching ? "…" : "Search"}
              </Button>
            </div>
            {txResults.length > 0 && (
              <div className="divide-y divide-gray-100 border rounded-md overflow-hidden max-h-64 overflow-y-auto">
                {txResults.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm"
                    onClick={() => handleManualMatch(tx.id)}
                  >
                    <div>
                      <p className="font-medium truncate max-w-48">{tx.description}</p>
                      <p className="text-gray-400 text-xs">{fmtDate(tx.date)}</p>
                    </div>
                    <span className="font-mono text-xs">{fmtAmount(tx.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
