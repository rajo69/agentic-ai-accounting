"use client";

import type { ReactNode } from "react";
import { FileText, UserCheck, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Lockup } from "@/components/brand/logo";
import { StatusChip } from "@/components/ui/status-chip";

import { CATEGORISE_DURATION } from "./categorise";
import {
  ACME_EXPLANATION,
  ACME_TRANSACTION,
  CANDIDATES,
  CATEGORISE_ROWS,
  EXISTING_DOCUMENTS,
  LETTER,
  NEW_DOCUMENT,
  ORG,
  SCAFFOLD_EXPLANATION,
  STATEMENT_LINES,
  type CategoriseRow,
} from "./data";
import { EXPLAIN_DURATION } from "./explain";
import { CategoryLabel, ExplanationSections, FauxButton, FauxJobButton, JobChip, MiniBar, toneForScore, type JobState } from "./parts";
import { RECONCILE_DURATION } from "./reconcile";
import { REPORT_DURATION } from "./report";
import { enterStyle, finalT, gbp, outroOpacity, pct, pressStyle, seg } from "./timeline";

/**
 * Phone-width compositions of the four scenes (design size 360 x 760), so the product frame is
 * legible on a phone instead of a scaled-down desktop console. Same clock, same data, same
 * parts; only the layout is narrow. Durations match the desktop scenes so the tabs share them.
 */
export const MOBILE_WIDTH = 360;
export const MOBILE_HEIGHT = 760;

function MobileShell({ title, meta, chip, children }: { title: string; meta?: string; chip?: ReactNode; children: ReactNode }) {
  return (
    <div className="relative flex h-full w-full flex-col bg-background text-sm text-foreground">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
        <Lockup size={18} />
        <StatusChip tone="muted" dot={false}>
          Demo
        </StatusChip>
      </div>
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 px-4">
        <div className="min-w-0">
          <div className="truncate text-base font-medium tracking-[-0.01em] text-foreground">{title}</div>
          {meta && <div className="truncate font-mono text-[11px] text-muted-foreground">{meta}</div>}
        </div>
        {chip}
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  );
}

/* Categorise ------------------------------------------------------------------------------- */

export const CATEGORISE_MOBILE_START = 3500;
const C_ROWS = CATEGORISE_ROWS.slice(0, 5);
const C_ROW_IN = (i: number) => 150 + i * 90;
const C_PRESS = 1000;
const C_RESOLVE = (i: number) => 1300 + i * 360;
const C_DONE = C_RESOLVE(C_ROWS.length - 1) + 500;
const C_SELECT = 3600;
const C_SHEET = 3800;
const C_REVIEWED = "t4";

function MobileRow({ row, t, i, selected }: { row: CategoriseRow; t: number; i: number; selected: boolean }) {
  const pin = seg(t, C_ROW_IN(i), 500);
  const pr = seg(t, C_RESOLVE(i), 600);
  const resolved = t >= C_RESOLVE(i) + 450;
  return (
    <li
      className={cn(
        "flex h-14 flex-col justify-center gap-1 border-b border-border px-4 last:border-b-0",
        selected && "bg-surface-2 shadow-[inset_2px_0_0_0_hsl(var(--primary))]"
      )}
      style={enterStyle(pin)}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="min-w-0 flex-1 truncate text-table font-medium text-foreground">{row.description}</span>
        <span className="shrink-0 font-mono text-table tabular-nums text-foreground">{gbp(row.amount)}</span>
      </span>
      <span className="flex items-center justify-between gap-2">
        {pr > 0 ? (
          <CategoryLabel code={row.code} name={row.category} className="min-w-0 flex-1 text-xs" />
        ) : (
          <span className="flex-1 font-mono text-[11px] text-muted-foreground">{row.date}</span>
        )}
        {pr > 0 && <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{pct(row.confidence, pr)}%</span>}
        <StatusChip status={resolved ? row.status : "uncategorised"} className="h-5 px-1.5 text-[11px]" />
      </span>
    </li>
  );
}

