"use client";

import { X } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusChip } from "@/components/ui/status-chip";

import { CATEGORISE_ROWS, ORG, SCAFFOLD_EXPLANATION, type CategoriseRow } from "./data";
import {
  CategoryLabel,
  CountingConfidence,
  ExplanationSections,
  FauxButton,
  FauxJobButton,
  JobChip,
  SceneHeader,
  type JobState,
} from "./parts";
import { enterStyle, gbp, outroOpacity, pressStyle, seg } from "./timeline";

/**
 * The signature scene (DESIGN.md section 6). Rows settle in; the Categorise job runs; each row
 * receives its category, a confidence that counts up in mono and a tier chip; the row that
 * needs review is selected and the reasoning drawer slides in with two sentences and three
 * risk rules ticking. Holds, fades, loops.
 */
export const CATEGORISE_DURATION = 8600;
/** First loop starts here: rows already coded, the reviewed row about to open. */
export const CATEGORISE_START = 4400;

const ROW_IN = (i: number) => 150 + i * 90;
const PRESS_AT = 1200;
const ROW_RESOLVE = (i: number) => 1500 + i * 360;
const JOB_DONE = ROW_RESOLVE(CATEGORISE_ROWS.length - 1) + 500;
const SELECT_AT = 4500;
const DRAWER_AT = 4700;
const REVIEWED_ID = "t4";

export function CategoriseTable({
  t,
  compact = false,
  selectedId,
  rows = CATEGORISE_ROWS,
}: {
  t: number;
  /** Drops the date column for the 7-column capability crop. */
  compact?: boolean;
  selectedId?: string;
  rows?: CategoriseRow[];
}) {
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow className="[&_th]:text-muted-foreground">
          {!compact && <TableHead className="w-[76px]">Date</TableHead>}
          <TableHead>Description</TableHead>
          <TableHead className={compact ? "w-[96px] text-right" : "w-[112px] text-right"}>Amount</TableHead>
          <TableHead className={compact ? "w-[160px]" : "w-[224px]"}>Category</TableHead>
          <TableHead className={compact ? "w-[100px]" : "w-[124px]"}>Confidence</TableHead>
          <TableHead className={compact ? "w-[140px]" : "w-[136px]"}>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => {
          const pin = seg(t, ROW_IN(i), 500);
          const pr = seg(t, ROW_RESOLVE(i), 600);
          const resolved = t >= ROW_RESOLVE(i) + 450;
          const selected = selectedId === row.id && t >= SELECT_AT;
          return (
            <TableRow key={row.id} data-state={selected ? "selected" : undefined} style={enterStyle(pin)}>
              {!compact && <TableCell className="font-mono text-muted-foreground">{row.date}</TableCell>}
              <TableCell className="font-medium text-foreground">
                <span className="block truncate">{row.description}</span>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums text-foreground">{gbp(row.amount)}</TableCell>
              <TableCell>
                {pr > 0 && <CategoryLabel code={row.code} name={row.category} className="flex" />}
              </TableCell>
              <TableCell>
                <CountingConfidence value={row.confidence} p={pr} />
              </TableCell>
              <TableCell>
                <StatusChip status={resolved ? row.status : "uncategorised"} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** The explanation drawer, inside the frame, sliding in from the right over a dimmed list. */
function ReasoningDrawer({ t, start, row }: { t: number; start: number; row: CategoriseRow }) {
  const open = seg(t, start, 550);
  if (open === 0) return null;
  return (
    <>
      <div className="absolute inset-0 bg-background/50" style={{ opacity: open }} />
      <aside
        className="absolute inset-y-0 right-0 flex w-[480px] flex-col border-l border-border bg-surface"
        style={{ transform: `translateX(${((1 - open) * 100).toFixed(2)}%)` }}
      >
        <header className="flex flex-col gap-1 border-b border-border px-6 py-4 pr-14">
          <div className="text-base font-medium tracking-[-0.01em] text-foreground">{row.description}</div>
          <div className="font-mono text-xs text-muted-foreground">
            {row.date} 2026 · {gbp(row.amount)} · {row.reference}
          </div>
          <span className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-md text-muted-foreground">
            <X className="size-4" />
          </span>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden px-6 py-4">
          <ExplanationSections t={t} start={start} data={SCAFFOLD_EXPLANATION} />
        </div>
        <footer className="mt-auto flex gap-2 border-t border-border px-6 py-4">
          <FauxButton>Approve</FauxButton>
          <FauxButton variant="outline">Correct</FauxButton>
          <FauxButton variant="destructive">Reject</FauxButton>
        </footer>
      </aside>
    </>
  );
}

export function CategoriseScene({ t }: { t: number }) {
  const job: JobState = t < PRESS_AT + 150 ? "idle" : t < JOB_DONE ? "running" : "completed";
  const reviewed = CATEGORISE_ROWS.find((r) => r.id === REVIEWED_ID)!;
  return (
    <div className="relative flex h-full flex-col" style={{ opacity: outroOpacity(t, CATEGORISE_DURATION) }}>
      <SceneHeader title="Transactions" meta={`${ORG.name} · ${ORG.period}`}>
        <JobChip
          state={job === "running" ? "idle" : job}
          label={job === "completed" ? "7 categorised · 1 to review" : "7 uncategorised"}
        />
        <FauxButton variant="outline" className="min-w-36">Sync</FauxButton>
        <FauxJobButton
          running={job === "running"}
          label="Categorise"
          runningLabel="Categorising…"
          style={pressStyle(t, PRESS_AT)}
        />
      </SceneHeader>
      <div className="px-6">
        <CategoriseTable t={t} selectedId={REVIEWED_ID} />
        <div className="flex h-10 items-center justify-between font-mono text-xs text-muted-foreground">
          <span>7 transactions · page 1 of 1</span>
          <span>Sorted by date</span>
        </div>
      </div>
      <ReasoningDrawer t={t} start={DRAWER_AT} row={reviewed} />
    </div>
  );
}
