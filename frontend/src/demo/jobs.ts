// Background jobs, scripted. A job advances one step per `GET /jobs/{id}` (the UI polls), so
// progress is visible at the dashboard's own polling rate and needs no timers.
import type { JobRead } from "@/lib/api";
import { ORG_ID, STATEMENT_COUNT, planOrder, seedAccounts } from "./seed";
import {
  applySync,
  categoriseRows,
  generateDemoDocument,
  nowIso,
  reconcileStatements,
  uncategorisedInPlanOrder,
  unmatchedStatementIds,
  type DemoState,
  type DocumentRequest,
  type MatchCounts,
  type TierCounts,
} from "./store";

export type JobKind = "sync" | "categorise" | "reconcile" | "document";

/** Id the dashboard polls after `/demo` (see flag.enterDemo). */
export const FIRST_SYNC_JOB_ID = "demo-job-sync-1";

interface Script {
  /** Polls until the job completes. */
  ticks: number;
  total: (s: DemoState, params: Record<string, unknown> | null) => number;
  /** Work done on each poll; `step` rows at a time. */
  onTick?: (s: DemoState, job: JobRead, step: number, at: string) => void;
  finish: (s: DemoState, job: JobRead, at: string) => Record<string, unknown>;
}

const SYNC_TOTAL = seedAccounts().length + planOrder().length + STATEMENT_COUNT; // accounts + transactions + statement lines

const emptyTiers = (): TierCounts => ({ auto_categorised: 0, suggested: 0, needs_review: 0 });
const emptyMatches = (): MatchCounts => ({ auto_matched: 0, suggested: 0, needs_review: 0 });

function addCounts<T extends object>(a: T, b: T): T {
  const out: Record<string, number> = { ...(a as Record<string, number>) };
  for (const [k, v] of Object.entries(b as Record<string, number>)) out[k] = (out[k] ?? 0) + v;
  return out as T;
}

const scripts: Record<JobKind, Script> = {
  sync: {
    // Dashboard polls every 1.5 s: the first import completes on the second poll (about 1.5 s).
    ticks: 2,
    total: () => SYNC_TOTAL,
    finish: (s, _job, at) => ({ status: "completed", ...applySync(s, at), message: null }),
  },
  categorise: {
    // Polls at 0, 1.5 and 3 s: rows land in three batches, done at about 3 s.
    ticks: 3,
    total: (s) => uncategorisedInPlanOrder(s).length,
    onTick: (s, job, step, at) => {
      const ids = uncategorisedInPlanOrder(s).slice(0, step);
      const done = categoriseRows(s, ids, at);
      const tally = (job.params?.tally as TierCounts | undefined) ?? emptyTiers();
      job.params = { ...job.params, tally: addCounts(tally, done) };
    },
    finish: (_s, job) => {
      const tally = (job.params?.tally as TierCounts | undefined) ?? emptyTiers();
      return { ...tally, errors: 0, total_processed: tally.auto_categorised + tally.suggested + tally.needs_review };
    },
  },
  reconcile: {
    ticks: 3,
    total: (s) => unmatchedStatementIds(s).length,
    onTick: (s, job, step, at) => {
      const ids = unmatchedStatementIds(s).slice(0, step);
      const done = reconcileStatements(s, ids, at);
      const tally = (job.params?.tally as MatchCounts | undefined) ?? emptyMatches();
      job.params = { ...job.params, tally: addCounts(tally, done) };
    },
    finish: (_s, job) => {
      const tally = (job.params?.tally as MatchCounts | undefined) ?? emptyMatches();
      return { ...tally, errors: 0, total_processed: tally.auto_matched + tally.suggested + tally.needs_review };
    },
  },
  document: {
    ticks: 3,
    total: () => 3, // figures, narrative, render
    finish: (s, job, at) => {
      const req = job.params?.request as DocumentRequest | undefined;
      if (!req) throw new Error("demo: document job without a request");
      const doc = generateDemoDocument(s, req, at);
      return {
        document_id: doc.id,
        template: doc.template,
        period_start: doc.period_start,
        period_end: doc.period_end,
        transaction_count: doc.figures.transaction_count,
        generated_at: doc.generated_at,
      };
    },
  },
};

export function createJob(s: DemoState, kind: JobKind, id?: string, params: Record<string, unknown> | null = null): JobRead {
  const at = nowIso();
  s.job_seq += 1;
  const job: JobRead = {
    id: id ?? `demo-job-${kind}-${s.job_seq}`,
    organisation_id: ORG_ID,
    kind,
    status: "queued",
    progress_current: 0,
    progress_total: scripts[kind].total(s, params),
    result: null,
    error: null,
    params,
    created_at: at,
    updated_at: at,
    completed_at: null,
  };
  s.jobs[job.id] = job;
  return job;
}

function syncInFlight(s: DemoState): boolean {
  return Object.values(s.jobs).some((j) => j.kind === "sync" && (j.status === "queued" || j.status === "running"));
}

/** One poll's worth of progress. Completed and failed jobs are returned unchanged. */
export function tickJob(s: DemoState, job: JobRead): JobRead {
  if (job.status === "completed" || job.status === "failed") return job;
  const script = scripts[job.kind as JobKind];
  if (!script) {
    job.status = "failed";
    job.error = `demo: unknown job kind ${job.kind}`;
    return job;
  }
  const at = nowIso();
  // A categorise or reconcile submitted while the first import is still running waits for it
  // (a worker would queue behind the sync) and sizes itself once the rows exist.
  if ((job.kind === "categorise" || job.kind === "reconcile") && syncInFlight(s)) {
    job.status = "queued";
    job.updated_at = at;
    return job;
  }
  if (job.progress_current === 0 && (job.kind === "categorise" || job.kind === "reconcile")) {
    job.progress_total = script.total(s, job.params);
  }
  const step = Math.max(1, Math.ceil(job.progress_total / script.ticks));
  const ticks = ((job.params?.ticks as number | undefined) ?? 0) + 1;
  job.status = "running";
  job.params = { ...job.params, ticks };
  try {
    script.onTick?.(s, job, step, at);
    job.progress_current = Math.min(job.progress_total, job.progress_current + step);
    job.updated_at = at;
    if (ticks >= script.ticks || job.progress_current >= job.progress_total) {
      job.result = script.finish(s, job, at);
      job.progress_current = job.progress_total;
      job.status = "completed";
      job.completed_at = at;
    }
  } catch (e) {
    job.status = "failed";
    job.error = e instanceof Error ? e.message : String(e);
    job.updated_at = at;
  }
  return job;
}