/** The transaction list alone, for the phone capability crop. */
export function MobileCategoriseList({ t = finalT(CATEGORISE_DURATION), selectedId }: { t?: number; selectedId?: string }) {
  return (
    <ul className="flex flex-col">
      {C_ROWS.map((row, i) => (
        <MobileRow key={row.id} row={row} t={t} i={i} selected={selectedId === row.id && t >= C_SELECT} />
      ))}
    </ul>
  );
}

export function CategoriseMobile({ t }: { t: number }) {
  const job: JobState = t < C_PRESS + 150 ? "idle" : t < C_DONE ? "running" : "completed";
  const open = seg(t, C_SHEET, 550);
  const reviewed = C_ROWS.find((r) => r.id === C_REVIEWED)!;
  return (
    <div className="h-full" style={{ opacity: outroOpacity(t, CATEGORISE_DURATION) }}>
      <MobileShell
        title="Transactions"
        meta={ORG.period}
        chip={
          <FauxJobButton
            running={job === "running"}
            label="Categorise"
            runningLabel="Categorising…"
            style={pressStyle(t, C_PRESS)}
          />
        }
      >
        <div className="px-4 pb-2">
          <JobChip
            state={job === "running" ? "idle" : job}
            label={job === "completed" ? "5 categorised, 1 to review" : "5 uncategorised"}
          />
        </div>
        <MobileCategoriseList t={t} selectedId={C_REVIEWED} />
        {open > 0 && (
          <>
            <div className="absolute inset-0 bg-background/50" style={{ opacity: open }} />
            <div
              className="absolute inset-x-0 bottom-0 top-20 flex flex-col rounded-t-xl border-t border-border bg-surface shadow-highlight"
              style={{ transform: `translateY(${((1 - open) * 100).toFixed(2)}%)` }}
            >
              <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
                <div className="min-w-0">
                  <div className="truncate text-base font-medium tracking-[-0.01em] text-foreground">{reviewed.description}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {reviewed.date} 2026 · {gbp(reviewed.amount)}
                  </div>
                </div>
                <X className="mt-1 size-4 shrink-0 text-muted-foreground" />
              </div>
              <div className="min-h-0 flex-1 overflow-hidden px-5 py-4">
                <ExplanationSections t={t} start={C_SHEET + 100} data={SCAFFOLD_EXPLANATION} />
              </div>
              <div className="flex gap-2 border-t border-border px-5 py-3">
                <FauxButton>Approve</FauxButton>
                <FauxButton variant="outline">Correct</FauxButton>
                <FauxButton variant="destructive">Reject</FauxButton>
              </div>
            </div>
          </>
        )}
      </MobileShell>
    </div>
  );
}

/* Explain ---------------------------------------------------------------------------------- */

const E_ACTIONS = 3700;
const E_APPROVE = 5000;
const E_CONFIRMED = 5300;
const E_HISTORY = 5500;

export function ExplainMobile({ t }: { t: number }) {
  const confirmed = t >= E_CONFIRMED;
  const status = confirmed ? "confirmed" : ACME_EXPLANATION.status;
  return (
    <div className="h-full" style={{ opacity: outroOpacity(t, EXPLAIN_DURATION) }}>
      <MobileShell title={ACME_TRANSACTION.description} meta={`${ACME_TRANSACTION.date} · ${gbp(ACME_TRANSACTION.amount)}`} chip={<StatusChip status={status} />}>
        <div className="flex flex-col gap-3 px-4">
          <div className="rounded-lg border border-border bg-surface p-4">
            <ExplanationSections t={t} start={0} data={ACME_EXPLANATION} status={status} />
          </div>
          <div className="flex gap-2" style={enterStyle(seg(t, E_ACTIONS, 400))}>
            <FauxButton style={pressStyle(t, E_APPROVE)} className={cn(confirmed && "opacity-50")}>
              Approve
            </FauxButton>
            <FauxButton variant="outline" className={cn(confirmed && "opacity-50")}>
              Correct
            </FauxButton>
            <FauxButton variant="destructive" className={cn(confirmed && "opacity-50")}>
              Reject
            </FauxButton>
          </div>
          {confirmed && (
            <div className="flex items-center gap-2.5 text-small text-muted-foreground" style={enterStyle(seg(t, E_HISTORY, 500))}>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-success/10 text-success ring-1 ring-inset ring-success/20">
                <UserCheck className="size-3.5" strokeWidth={2} />
              </span>
              <span>Approved by the reviewer and recorded in the audit log.</span>
            </div>
          )}
        </div>
      </MobileShell>
    </div>
  );
}

