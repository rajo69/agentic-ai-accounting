// Demo-mode entry. Loaded on demand (dynamic import) from `lib/api.ts`, `app/demo/page.tsx` and
// `app/settings/page.tsx`, so the seed never reaches the bundle of a real session.
import { FIRST_SYNC_JOB_ID, createJob } from "./jobs";
import { DEMO_USER, ESCALATION_MODEL, ESCALATION_THRESHOLD, ORG_NAME, PRIMARY_MODEL, RULE_COUNT } from "./seed";
import { DOCUMENT_MODEL, getState, mutate, resetState, storageBytes } from "./store";

export { demoHandle, demoGenerateDocument } from "./server";

/**
 * Starts a fresh demo. `populated: false` queues the first-run import job the dashboard polls
 * (onboarding path); `populated: true` starts with the quarter imported and categorised.
 */
export function resetDemoState(opts: { populated: boolean }) {
  resetState(opts);
  if (!opts.populated) mutate((s) => createJob(s, "sync", FIRST_SYNC_JOB_ID));
}

/** Values the demo-only settings page shows; thresholds are the backend's (hard-coded there, Appendix A). */
export function demoSettings() {
  const s = getState();
  return {
    org_name: ORG_NAME,
    reviewer_email: DEMO_USER.email,
    primary_model: PRIMARY_MODEL,
    escalation_model: ESCALATION_MODEL,
    escalation_threshold: ESCALATION_THRESHOLD,
    auto_threshold: 0.85,
    suggest_threshold: 0.5,
    document_model: DOCUMENT_MODEL,
    rule_count: RULE_COUNT,
    storage_bytes: storageBytes(),
    synced_at: s.synced_at,
    counts: {
      accounts: s.accounts.length,
      transactions: s.transactions.length,
      statements: s.statements.length,
      documents: s.documents.length,
      audit: s.audit.length,
    },
  };
}

export type DemoSettings = ReturnType<typeof demoSettings>;
