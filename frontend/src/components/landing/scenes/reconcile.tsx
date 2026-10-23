"use client";

import { cn } from "@/lib/utils";
import { Eyebrow } from "@/components/ui/eyebrow";
import { StatusChip } from "@/components/ui/status-chip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { CANDIDATES, ORG, STATEMENT_LINES, type Candidate } from "./data";
import { FauxButton, FauxJobButton, JobChip, MiniBar, SceneHeader, toneForScore, type JobState } from "./parts";
import { enterStyle, gbp, outroOpacity, pressStyle, seg } from "./timeline";

/**
 * Two panes: statement lines on the left receive match statuses; the suggested line is opened
 * and its scored candidates fill in on the right; the reviewer confirms the best match.
 */
export const RECONCILE_DURATION = 8000;

const ROW_IN = (i: number) => 150 + i * 90;
const PRESS_AT = 1100;
const ROW_RESOLVE = (i: number) => 1400 + i * 280;
const JOB_DONE = ROW_RESOLVE(STATEMENT_LINES.length - 1) + 400;
const SELECT_AT = 3900;
const CANDIDATE_IN = (i: number) => 4200 + i * 250;
const BEST_AT = 5600;
const CONFIRM_PRESS_AT = 6200;
const CONFIRMED_AT = 6500;
const SELECTED_ID = "s1";

export function CandidatesTable({
  t,
  candidates = CANDIDATES,
  bestAt = BEST_AT,
  confirmedAt = CONFIRMED_AT,
  inAt = CANDIDATE_IN,
}: {
  t: number;
  candidates?: Candidate[];
  bestAt?: number;
  confirmedAt?: number;
  inAt?: (i: number) => number;
}) {
  const best = t >= bestAt;
  const confirmed = t >= confirmedAt;
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow className="[&_th]:text-muted-foreground">
          <TableHead className="px-2">Record</TableHead>
          <TableHead className="w-[88px] px-2 text-right">Amount</TableHead>
          <TableHead className="w-[74px] px-2">Amount</TableHead>
          <TableHead className="w-[74px] px-2">Date</TableHead>
          <TableHead className="w-[74px] px-2">Text</TableHead>
          <TableHead className="w-[104px] px-2">Combined</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {candidates.map((c, i) => {
          const pin = seg(t, inAt(i), 450);
          const pb = seg(t, inAt(i) + 200, 700);
          const isBest = i === 0 && best;
          return (
            <TableRow key={c.id} data-state={isBest ? "selected" : undefined} style={enterStyle(pin)}>
              <TableCell className="px-2">
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate font-mono text-small text-foreground">{c.record}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {c.party} · {c.date}
                  </span>
                </span>
              </TableCell>
              <TableCell className="px-2 text-right font-mono tabular-nums text-foreground">{gbp(c.amount)}</TableCell>
              <TableCell className="px-2">
                <MiniBar value={c.scores.amount} tone={toneForScore(c.scores.amount)} p={pb} width="w-5" compact />
              </TableCell>
              <TableCell className="px-2">
                <MiniBar value={c.scores.date} tone={toneForScore(c.scores.date)} p={pb} width="w-5" compact />
              </TableCell>
              <TableCell className="px-2">
                <MiniBar value={c.scores.description} tone={toneForScore(c.scores.description)} p={pb} width="w-5" compact />
              </TableCell>
              <TableCell className="px-2">
                {isBest && confirmed ? (
                  <StatusChip status="confirmed" />
                ) : (
                  <span className={cn("font-mono text-small tabular-nums", isBest ? "text-foreground" : "text-muted-foreground")}>
                    {(c.scores.combined * pb).toFixed(2)}
                  </span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function ReconcileScene({ t }: { t: number }) {
  const job: JobState = t < PRESS_AT + 150 ? "idle" : t < JOB_DONE ? "running" : "completed";
  const selectedVisible = t >= SELECT_AT;
  const confirmed = t >= CONFIRMED_AT;
  const selectedLine = STATEMENT_LINES.find((l) => l.id === SELECTED_ID)!;
  return (
    <div className="flex h-full flex-col" style={{ opacity: outroOpacity(t, RECONCILE_DURATION) }}>
      <SceneHeader title="Reconciliation" meta={`${ORG.name} · ${ORG.period}`}>
        <JobChip
          state={job === "running" ? "idle" : job}
          label={job === "completed" ? "5 auto-matched · 2 to review" : "8 unmatched"}
        />
        <FauxJobButton
          running={job === "running"}
          label="Reconcile"
          runningLabel="Reconciling…"
          style={pressStyle(t, PRESS_AT)}
        />
      </SceneHeader>

      <div className="grid min-h-0 flex-1 grid-cols-[360px_1fr] gap-6 px-6 pb-6">
        <ul className="flex flex-col self-start overflow-hidden rounded-lg border border-border bg-surface">
          {STATEMENT_LINES.map((line, i) => {
            const pin = seg(t, ROW_IN(i), 500);
            const resolved = t >= ROW_RESOLVE(i);
            const status = !resolved ? "unmatched" : line.id === SELECTED_ID && confirmed ? "confirmed" : line.status;
            const selected = line.id === SELECTED_ID && selectedVisible;
            return (
              <li
                key={line.id}
                className={cn(
                  "flex h-14 flex-col justify-center gap-1 border-b border-border px-4 last:border-b-0",
                  selected && "bg-surface-2 shadow-[inset_2px_0_0_0_hsl(var(--primary))]"
                )}
                style={enterStyle(pin)}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-table font-medium text-foreground">{line.description}</span>
                  <span className="shrink-0 font-mono text-table tabular-nums text-foreground">{gbp(line.amount)}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted-foreground">{line.date} 2026</span>
                  <StatusChip status={status} />
                </span>
              </li>
            );
          })}
        </ul>

        <div className="flex min-w-0 flex-col self-start rounded-lg border border-border bg-surface" style={enterStyle(seg(t, SELECT_AT + 100, 400))}>
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <Eyebrow className="text-muted-foreground">Candidates</Eyebrow>
              <div className="mt-1.5 truncate text-sm text-foreground">{selectedLine.description}</div>
              <div className="font-mono text-xs text-muted-foreground">
                {selectedLine.date} 2026 · {gbp(selectedLine.amount)}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <FauxButton variant="outline">Manual search</FauxButton>
              <FauxButton style={pressStyle(t, CONFIRM_PRESS_AT)} className={cn(confirmed && "opacity-50")}>
                Confirm match
              </FauxButton>
            </div>
          </div>
          <div className="px-2">
            <CandidatesTable t={t} />
          </div>
        </div>
      </div>
    </div>
  );
}