/* Reconcile -------------------------------------------------------------------------------- */

const R_LINES = STATEMENT_LINES.slice(0, 6);
const R_ROW_IN = (i: number) => 150 + i * 90;
const R_PRESS = 1000;
const R_RESOLVE = (i: number) => 1300 + i * 280;
const R_DONE = R_RESOLVE(R_LINES.length - 1) + 400;
const R_SELECT = 3500;
const R_CARD = 3700;
const R_SCORE = (i: number) => 3900 + i * 220;
const R_CONFIRM_PRESS = 5600;
const R_CONFIRMED = 5900;
const R_SELECTED = "s1";

/** Best candidate for the selected statement line, scores stacked, for phones and the crop. */
export function MobileCandidateCard({ t = finalT(RECONCILE_DURATION) }: { t?: number }) {
  const c = CANDIDATES[0];
  const confirmed = t >= R_CONFIRMED;
  const scores = [
    { label: "Amount", value: c.scores.amount },
    { label: "Date", value: c.scores.date },
    { label: "Text", value: c.scores.description },
  ];
  return (
    <div className="rounded-lg border border-border bg-surface p-4" style={enterStyle(seg(t, R_CARD, 450), 10)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-small text-muted-foreground">Best candidate</div>
          <div className="mt-0.5 font-mono text-sm text-foreground">{c.record}</div>
          <div className="truncate text-xs text-muted-foreground">
            {c.party} · {c.date}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-sm tabular-nums text-foreground">{gbp(c.amount)}</div>
          {confirmed ? (
            <StatusChip status="confirmed" className="mt-1" />
          ) : (
            <div className="font-mono text-xs tabular-nums text-muted-foreground">combined {(c.scores.combined * seg(t, R_SCORE(2), 500)).toFixed(2)}</div>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {scores.map((s, i) => (
          <div key={s.label} className="flex items-center gap-3" style={enterStyle(seg(t, R_SCORE(i), 400), 4)}>
            <span className="w-14 shrink-0 text-xs text-muted-foreground">{s.label}</span>
            <MiniBar value={s.value} tone={toneForScore(s.value)} p={seg(t, R_SCORE(i) + 100, 600)} className="flex flex-1" />
          </div>
        ))}
      </div>
      <FauxButton size="sm" className={cn("mt-4 w-full", confirmed && "opacity-50")} style={pressStyle(t, R_CONFIRM_PRESS)}>
        Confirm match
      </FauxButton>
    </div>
  );
}

export function ReconcileMobile({ t }: { t: number }) {
  const job: JobState = t < R_PRESS + 150 ? "idle" : t < R_DONE ? "running" : "completed";
  const confirmed = t >= R_CONFIRMED;
  return (
    <div className="h-full" style={{ opacity: outroOpacity(t, RECONCILE_DURATION) }}>
      <MobileShell title="Reconciliation" meta={ORG.period} chip={
          <FauxJobButton
            running={job === "running"}
            label="Reconcile"
            runningLabel="Reconciling…"
            style={pressStyle(t, R_PRESS)}
          />
        }
      >
        <div className="px-4 pb-2">
          <JobChip
            state={job === "running" ? "idle" : job}
            label={job === "completed" ? "4 auto-matched, 2 to review" : "6 unmatched"}
          />
        </div>
        <ul className="flex flex-col">
          {R_LINES.map((line, i) => {
            const resolved = t >= R_RESOLVE(i);
            const status = !resolved ? "unmatched" : line.id === R_SELECTED && confirmed ? "confirmed" : line.status;
            const selected = line.id === R_SELECTED && t >= R_SELECT;
            return (
              <li
                key={line.id}
                className={cn(
                  "flex h-12 items-center gap-3 border-b border-border px-4",
                  selected && "bg-surface-2 shadow-[inset_2px_0_0_0_hsl(var(--primary))]"
                )}
                style={enterStyle(seg(t, R_ROW_IN(i), 500))}
              >
                <span className="min-w-0 flex-1 truncate text-table text-foreground">{line.description}</span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-foreground">{gbp(line.amount)}</span>
                <StatusChip status={status} dot={false} className="h-5 w-[88px] justify-center px-1 text-[10px]" />
              </li>
            );
          })}
        </ul>
        {t >= R_CARD && (
          <div className="px-4 pt-4">
            <MobileCandidateCard t={t} />
          </div>
        )}
      </MobileShell>
    </div>
  );
}

/* Report ----------------------------------------------------------------------------------- */

const P_PRESS = 1200;
const P_QUEUED = 1350;
const P_RUNNING = 1900;
const P_DONE = 3900;
const P_ROW = 4200;
const P_PREVIEW = 4600;

export function ReportMobile({ t }: { t: number }) {
  const job: JobState = t < P_QUEUED ? "idle" : t < P_RUNNING ? "queued" : t < P_DONE ? "running" : "completed";
  const progress = seg(t, P_RUNNING, P_DONE - P_RUNNING, (p) => p);
  const docs = t >= P_ROW ? [NEW_DOCUMENT, ...EXISTING_DOCUMENTS] : EXISTING_DOCUMENTS;
  const preview = t >= P_PREVIEW;
  const pfig = seg(t, P_PREVIEW + 200, 800);
  return (
    <div className="h-full" style={{ opacity: outroOpacity(t, REPORT_DURATION) }}>
      <MobileShell title="Documents" meta={`${docs.length} generated`}>
        <div className="flex flex-col gap-3 px-4">
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between text-small">
              <span className="text-muted-foreground">Template</span>
              <span className="text-foreground">Management letter</span>
            </div>
            <div className="flex items-center justify-between text-small">
              <span className="text-muted-foreground">Period</span>
              <span className="text-foreground">{ORG.period}</span>
            </div>
            <FauxButton size="sm" className="w-full" style={pressStyle(t, P_PRESS)}>
              Generate PDF
            </FauxButton>
            {job !== "idle" && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-muted-foreground">Job</span>
                  <JobChip state={job} label={job === "queued" ? "Queued" : job === "running" ? "Running" : "Completed"} />
                </div>
                <span className="h-1 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${(job === "completed" ? 1 : progress) * 100}%` }} />
                </span>
              </div>
            )}
          </div>

          <ul className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface">
            {docs.map((doc) => (
              <li
                key={doc.id}
                className="flex h-11 items-center gap-3 border-b border-border px-4 last:border-b-0"
                style={enterStyle(doc.id === NEW_DOCUMENT.id ? seg(t, P_ROW, 500) : 1)}
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate text-table text-foreground">{doc.period}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{doc.generatedAt.split(" · ")[0]}</span>
              </li>
            ))}
          </ul>

          {preview && (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" style={enterStyle(seg(t, P_PREVIEW, 500), 12)}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-medium tracking-[-0.01em] text-foreground">{LETTER.title}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">quarter to 5 Jul 2026</div>
                </div>
                <StatusChip tone="info" dot={false}>
                  Indicative
                </StatusChip>
              </div>
              <dl className="flex flex-col divide-y divide-border border-y border-border">
                {LETTER.figures.map((f) => (
                  <div key={f.label} className="flex items-center justify-between py-2">
                    <dt className="text-small text-muted-foreground">{f.label}</dt>
                    <dd className="font-mono text-sm tabular-nums text-foreground">{gbp(f.value * pfig)}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-small leading-5 text-foreground/90" style={enterStyle(seg(t, P_PREVIEW + 1100, 500))}>
                {LETTER.paragraphs[0]}
              </p>
            </div>
          )}
        </div>
      </MobileShell>
    </div>
  );
}
