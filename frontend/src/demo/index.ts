// Demo-mode entry. Loaded on demand (dynamic import) from `lib/api.ts` and `app/demo/page.tsx`,
// so the seed never reaches the bundle of a real session.
import { FIRST_SYNC_JOB_ID, createJob } from "./jobs";
import { mutate, resetState } from "./store";

export { demoHandle, demoGenerateDocument } from "./server";

/**
 * Starts a fresh demo. `populated: false` queues the first-run import job the dashboard polls
 * (onboarding path); `populated: true` starts with the quarter imported and categorised.
 */
export function resetDemoState(opts: { populated: boolean }) {
  resetState(opts);
  if (!opts.populated) mutate((s) => createJob(s, "sync", FIRST_SYNC_JOB_ID));
}
