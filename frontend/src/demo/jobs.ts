// Background jobs, scripted. A job advances one step per `GET /jobs/{id}` (the UI polls), so
// progress is visible at the dashboard's own polling rate and needs no timers.
import type { JobRead } from "@/lib/api";
import { ORG_ID } from "./seed";
import {
  applySync,
  categoriseRows,
  nowIso,
  uncategorisedInPlanOrder,
  type DemoState,
  type TierCounts,
} from "./store";

export type JobKind = "sync" | "categorise" | "reconcile";

/** Id the dashboard polls after `/demo` (see flag.enterDemo). */
export const FIRST_SYNC_JOB_ID = "demo-job-sync-1";

interface Script {
  /** Polls until the job completes. */
  ticks: number;
  total: (s: DemoState) => number;
  /** Work done on each poll; `step` rows at a time. */
  onTick?: (s: DemoState, job: JobRead, step: number, at: string) => void;
  finish: (s: DemoState, job: JobRead, at: string) => Record<string, unknown>;
}

const SYNC_TOTAL = 70; // 20 accounts + 50 transactions

const emptyTally = (): TierCounts => ({ auto_categorised: 0, suggested: 0, needs_review: 0 });

const scripts: Record<JobKind, Script> = {
  sync: {
    ticks: 5,
    total: () => SYNC_TOTAL,
    finish: (s, _job, at) => {
      const r = applySync(s, at);
      return { status: "completed", ...r, synced_bank_statements: 0, message: null };
    },
  },
  categorise: {
    ticks: 8,
    total: (s) => uncategorisedInPlanOrder(s).length,
    onTick: (s, job, step, at) => {
      const ids = uncategorisedInPlanOrder(s).slice(0, step);
      const done = categoriseRows(s, ids, at);
      const tally = (job.params?.tally as TierCounts | undefined) ?? emptyTally();
      job.params = {
        ...job.params,
        tally: {
          auto_categorised: tally.auto_categorised + done.auto_categorised,
          suggested: tally.suggested + done.suggested,
          needs_review: tally.needs_review + done.needs_review,
        },
      };
    },
    finish: (_s, job) => {
      const tally = (job.params?.tally as TierCounts | undefined) ?? emptyTally();
      return {
        ...tally,
        errors: 0,
        total_processed: tally.auto_categorised + tally.suggested + tally.needs_review,
      };
    },
  },
  // S5 replaces this stub with the bank-statement matching script.
  reconcile: {
    ticks: 2,
    total: () => 0,
    finish: () => ({ auto_matched: 0, suggested: 0, needs_review: 0, errors: 0, total_processed: 0 }),
  },
};

export function createJob(s: DemoState, kind: JobKind, id?: string): JobRead {
  const at = nowIso();
  s.job_seq += 1;
  const job: JobRead = {
    id: id ?? `demo-job-${kind}-${s.job_seq}`,
    organisation_id: ORG_ID,
    kind,
    status: "queued",
    progress_current: 0,
    progress_total: scripts[kind].total(s),
    result: null,
    error: null,
    params: null,
    created_at: at,
    updated_at: at,
    completed_at: null,
  };
  s.jobs[job.id] = job;
  return job;
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
  const step = Math.max(1, Math.ceil(job.progress_total / script.ticks));
  const ticks = ((job.params?.ticks as number | undefined) ?? 0) + 1;
  job.status = "running";
  job.params = { ...job.params, ticks };
  script.onTick?.(s, job, step, at);
  job.progress_current = Math.min(job.progress_total, job.progress_current + step);
  job.updated_at = at;
  if (ticks >= script.ticks || job.progress_current >= job.progress_total) {
    job.result = script.finish(s, job, at);
    job.progress_current = job.progress_total;
    job.status = "completed";
    job.completed_at = at;
  }
  return job;
}
