"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FileText, Download, RefreshCw, TrendingUp, TrendingDown, Sparkles, Receipt, BarChart3 } from "lucide-react";
import { GeneratedDocument, generateDocument, listDocuments } from "@/lib/api";

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
  { value: "management_letter", label: "Management Letter", description: "Executive summary, income & expense analysis, cash flow and recommendations", icon: FileText },
  { value: "profit_loss", label: "Profit & Loss", description: "Income and expenses by category with AI commentary and outlook", icon: BarChart3 },
  { value: "vat_summary", label: "VAT Return Summary", description: "Output/input VAT breakdown by rate with MTD compliance tips", icon: Receipt },
] as const;

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25} },
};

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
    <motion.div
      variants={item}
      className="bg-white rounded-xl shadow-sm ring-1 ring-slate-100 px-5 py-4 flex items-center justify-between gap-4 hover:ring-indigo-100 transition-all"
    >
      <div className="flex items-start gap-4">
        <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0 mt-0.5">
          <FileText className="w-4.5 h-4.5 text-indigo-500" />
        </div>
        <div>
          <p className="font-semibold text-slate-900 text-sm">{templateLabel(doc.template)}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {fmtDate(doc.period_start)} to {fmtDate(doc.period_end)}
            &nbsp;·&nbsp;{doc.figures.transaction_count} transactions
          </p>
          <div className="flex items-center gap-1 mt-1.5">
            {isProfit
              ? <TrendingUp className="w-3 h-3 text-emerald-500" />
              : <TrendingDown className="w-3 h-3 text-rose-500" />}
            <span className={`text-xs font-semibold ${isProfit ? "text-emerald-600" : "text-rose-600"}`}>
              {isProfit ? "+" : "-"}{fmtMoney(net)} net
            </span>
            <span className="text-xs text-slate-300 ml-1">· Generated {fmtDate(doc.generated_at)}</span>
          </div>
        </div>
      </div>

      <motion.div whileTap={{ scale: 0.97 }}>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRegenerate}
          disabled={regenerating}
          className="shrink-0 gap-1.5 bg-white border-slate-200"
        >
          {regenerating
            ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating…</>
            : <><Download className="w-3.5 h-3.5" /> Re-generate</>}
        </Button>
      </motion.div>
    </motion.div>
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
    const tid = toast.loading(`Generating ${tmpl.label}… (15–30 seconds)`);
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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3}}
      className="max-w-3xl space-y-8"
    >
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Documents</h1>
        <p className="text-sm text-slate-500 mt-0.5">Generate AI-assisted management letters from your Xero data</p>
      </div>

      {/* Generate card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Generate Document</h2>
              <p className="text-indigo-200 text-xs mt-0.5">AI-assisted PDF reports from your Xero data</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-5 space-y-4">
          {/* Template selector */}
          <div className="grid gap-2 sm:grid-cols-3">
            {TEMPLATES.map((t) => {
              const Icon = t.icon;
              const active = selectedTemplate === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => setSelectedTemplate(t.value)}
                  className={`text-left rounded-lg border px-3 py-2.5 transition-all ${
                    active
                      ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${active ? "text-indigo-600" : "text-slate-400"}`} />
                    <span className={`text-sm font-medium ${active ? "text-indigo-700" : "text-slate-700"}`}>{t.label}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{t.description}</p>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Period Start</label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="block bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Period End</label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="block bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>
            <motion.div whileTap={{ scale: 0.97 }}>
              <Button
                onClick={handleGenerate}
                disabled={generating}
                className="bg-indigo-600 hover:bg-indigo-700 gap-2 shadow-sm shadow-indigo-200"
              >
                {generating
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating…</>
                  : <><Download className="w-4 h-4" /> Generate PDF</>}
              </Button>
            </motion.div>
          </div>
        </div>
      </div>

      {/* History */}
      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-4">Previously Generated</h2>
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-slate-200 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-xl py-12 text-center">
            <FileText className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No documents generated yet.</p>
            <p className="text-xs text-slate-300 mt-1">Use the form above to create your first management letter.</p>
          </div>
        ) : (
          <AnimatePresence>
            <motion.div
              className="space-y-3"
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
            >
              {documents.map((doc) => (
                <DocumentRow key={doc.id} doc={doc} />
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}
