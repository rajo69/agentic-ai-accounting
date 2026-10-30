// Demo state: the demo organisation's rows, audit log and jobs, persisted in localStorage.
// Mutations live here so that jobs.ts and server.ts stay thin; every mutation goes through
// `mutate()` so the state is written back after each change.
import type { AuditLog, BankStatement, GeneratedDocument, JobRead, TeamMember, Transaction } from "@/lib/api";
import { FIGURES_FOR, inPeriod } from "./figures";
import { decide, explainMatch, inWindow, scoreCandidates, type ScoredCandidate } from "./match";
import {
  ORG_ID,
  SEED_VERSION,
  planOrder,
  seedAccounts,
  seedRow,
  seedStatements,
  seedTeam,
  seedTransactions,
  type DemoAccount,
} from "./seed";

export const STORAGE_KEY = "demo_state_v3";
/** Earlier shapes; cleared on exit so nothing lingers. */
export const STALE_STORAGE_KEYS = ["demo_state_v2"];

/** The model the backend records on generated documents (`document_service.LLM_MODEL`). */
export const DOCUMENT_MODEL = "claude-sonnet-4-6";
export const DOCUMENT_TEMPLATES = ["management_letter", "profit_loss", "vat_summary"] as const;
export type DocumentTemplate = (typeof DOCUMENT_TEMPLATES)[number];

