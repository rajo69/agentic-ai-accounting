// Demo state: the synthetic organisation's rows, audit log and jobs, persisted in localStorage.
// Mutations live here so that jobs.ts and server.ts stay thin; every mutation goes through
// `mutate()` so the state is written back after each change.
import type { AuditLog, JobRead, Transaction } from "@/lib/api";
import {
  ORG_ID,
  SEED_VERSION,
  accountByName,
  planOrder,
  seedAccounts,
  seedRow,
  seedTransactions,
  type DemoAccount,
} from "./seed";

export const STORAGE_KEY = "demo_state_v2";

export interface DemoState {
  version: string;
  created_at: string;
  synced_at: string | null;
  accounts: DemoAccount[];
  transactions: Transaction[];
  audit: AuditLog[];
  jobs: Record<string, JobRead>;
  job_seq: number;
}

let cache: DemoState | null = null;

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function load(): DemoState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemoState;
    return parsed.version === SEED_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

function save(s: DemoState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked: the in-memory state still works for this page */
  }
}

function freshState(opts: { populated: boolean }): DemoState {
  const now = Date.now();
  const s: DemoState = {
    version: SEED_VERSION,
    created_at: new Date(now).toISOString(),
    synced_at: null,
    accounts: [],
    transactions: [],
    audit: [],
    jobs: {},
    job_seq: 0,
  };
  if (opts.populated) {
    // Looks like a quarter that was imported and categorised a few minutes ago.
    applySync(s, new Date(now - 15 * 60_000).toISOString());
    categoriseRows(s, uncategorisedInPlanOrder(s), new Date(now - 12 * 60_000).toISOString());
  }
  return s;
}

/** Current state; falls back to a fresh, unsynced state when storage is empty or stale. */
export function getState(): DemoState {
  if (!cache) {
    cache = load() ?? freshState({ populated: false });
    save(cache);
  }
  return cache;
}

export function mutate<T>(fn: (s: DemoState) => T): T {
  const s = getState();
  const result = fn(s);
  save(s);
  return result;
}

export function resetState(opts: { populated: boolean }): DemoState {
  cache = freshState(opts);
  save(cache);
  return cache;
}

// ── Selectors ────────────────────────────────────────────────────────────────

export function findTransaction(s: DemoState, id: string): Transaction | undefined {
  return s.transactions.find((t) => t.id === id);
}

/** Audit rows for one entity, oldest first. */
export function auditFor(s: DemoState, entityId: string): AuditLog[] {
  return s.audit.filter((a) => a.entity_id === entityId);
}

export function uncategorisedInPlanOrder(s: DemoState): string[] {
  return planOrder()
    .map((t) => t.id)
    .filter((id) => findTransaction(s, id)?.categorisation_status === "uncategorised");
}

// ── Mutations ────────────────────────────────────────────────────────────────

export function applySync(s: DemoState, at: string): { synced_accounts: number; synced_transactions: number } {
  if (!s.synced_at) {
    s.accounts = seedAccounts();
    s.transactions = seedTransactions(at);
  }
  s.synced_at = at;
  return { synced_accounts: s.accounts.length, synced_transactions: s.transactions.length };
}

export interface TierCounts {
  auto_categorised: number;
  suggested: number;
  needs_review: number;
}

/** Applies the seed's categorisation plan to the given rows and writes one ai_categorise audit row each. */
export function categoriseRows(s: DemoState, ids: string[], at: string): TierCounts {
  const counts: TierCounts = { auto_categorised: 0, suggested: 0, needs_review: 0 };
  for (const id of ids) {
    const tx = findTransaction(s, id);
    const seed = seedRow(id);
    if (!tx || !seed) continue;
    const { plan } = seed;
    const old_value = { category: tx.category, categorisation_status: tx.categorisation_status };
    tx.category = plan.category;
    tx.category_confidence = plan.confidence.toFixed(2);
    tx.categorisation_status = plan.tier;
    tx.updated_at = at;
    s.audit.push({
      id: newId(),
      organisation_id: ORG_ID,
      action: "ai_categorise",
      entity_type: "transaction",
      entity_id: id,
      old_value,
      new_value: {
        category: plan.category,
        category_code: plan.category_code,
        categorisation_status: plan.tier,
        confidence: plan.confidence,
      },
      ai_model: plan.model,
      ai_confidence: plan.confidence.toFixed(2),
      ai_explanation: seed.reasoning,
      ai_decision_data: { ...plan.decision, category_code: plan.category_code },
      created_at: at,
    });
    counts[plan.tier] += 1;
  }
  return counts;
}

function humanAudit(
  s: DemoState,
  tx: Transaction,
  action: "human_approve" | "human_reject" | "human_correct",
  old_value: Record<string, unknown>,
  new_value: Record<string, unknown>,
  at: string,
) {
  s.audit.push({
    id: newId(),
    organisation_id: ORG_ID,
    action,
    entity_type: "transaction",
    entity_id: tx.id,
    old_value,
    new_value,
    ai_model: null,
    ai_confidence: null,
    ai_explanation: null,
    ai_decision_data: null,
    created_at: at,
  });
}

function requireTransaction(s: DemoState, id: string): Transaction {
  const tx = findTransaction(s, id);
  if (!tx) throw new Error("Transaction not found");
  return tx;
}

export function approveTransaction(s: DemoState, id: string, at: string): Transaction {
  const tx = requireTransaction(s, id);
  if (!tx.category) throw new Error("Transaction has no category to approve. Run categorisation first.");
  const old_value = { category: tx.category, categorisation_status: tx.categorisation_status };
  tx.categorisation_status = "confirmed";
  tx.updated_at = at;
  humanAudit(s, tx, "human_approve", old_value, { category: tx.category, categorisation_status: "confirmed" }, at);
  return tx;
}

export function rejectTransaction(s: DemoState, id: string, at: string): Transaction {
  const tx = requireTransaction(s, id);
  if (!tx.category) throw new Error("Transaction has no category to reject.");
  const old_value = { category: tx.category, categorisation_status: tx.categorisation_status };
  tx.category = null;
  tx.category_confidence = null;
  tx.categorisation_status = "uncategorised";
  tx.updated_at = at;
  humanAudit(s, tx, "human_reject", old_value, { category: null, categorisation_status: "uncategorised" }, at);
  return tx;
}

export function correctTransaction(
  s: DemoState,
  id: string,
  body: { category: string; category_code?: string },
  at: string,
): Transaction {
  const tx = requireTransaction(s, id);
  const category = body.category?.trim();
  if (!category) throw new Error("A category name is required.");
  const category_code = body.category_code ?? accountByName(category)?.code ?? null;
  const old_value = { category: tx.category, categorisation_status: tx.categorisation_status };
  tx.category = category;
  tx.categorisation_status = "confirmed";
  tx.updated_at = at;
  humanAudit(s, tx, "human_correct", old_value, { category, category_code, categorisation_status: "confirmed" }, at);
  return tx;
}
