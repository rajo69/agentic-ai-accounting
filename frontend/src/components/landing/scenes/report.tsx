"use client";

import { ChevronDown, FileText } from "lucide-react";

import { Eyebrow } from "@/components/ui/eyebrow";
import { StatusChip } from "@/components/ui/status-chip";

import { EXISTING_DOCUMENTS, LETTER, NEW_DOCUMENT, ORG, type GeneratedDocument } from "./data";
import { FauxButton, JobChip, SceneHeader, type JobState } from "./parts";
import { enterStyle, gbp, outroOpacity, pressStyle, seg } from "./timeline";

/**
 * Documents: the generate form runs a job (queued, running, completed), the new letter joins the
 * list, and its first page previews with indicative figures counting up.
 */
export const REPORT_DURATION = 8000;

const PRESS_AT = 1200;
const QUEUED_AT = 1350;
const RUNNING_AT = 1900;
const DONE_AT = 3900;
const ROW_AT = 4200;
const PREVIEW_AT = 4600;

function FauxSelect({ label, value }: { label: string; value: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-small text-muted-foreground">{label}</span>
      <span className="flex h-9 items-center justify-between rounded-md border border-border bg-surface-2 px-3 text-sm text-foreground">
        {value}
        <ChevronDown className="size-4 text-muted-foreground" />
      </span>
    </label>
  );
}

function DocumentRow({ doc, p }: { doc: GeneratedDocument; p: number }) {
  return (
    <li className="flex h-11 items-center gap-3 border-b border-border px-4 last:border-b-0" style={enterStyle(p)}>
      <FileText className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      <StatusChip tone="muted" dot={false}>
        {doc.template}
      </StatusChip>
      <span className="min-w-0 flex-1 truncate text-table text-foreground">{doc.period}</span>
      <span className="shrink-0 font-mono text-xs text-muted-foreground">{doc.generatedAt}</span>
    </li>
  );
}

export function LetterPreview({ t, start }: { t: number; start: number }) {
  const pin = seg(t, start, 500);
  const pfig = seg(t, start + 200, 800);
  return (
    <div className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-6" style={enterStyle(pin, 12)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-h3 text-foreground">{LETTER.title}</div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">{LETTER.subtitle}</div>
        </div>
        <StatusChip tone="info" dot={false}>
          Indicative
        </StatusChip>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {LETTER.figures.map((f) => (
          <div key={f.label} className="flex flex-col gap-2 rounded-md border border-border bg-background p-4">
            <Eyebrow className="text-muted-foreground">{f.label}</Eyebrow>
            <span className="font-mono text-kpi tabular-nums text-foreground">{gbp(f.value * pfig)}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {LETTER.paragraphs.map((p, i) => (
          <p key={i} className="text-small leading-5 text-foreground/90" style={enterStyle(seg(t, start + 1100 + i * 350, 500))}>
            {p}
          </p>
        ))}
      </div>
    </div>
  );
}

export function ReportScene({ t }: { t: number }) {
  const job: JobState = t < QUEUED_AT ? "idle" : t < RUNNING_AT ? "queued" : t < DONE_AT ? "running" : "completed";
  const progress = seg(t, RUNNING_AT, DONE_AT - RUNNING_AT, (p) => p);
  const docs = t >= ROW_AT ? [NEW_DOCUMENT, ...EXISTING_DOCUMENTS] : EXISTING_DOCUMENTS;
  return (
    <div className="flex h-full flex-col" style={{ opacity: outroOpacity(t, REPORT_DURATION) }}>
      <SceneHeader title="Documents" meta={`${ORG.name} · ${ORG.period}`}>
        <span className="font-mono text-xs text-muted-foreground">{docs.length} generated</span>
      </SceneHeader>

      <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr] gap-6 px-6 pb-6">
        <div className="flex flex-col gap-4 self-start rounded-lg border border-border bg-surface p-5">
          <Eyebrow className="text-muted-foreground">Generate</Eyebrow>
          <FauxSelect label="Template" value="Management letter" />
          <FauxSelect label="Period" value={ORG.period} />
          <FauxButton size="default" style={pressStyle(t, PRESS_AT)} className="mt-1 w-full">
            Generate PDF
          </FauxButton>
          <div className="flex min-h-9 flex-col gap-2 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-muted-foreground">Job</span>
              <JobChip
                state={job}
                label={job === "idle" ? "Not started" : job === "queued" ? "Queued" : job === "running" ? "Running" : "Completed"}
              />
            </div>
            {job !== "idle" && (
              <span className="h-1 overflow-hidden rounded-full bg-surface-2">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${(job === "completed" ? 1 : progress) * 100}%` }}
                />
              </span>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <ul className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface">
            {docs.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} p={doc.id === NEW_DOCUMENT.id ? seg(t, ROW_AT, 500) : 1} />
            ))}
          </ul>
          {t >= PREVIEW_AT && <LetterPreview t={t} start={PREVIEW_AT} />}
        </div>
      </div>
    </div>
  );
}