export interface DemoState {
  version: string;
  created_at: string;
  synced_at: string | null;
  accounts: DemoAccount[];
  transactions: Transaction[];
  statements: BankStatement[];
  documents: GeneratedDocument[];
  team: TeamMember[];
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
    return parsed.version === SEED_VERSION && Array.isArray(parsed.statements) ? parsed : null;
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
  const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString();
  const s: DemoState = {
    version: SEED_VERSION,
    created_at: new Date(now).toISOString(),
    synced_at: null,
    accounts: [],
    transactions: [],
    statements: [],
    documents: [],
    team: seedTeam(new Date(now).toISOString()),
    audit: [],
    jobs: {},
    job_seq: 0,
  };
  if (opts.populated) {
    // Looks like a quarter that was imported a few minutes ago and partly worked: 30 of 50 rows
    // categorised (24 auto, 6 suggested) and 18 of 32 statement lines reconciled, so the lists are
    // full of decisions to look at while Categorise and Reconcile still have a mixed batch to run
    // (20 rows: 6 auto / 7 suggested / 7 review; 14 lines: 2 auto / 7 suggested / 5 review).
    applySync(s, minutesAgo(15));
    const rows = uncategorisedInPlanOrder(s); // plan order, so the index is the plan position
    categoriseRows(s, rows.filter((_, i) => i < 24 || (i >= 30 && i < 36)), minutesAgo(12));
    const lines = unmatchedStatementIds(s); // seed order
    reconcileStatements(s, lines.filter((_, i) => i < 14 || (i >= 20 && i < 24)), minutesAgo(10));
    const [start, end] = bookPeriod(s);
    generateDemoDocument(s, { template: "vat_summary", period_start: start, period_end: end }, minutesAgo(8));
    generateDemoDocument(s, { template: "profit_loss", period_start: start, period_end: end }, minutesAgo(7));
    generateDemoDocument(s, { template: "management_letter", period_start: start, period_end: end }, minutesAgo(6));
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

/** Bytes the persisted state takes, for the settings page. */
export function storageBytes(): number {
  try {
    return new Blob([localStorage.getItem(STORAGE_KEY) ?? ""]).size;
  } catch {
    return 0;
  }
}

// ── Selectors ────────────────────────────────────────────────────────────────

export function findTransaction(s: DemoState, id: string): Transaction | undefined {
  return s.transactions.find((t) => t.id === id);
}

export function findStatement(s: DemoState, id: string): BankStatement | undefined {
  return s.statements.find((b) => b.id === id);
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

export function unmatchedStatementIds(s: DemoState): string[] {
  return s.statements.filter((b) => b.match_status === "unmatched").map((b) => b.id);
}

/** First and last transaction dates of the synced book (ISO), the period the seeded documents cover. */
export function bookPeriod(s: DemoState): [string, string] {
  const dates = s.transactions.map((t) => t.date).sort();
  return [dates[0] ?? s.created_at.slice(0, 10), dates[dates.length - 1] ?? s.created_at.slice(0, 10)];
}

/** The reconciler's candidate window and scores for one statement line, best first. */
export function candidatesFor(s: DemoState, bs: BankStatement): ScoredCandidate[] {
  const window = s.transactions.filter((t) => inWindow(bs, t)).slice(0, 10);
  return scoreCandidates(bs, window);
}

// ── Audit helpers ────────────────────────────────────────────────────────────

function pushAudit(
  s: DemoState,
  row: Omit<AuditLog, "id" | "organisation_id" | "created_at"> & { created_at: string },
) {
  s.audit.push({ id: newId(), organisation_id: ORG_ID, ...row });
}

function humanRow(
  entity_type: "transaction" | "bank_statement",
  entity_id: string,
  action: string,
  old_value: Record<string, unknown> | null,
  new_value: Record<string, unknown>,
  created_at: string,
) {
  return {
    action,
    entity_type,
    entity_id,
    old_value,
    new_value,
    ai_model: null,
    ai_confidence: null,
    ai_explanation: null,
    ai_decision_data: null,
    created_at,
  };
}

// ── Mutations: sync and categorisation ───────────────────────────────────────

export function applySync(
  s: DemoState,
  at: string,
): { synced_accounts: number; synced_transactions: number; synced_bank_statements: number } {
  if (!s.synced_at) {
    s.accounts = seedAccounts();
    s.transactions = seedTransactions(at);
    s.statements = seedStatements(s.transactions, at);
  }
  s.synced_at = at;
  return {
    synced_accounts: s.accounts.length,
    synced_transactions: s.transactions.length,
    synced_bank_statements: s.statements.length,
  };
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
    pushAudit(s, {
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
  pushAudit(s, humanRow("transaction", tx.id, "human_approve", old_value, { category: tx.category, categorisation_status: "confirmed" }, at));
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
  pushAudit(s, humanRow("transaction", tx.id, "human_reject", old_value, { category: null, categorisation_status: "uncategorised" }, at));
  return tx;
}

export function correctTransaction(
  s: DemoState,
  id: string,
  body: { category: string; category_code?: string },
  at: string,
): Transaction {
  const tx = requireTransaction(s, id);
  // As in the backend: the code wins when given, otherwise the name; either must be in the chart.
  // A correction is a human decision, stored at full confidence.
  const name = body.category?.trim().toLowerCase();
  const account = body.category_code
    ? s.accounts.find((a) => a.code === body.category_code)
    : s.accounts.find((a) => a.name.toLowerCase() === name);
  if (!account) throw new Error(`Account '${body.category}' not found in chart of accounts`);
  const old_value = { category: tx.category, categorisation_status: tx.categorisation_status };
  tx.category = account.name;
  tx.category_confidence = "1.0000";
  tx.categorisation_status = "confirmed";
  tx.updated_at = at;
  pushAudit(s, humanRow("transaction", tx.id, "human_correct", old_value, { category: account.name, category_code: account.code, categorisation_status: "confirmed" }, at));
  return tx;
}

// ── Mutations: reconciliation ────────────────────────────────────────────────

export interface MatchCounts {
  auto_matched: number;
  suggested: number;
  needs_review: number;
}

/** The reconciler agent over the given statement lines: score, decide, explain, save, one ai_reconcile row each. */
export function reconcileStatements(s: DemoState, ids: string[], at: string): MatchCounts {
  const counts: MatchCounts = { auto_matched: 0, suggested: 0, needs_review: 0 };
  for (const id of ids) {
    const bs = findStatement(s, id);
    if (!bs) continue;
    // The agent only considers records not yet reconciled; the detail view considers all of them.
    const scored = candidatesFor(s, bs).filter((c) => !findTransaction(s, c.transaction_id)?.is_reconciled);
    const { status, best, confidence } = decide(scored);
    if (best) {
      bs.matched_transaction_id = best.transaction_id;
      bs.match_confidence = confidence.toFixed(4);
    }
    bs.match_status = status;
    bs.updated_at = at;
    if (status === "auto_matched" && best) {
      const tx = findTransaction(s, best.transaction_id);
      if (tx) {
        tx.is_reconciled = true;
        tx.updated_at = at;
      }
    }
    pushAudit(s, {
      action: "ai_reconcile",
      entity_type: "bank_statement",
      entity_id: bs.id,
      old_value: null,
      new_value: {
        match_status: status,
        matched_transaction_id: best?.transaction_id ?? null,
        confidence: Math.round(confidence * 10_000) / 10_000,
      },
      ai_model: null,
      ai_confidence: confidence ? confidence.toFixed(4) : null,
      ai_explanation: explainMatch(bs, best),
      ai_decision_data: {
        candidates_count: scored.length,
        top_scores: scored.slice(0, 3).map((c) => ({ transaction_id: c.transaction_id, combined_score: c.combined_score })),
      },
      created_at: at,
    });
    counts[status] += 1;
  }
  return counts;
}

function requireStatement(s: DemoState, id: string): BankStatement {
  const bs = findStatement(s, id);
  if (!bs) throw new Error("Bank statement not found");
  return bs;
}

function setReconciled(s: DemoState, txId: string | null, value: boolean, at: string) {
  if (!txId) return;
  const tx = findTransaction(s, txId);
  if (tx) {
    tx.is_reconciled = value;
    tx.updated_at = at;
  }
}

export function confirmStatementMatch(s: DemoState, id: string, at: string): BankStatement {
  const bs = requireStatement(s, id);
  if (!["suggested", "auto_matched", "needs_review"].includes(bs.match_status)) {
    throw new Error(`Cannot confirm a statement with status '${bs.match_status}'`);
  }
  if (!bs.matched_transaction_id) throw new Error("No matched transaction to confirm");
  const old_status = bs.match_status;
  bs.match_status = "confirmed";
  bs.updated_at = at;
  setReconciled(s, bs.matched_transaction_id, true, at);
  pushAudit(s, humanRow("bank_statement", bs.id, "human_confirm_match", { match_status: old_status }, { match_status: "confirmed", matched_transaction_id: bs.matched_transaction_id }, at));
  return bs;
}

export function unmatchStatement(s: DemoState, id: string, at: string): BankStatement {
  const bs = requireStatement(s, id);
  if (bs.match_status === "unmatched") throw new Error("Statement is already unmatched");
  const old_status = bs.match_status;
  const old_tx = bs.matched_transaction_id;
  setReconciled(s, old_tx, false, at);
  bs.match_status = "unmatched";
  bs.matched_transaction_id = null;
  bs.match_confidence = null;
  bs.updated_at = at;
  pushAudit(s, humanRow("bank_statement", bs.id, "human_unmatch", { match_status: old_status, matched_transaction_id: old_tx }, { match_status: "unmatched" }, at));
  return bs;
}

export function manualMatchStatement(s: DemoState, id: string, transactionId: string, at: string): BankStatement {
  const bs = requireStatement(s, id);
  const tx = requireTransaction(s, transactionId);
  const old_status = bs.match_status;
  const old_tx = bs.matched_transaction_id;
  if (old_tx && old_tx !== tx.id) setReconciled(s, old_tx, false, at);
  bs.matched_transaction_id = tx.id;
  bs.match_status = "confirmed";
  bs.match_confidence = null; // a manual match carries no AI confidence
  bs.updated_at = at;
  setReconciled(s, tx.id, true, at);
  pushAudit(s, humanRow("bank_statement", bs.id, "human_manual_match", { match_status: old_status, matched_transaction_id: old_tx }, { match_status: "confirmed", matched_transaction_id: tx.id }, at));
  return bs;
}

// ── Mutations: documents ─────────────────────────────────────────────────────

export interface DocumentRequest {
  template: string;
  period_start: string;
  period_end: string;
}

export function addDocument(
  s: DemoState,
  req: DocumentRequest,
  at: string,
  source: Transaction[] = s.transactions,
): GeneratedDocument {
  const compute = FIGURES_FOR[req.template];
  if (!compute) {
    throw new Error(`Unknown template '${req.template}'. Supported: ${JSON.stringify([...DOCUMENT_TEMPLATES].sort())}`);
  }
  const rows = inPeriod(source, req.period_start, req.period_end);
  const doc: GeneratedDocument = {
    id: newId(),
    organisation_id: ORG_ID,
    template: req.template,
    period_start: req.period_start,
    period_end: req.period_end,
    ai_model: DOCUMENT_MODEL,
    figures: compute(rows, req.period_start, req.period_end),
    generated_at: at,
  };
  s.documents.push(doc);
  pushAudit(s, {
    action: "generate_document",
    entity_type: "generated_document",
    entity_id: doc.id,
    old_value: null,
    new_value: { template: req.template, period_start: req.period_start, period_end: req.period_end },
    ai_model: DOCUMENT_MODEL,
    ai_confidence: null,
    ai_explanation: "Narrative sections replayed from the demo's pre-written drafts",
    ai_decision_data: { transaction_count: rows.length },
    created_at: at,
  });
  return doc;
}

/**
 * What `POST /documents/generate` does in the demo: the PDFs are rendered once from the whole
 * imported book (`scripts/build-demo-pdfs.py`), so the recorded row covers that same period and
 * carries the same figures, whatever dates the picker sent. The request is still validated.
 */
export function generateDemoDocument(s: DemoState, req: DocumentRequest, at: string): GeneratedDocument {
  const [period_start, period_end] = bookPeriod(s);
  // Figures on the seed's planned categories, the same book the PDFs were rendered from, so the
  // row and the file agree whether or not the rows on screen have been categorised yet.
  const planned = s.transactions.map((t) => ({ ...t, category: seedRow(t.id)?.plan.category ?? t.category }));
  return addDocument(s, { template: req.template, period_start, period_end }, at, planned);
}

// ── Mutations: team ──────────────────────────────────────────────────────────

export function inviteMember(s: DemoState, body: { email: string; name: string }, at: string): TeamMember {
  const email = body.email?.trim().toLowerCase();
  const name = body.name?.trim();
  if (!email || !name) throw new Error("Email and name are required");
  if (s.team.some((m) => m.email.toLowerCase() === email)) throw new Error("A member with this email already exists");
  const member: TeamMember = { id: newId(), organisation_id: ORG_ID, email, name, role: "member", created_at: at };
  s.team.push(member);
  return member;
}

export function removeMember(s: DemoState, userId: string): { status: string; user_id: string } {
  const member = s.team.find((m) => m.id === userId);
  if (!member) throw new Error("Member not found");
  if (member.role === "owner") throw new Error("Cannot remove the owner");
  s.team = s.team.filter((m) => m.id !== userId);
  return { status: "removed", user_id: userId };
}
