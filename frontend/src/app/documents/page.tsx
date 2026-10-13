"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eyebrow } from "@/components/ui/eyebrow";
import { StatusChip } from "@/components/ui/status-chip";
import { toast } from "sonner";
import { FileText, Download, Loader2, Check } from "lucide-react";
import { GeneratedDocument, generateDocument, listDocuments } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Skeleton } from "@/components/app/skeleton";
import { uiTransition } from "@/lib/motion";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Math.abs(value));
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function currentQuarter(): { start: string; end: string } {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const starts = ["01-01", "04-01", "07-01", "10-01"];
  const ends = ["03-31", "06-30", "09-30", "12-31"];
  return { start: `${now.getFullYear()}-${starts[q]}`, end: `${now.getFullYear()}-${ends[q]}` };
}

const TEMPLATES = [
  { value: "management_letter", label: "Management letter", description: "Summary, income and expense analysis, cash position, recommendations." },
  { value: "profit_loss", label: "Profit and loss", description: "Income and expenses by category with commentary and outlook." },
  { value: "vat_summary", label: "VAT return summary", description: "Output and input VAT by rate with MTD notes." },
] as const;

// ── Document row ──────────────────────────────────────────────────────────────

function templateLabel(key: string) {
  return TEMPLATES.find((t) => t.value === key)?.label ?? key;
}

function DocumentRow({ doc }: { doc: GeneratedDocument }) {
  const [regenerating, setRegenerating] = useState(false);
  const net = doc.figures.net;
  const isProfit = net >= 0;

  async function handleRegenerate() {
    setRegenerating(true);
    const tid = toast.loading("Re-generating…");
    try {
      const res = await generateDocument({
        template: doc.template,
        period_start: doc.period_start.slice(0, 10),
        period_end: doc.period_end.slice(0, 10),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${doc.template}_${doc.period_start}_${doc.period_end}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Re-generated and downloading", { id: tid });
    } catch { toast.error("Re-generation failed", { id: tid }); } finally { setRegenerating(false); }
  }

  return (
    <li className="flex flex-col gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
      <FileText className="hidden size-4 shrink-0 text-muted-foreground sm:block" strokeWidth={1.75} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="muted" dot={false}>{templateLabel(doc.template)}</StatusChip>
          <span className="text-table text-foreground">
            {fmtDate(doc.period_start)} to {fmtDate(doc.period_end)}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-3 font-mono text-xs text-muted-foreground">
          <span className="tabular-nums">{doc.figures.transaction_count} transactions</span>
          <span className={cn("tabular-nums", isProfit ? "text-success" : "text-danger")}>
            {isProfit ? "+" : "-"}{fmtMoney(net)} net
          </span>
          <span>Generated {fmtDate(doc.generated_at)}</span>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleRegenerate}
        disabled={regenerating}
        className="shrink-0 self-start sm:self-auto"
      >
        {regenerating
          ? <><Loader2 className="animate-spin" /> Generating</>
          : <><Download /> Re-generate</>}
      </Button>
    </li>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>(TEMPLATES[0].value);

  const q = currentQuarter();
  const [periodStart, setPeriodStart] = useState(q.start);
  const [periodEnd, setPeriodEnd] = useState(q.end);

  const tmpl = TEMPLATES.find((t) => t.value === selectedTemplate) ?? TEMPLATES[0];

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      setDocuments(await listDocuments());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("404")) toast.error("Failed to load documents");
      setDocuments([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  async function handleGenerate() {
    if (!periodStart || !periodEnd) return toast.error("Select start and end dates");
    if (periodStart > periodEnd) return toast.error("Start date must be before end date");

    setGenerating(true);
    const tid = toast.loading(`Generating ${tmpl.label}… (15 to 30 seconds)`);
    try {
      const res = await generateDocument({ template: selectedTemplate, period_start: periodStart, period_end: periodEnd });
      if (!res.ok) { const text = await res.text(); throw new Error(text || `HTTP ${res.status}`); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedTemplate}_${periodStart}_${periodEnd}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${tmpl.label} generated and downloading`, { id: tid });
      loadDocuments();
    } catch (err: unknown) {
      toast.error(`Generation failed: ${err instanceof Error ? err.message : String(err)}`, { id: tid });
    } finally { setGenerating(false); }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={uiTransition}
      className="space-y-6"
    >
      {/* Header */}
      <PageHeader
        title="Documents"
        meta={documents.length > 0 ? `${documents.length} generated` : "Management letters and summaries from the synced books"}
      />

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Generate card */}
        <div className="flex flex-col gap-4 self-start rounded-lg border border-border bg-surface p-5">
          <Eyebrow className="text-muted-foreground">Generate</Eyebrow>

          {/* Template selector */}
          <div role="radiogroup" aria-label="Template" className="flex flex-col gap-1.5">
            {TEMPLATES.map((t) => {
              const active = selectedTemplate === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSelectedTemplate(t.value)}
                  className={cn(
                    "flex items-start gap-3 rounded-md border px-3 py-2.5 text-left outline-none transition-colors duration-150 ease-out-quart",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                    active
                      ? "border-border-strong bg-surface-2"
                      : "border-border hover:border-border-strong hover:bg-surface-2/60"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm ring-1 ring-inset",
                      active ? "bg-primary/10 text-primary ring-primary/40" : "text-transparent ring-border-strong"
                    )}
                  >
                    <Check className="size-3" strokeWidth={2.5} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{t.label}</span>
                    <span className="block text-xs leading-5 text-muted-foreground">{t.description}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="period-start" className="text-small text-muted-foreground">Period start</label>
              <Input
                id="period-start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="font-mono text-[13px]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="period-end" className="text-small text-muted-foreground">Period end</label>
              <Input
                id="period-end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="font-mono text-[13px]"
              />
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="mt-1 w-full"
          >
            {generating
              ? <><Loader2 className="animate-spin" /> Generating</>
              : <><Download /> Generate PDF</>}
          </Button>
          <p className="font-mono text-xs text-muted-foreground">Figures come from the synced books; the commentary is drafted by the model and marked indicative.</p>
        </div>

        {/* History */}
        <div className="flex min-w-0 flex-col gap-3">
          <Eyebrow className="text-muted-foreground">Generated</Eyebrow>
          {loading ? (
            <ul className="overflow-hidden rounded-lg border border-border bg-surface">
              {[...Array(3)].map((_, i) => (
                <li key={i} className="flex items-center gap-4 border-b border-border px-4 py-4 last:border-b-0">
                  <Skeleton className="size-4" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                  <Skeleton className="h-8 w-28" />
                </li>
              ))}
            </ul>
          ) : documents.length === 0 ? (
            <EmptyState
              icon={<FileText />}
              title="No documents generated yet."
              hint="Pick a template and a period, then generate the first letter."
            />
          ) : (
            <ul className="overflow-hidden rounded-lg border border-border bg-surface">
              {documents.map((doc) => (
                <DocumentRow key={doc.id} doc={doc} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </motion.div>
  );
}
