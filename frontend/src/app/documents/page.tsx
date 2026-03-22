"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { GeneratedDocument, generateDocument, listDocuments } from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    Math.abs(value)
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateInput(iso: string) {
  // format date object to YYYY-MM-DD for input[type=date]
  return iso.slice(0, 10);
}

// ── Quarter helpers ───────────────────────────────────────────────────────────

function currentQuarter(): { start: string; end: string } {
  const now = new Date();
  const year = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3);
  const starts = ["01-01", "04-01", "07-01", "10-01"];
  const ends = ["03-31", "06-30", "09-30", "12-31"];
  return {
    start: `${year}-${starts[q]}`,
    end: `${year}-${ends[q]}`,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const q = currentQuarter();
  const [periodStart, setPeriodStart] = useState(q.start);
  const [periodEnd, setPeriodEnd] = useState(q.end);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listDocuments();
      setDocuments(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // 404 = no org connected, that's fine — show empty state
      if (!msg.includes("404")) {
        toast.error("Failed to load documents");
      }
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  async function handleGenerate() {
    if (!periodStart || !periodEnd) {
      toast.error("Please select a start and end date");
      return;
    }
    if (periodStart > periodEnd) {
      toast.error("Start date must be before end date");
      return;
    }

    setGenerating(true);
    const toastId = toast.loading("Generating management letter…");

    try {
      const res = await generateDocument({
        template: "management_letter",
        period_start: periodStart,
        period_end: periodEnd,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      // Trigger browser download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `management_letter_${periodStart}_${periodEnd}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("Management letter generated and downloading", { id: toastId });
      loadDocuments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Generation failed: ${msg}`, { id: toastId });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
        <p className="text-sm text-gray-500 mt-1">
          Generate AI-assisted management letters from your Xero data.
        </p>
      </div>

      {/* Generate card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate Management Letter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Calculates income, expenses and net profit for the period, then uses AI to write
            an executive summary, income &amp; expense analysis, cash flow observations and
            recommendations. Outputs a professional PDF with an &ldquo;AI-Assisted Draft&rdquo; watermark.
          </p>

          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Period Start</label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="block border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Period End</label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="block border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <Button onClick={handleGenerate} disabled={generating} className="shrink-0">
              {generating ? "Generating…" : "Generate PDF"}
            </Button>
          </div>

          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            Generation takes 15–30 seconds. The PDF will download automatically when ready.
          </p>
        </CardContent>
      </Card>

      {/* Document history */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Previously Generated</h2>

        {loading ? (
          <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>
        ) : documents.length === 0 ? (
          <div className="border border-dashed border-gray-200 rounded-lg py-10 text-center text-sm text-gray-400">
            No documents generated yet. Use the form above to create your first management letter.
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Document row ──────────────────────────────────────────────────────────────

function DocumentRow({ doc }: { doc: GeneratedDocument }) {
  const [regenerating, setRegenerating] = useState(false);

  async function handleRegenerate() {
    setRegenerating(true);
    const toastId = toast.loading("Re-generating…");
    try {
      const res = await generateDocument({
        template: doc.template,
        period_start: fmtDateInput(doc.period_start),
        period_end: fmtDateInput(doc.period_end),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `management_letter_${doc.period_start}_${doc.period_end}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Re-generated and downloading", { id: toastId });
    } catch {
      toast.error("Re-generation failed", { id: toastId });
    } finally {
      setRegenerating(false);
    }
  }

  const net = doc.figures.net;

  return (
    <div className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3 hover:bg-gray-50 transition-colors">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">Management Letter</span>
          <Badge variant="outline" className="text-xs">
            {doc.template.replace("_", " ")}
          </Badge>
        </div>
        <div className="text-xs text-gray-500">
          {fmtDate(doc.period_start)} — {fmtDate(doc.period_end)}
          &nbsp;·&nbsp;{doc.figures.transaction_count} transactions
          &nbsp;·&nbsp;
          <span className={net >= 0 ? "text-green-700 font-medium" : "text-red-700 font-medium"}>
            {net >= 0 ? "+" : "-"}{fmtMoney(net)} net
          </span>
        </div>
        <div className="text-xs text-gray-400">Generated {fmtDate(doc.generated_at)} · {doc.ai_model}</div>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={handleRegenerate}
        disabled={regenerating}
        className="shrink-0 ml-4"
      >
        {regenerating ? "…" : "Re-generate"}
      </Button>
    </div>
  );
}
