// The fake server: a route table over the demo store, called from `apiFetch` when demo mode is on.
// Paths are matched without the "/api/v1" prefix. Responses are deep-copied so the UI never holds
// a reference into the store. Unknown routes throw, which surfaces as an error toast, the same
// way an unexpected HTTP error would.
import type {
  BankStatement,
  BankStatementDetail,
  BankStatementListResponse,
  DashboardSummary,
  ExplanationResponse,
  GeneratedDocument,
  JobSubmitResponse,
  Me,
  TeamMember,
  Transaction,
  TransactionDetail,
  TransactionListResponse,
} from "@/lib/api";
import { FIRST_SYNC_JOB_ID, createJob, tickJob } from "./jobs";
import { DEMO_USER, ORG_ID, ORG_NAME, accountByCode, accountByName, seedRow } from "./seed";
import {
  DOCUMENT_TEMPLATES,
  applySync,
  approveTransaction,
  auditFor,
  candidatesFor,
  categoriseRows,
  confirmStatementMatch,
  correctTransaction,
  findStatement,
  findTransaction,
  generateDemoDocument,
  getState,
  inviteMember,
  manualMatchStatement,
  mutate,
  nowIso,
  reconcileStatements,
  rejectTransaction,
  removeMember,
  uncategorisedInPlanOrder,
  unmatchStatement,
  unmatchedStatementIds,
  type DemoState,
  type DocumentRequest,
} from "./store";

type Method = "GET" | "POST" | "DELETE";
type Handler = (m: RegExpMatchArray, q: URLSearchParams, body: unknown) => unknown;
interface Route {
  method: Method;
  pattern: RegExp;
  handler: Handler;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const toNumber = (v: string | null): number | null => (v === null ? null : Number(v));

function paging(q: URLSearchParams): { page: number; pageSize: number } {
  return {
    page: Math.max(1, Number(q.get("page") ?? 1) || 1),
    pageSize: Math.min(100, Math.max(1, Number(q.get("page_size") ?? 20) || 20)),
  };
}

// ── Handlers: dashboard and transactions ─────────────────────────────────────

function summary(s: DemoState): DashboardSummary {
  return {
    total_accounts: s.accounts.length,
    total_transactions: s.transactions.length,
    uncategorised_count: s.transactions.filter((t) => t.categorisation_status === "uncategorised").length,
    unreconciled_count: s.transactions.filter((t) => !t.is_reconciled).length,
    last_sync_at: s.synced_at,
    organisation_name: ORG_NAME,
  };
}

function listTransactions(s: DemoState, q: URLSearchParams): TransactionListResponse {
  const { page, pageSize } = paging(q);
  const status = q.get("status");
  const search = q.get("search")?.trim().toLowerCase();
  const from = q.get("date_from");
  const to = q.get("date_to");

  const rows = s.transactions
    .filter((t) => !status || t.categorisation_status === status)
    .filter(
      (t) =>
        !search ||
        t.description.toLowerCase().includes(search) ||
        (t.reference ?? "").toLowerCase().includes(search) ||
        (t.category ?? "").toLowerCase().includes(search),
    )
    .filter((t) => !from || t.date >= from)
    .filter((t) => !to || t.date <= to)
    .sort((a, b) => b.date.localeCompare(a.date) || a.description.localeCompare(b.description));

  return { items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, page_size: pageSize };
}

function transactionDetail(s: DemoState, id: string): TransactionDetail {
  const tx = findTransaction(s, id);
  if (!tx) throw new Error("Transaction not found");
  return { ...tx, audit_history: auditFor(s, id) };
}

function explanation(s: DemoState, id: string): ExplanationResponse {
  const tx = findTransaction(s, id);
  const seed = seedRow(id);
  if (!tx || !seed) throw new Error("Transaction not found");
  const history = auditFor(s, id);
  const lastAi = [...history].reverse().find((a) => a.action === "ai_categorise");
  const categorised = tx.category !== null;
  const code = tx.category ? (accountByName(tx.category)?.code ?? null) : null;
  return {
    transaction_id: id,
    category: tx.category,
    category_confidence: toNumber(tx.category_confidence),
    categorisation_status: tx.categorisation_status,
    prediction: categorised
      ? {
          category: tx.category,
          confidence: toNumber(tx.category_confidence),
          reasoning: seed.reasoning,
          model: lastAi?.ai_model ?? seed.plan.model,
          category_code: code ?? accountByCode(seed.plan.category_code)?.code ?? null,
        }
      : null,
    xai: { model_type: "llm", top_features: [], explanation_text: categorised ? seed.reasoning : null },
    risk: { ...seed.risk, fired_rules: [...seed.risk.fired_rules], input_values: { ...seed.risk.input_values } },
    audit_history: history.map((a) => ({
      id: a.id,
      action: a.action,
      ai_model: a.ai_model,
      ai_confidence: toNumber(a.ai_confidence),
      ai_explanation: a.ai_explanation,
      new_value: a.new_value,
      created_at: a.created_at,
    })),
  };
}

// ── Handlers: reconciliation ─────────────────────────────────────────────────

function listStatements(s: DemoState, q: URLSearchParams): BankStatementListResponse {
  const { page, pageSize } = paging(q);
  const status = q.get("match_status");
  const from = q.get("date_from");
  const to = q.get("date_to");
  const rows = s.statements
    .filter((b) => !status || b.match_status === status)
    .filter((b) => !from || b.date >= from)
    .filter((b) => !to || b.date <= to)
    .sort((a, b) => b.date.localeCompare(a.date) || a.xero_id.localeCompare(b.xero_id));
  return { items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, page_size: pageSize };
}

function statementDetail(s: DemoState, id: string): BankStatementDetail {
  const bs = findStatement(s, id);
  if (!bs) throw new Error("Bank statement not found");
  // Newest first, as the backend orders it.
  const audit_history = auditFor(s, id).slice().reverse();
  return { ...bs, candidates: candidatesFor(s, bs), audit_history };
}

// ── Handlers: documents, team, jobs ──────────────────────────────────────────

function listDocuments(s: DemoState): GeneratedDocument[] {
  return [...s.documents].sort((a, b) => b.generated_at.localeCompare(a.generated_at));
}

function documentRequest(body: unknown): DocumentRequest {
  const b = (body ?? {}) as Partial<Record<keyof DocumentRequest, unknown>>;
  const req = {
    template: typeof b.template === "string" ? b.template : "",
    period_start: typeof b.period_start === "string" ? b.period_start.slice(0, 10) : "",
    period_end: typeof b.period_end === "string" ? b.period_end.slice(0, 10) : "",
  };
  if (!(DOCUMENT_TEMPLATES as readonly string[]).includes(req.template)) {
    throw new Error(`Unknown template '${req.template}'. Supported: ${JSON.stringify([...DOCUMENT_TEMPLATES].sort())}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.period_start) || !/^\d{4}-\d{2}-\d{2}$/.test(req.period_end)) {
    throw new Error("period_start and period_end must be ISO dates");
  }
  if (req.period_start > req.period_end) throw new Error("period_start must be before period_end");
  return req;
}

function submitted(job: { id: string; status: string; kind: string }): JobSubmitResponse {
  return { job_id: job.id, status: job.status, kind: job.kind };
}

const me: Me = {
  org_id: ORG_ID,
  org_name: ORG_NAME,
  user_id: DEMO_USER.id,
  user_name: DEMO_USER.name,
  user_email: DEMO_USER.email,
  role: "owner",
};

const correctBody = (body: unknown): { category: string; category_code?: string } => {
  const b = (body ?? {}) as { category?: unknown; category_code?: unknown };
  return {
    category: typeof b.category === "string" ? b.category : "",
    category_code: typeof b.category_code === "string" ? b.category_code : undefined,
  };
};

const stringField = (body: unknown, key: string): string => {
  const v = ((body ?? {}) as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
};

// ── Route table ──────────────────────────────────────────────────────────────

const routes: Route[] = [
  { method: "GET", pattern: /^\/dashboard\/summary$/, handler: () => summary(getState()) },
  {
    method: "POST",
    pattern: /^\/sync$/,
    handler: () => mutate((s) => ({ status: "completed", ...applySync(s, nowIso()), message: null })),
  },
  {
    method: "POST",
    pattern: /^\/categorise$/,
    handler: () =>
      mutate((s) => {
        const ids = uncategorisedInPlanOrder(s);
        return { ...categoriseRows(s, ids, nowIso()), errors: 0, total_processed: ids.length };
      }),
  },
  { method: "POST", pattern: /^\/categorise\/async$/, handler: () => mutate((s) => submitted(createJob(s, "categorise"))) },
  {
    method: "POST",
    pattern: /^\/reconcile$/,
    handler: () =>
      mutate((s) => {
        const ids = unmatchedStatementIds(s);
        return { ...reconcileStatements(s, ids, nowIso()), errors: 0, total_processed: ids.length };
      }),
  },
  { method: "POST", pattern: /^\/reconcile\/async$/, handler: () => mutate((s) => submitted(createJob(s, "reconcile"))) },

  { method: "GET", pattern: /^\/transactions$/, handler: (_m, q) => listTransactions(getState(), q) },
  { method: "GET", pattern: /^\/transactions\/([^/]+)$/, handler: (m) => transactionDetail(getState(), m[1]) },
  {
    method: "POST",
    pattern: /^\/transactions\/([^/]+)\/approve$/,
    handler: (m) => mutate((s): Transaction => approveTransaction(s, m[1], nowIso())),
  },
  {
    method: "POST",
    pattern: /^\/transactions\/([^/]+)\/reject$/,
    handler: (m) => mutate((s): Transaction => rejectTransaction(s, m[1], nowIso())),
  },
  {
    method: "POST",
    pattern: /^\/transactions\/([^/]+)\/correct$/,
    handler: (m, _q, body) => mutate((s): Transaction => correctTransaction(s, m[1], correctBody(body), nowIso())),
  },
  { method: "GET", pattern: /^\/transactions\/([^/]+)\/explanation$/, handler: (m) => explanation(getState(), m[1]) },

  { method: "GET", pattern: /^\/bank-statements$/, handler: (_m, q) => listStatements(getState(), q) },
  { method: "GET", pattern: /^\/bank-statements\/([^/]+)$/, handler: (m) => statementDetail(getState(), m[1]) },
  {
    method: "POST",
    pattern: /^\/bank-statements\/([^/]+)\/confirm$/,
    handler: (m) => mutate((s): BankStatement => confirmStatementMatch(s, m[1], nowIso())),
  },
  {
    method: "POST",
    pattern: /^\/bank-statements\/([^/]+)\/unmatch$/,
    handler: (m) => mutate((s): BankStatement => unmatchStatement(s, m[1], nowIso())),
  },
  {
    method: "POST",
    pattern: /^\/bank-statements\/([^/]+)\/match$/,
    handler: (m, _q, body) =>
      mutate((s): BankStatement => manualMatchStatement(s, m[1], stringField(body, "transaction_id"), nowIso())),
  },

  { method: "GET", pattern: /^\/documents$/, handler: () => listDocuments(getState()) },
  {
    method: "POST",
    pattern: /^\/documents\/generate\/async$/,
    handler: (_m, _q, body) => {
      const req = documentRequest(body);
      return mutate((s) => submitted(createJob(s, "document", undefined, { request: req })));
    },
  },

  { method: "GET", pattern: /^\/auth\/me$/, handler: () => me },
  { method: "GET", pattern: /^\/auth\/team$/, handler: () => getState().team },
  {
    method: "POST",
    pattern: /^\/auth\/invite$/,
    handler: (_m, _q, body) =>
      mutate((s): TeamMember => inviteMember(s, { email: stringField(body, "email"), name: stringField(body, "name") }, nowIso())),
  },
  { method: "DELETE", pattern: /^\/auth\/team\/([^/]+)$/, handler: (m) => mutate((s) => removeMember(s, m[1])) },

  {
    method: "GET",
    pattern: /^\/jobs\/([^/]+)$/,
    handler: (m) =>
      mutate((s) => {
        let job = s.jobs[m[1]];
        // The first-run job is announced by enterDemo() before any state exists; create it on demand.
        if (!job && m[1] === FIRST_SYNC_JOB_ID) job = createJob(s, "sync", FIRST_SYNC_JOB_ID);
        if (!job) throw new Error("Job not found");
        return tickJob(s, job);
      }),
  },
];

// ── Entry points ─────────────────────────────────────────────────────────────

export async function demoHandle<T>(path: string, options?: RequestInit): Promise<T> {
  const method = (options?.method ?? "GET").toUpperCase() as Method;
  const [rawPath, query = ""] = path.replace(/^\/api\/v1/, "").split("?");
  const q = new URLSearchParams(query);
  let body: unknown = null;
  if (typeof options?.body === "string") {
    try {
      body = JSON.parse(options.body);
    } catch {
      body = options.body;
    }
  }
  await sleep(150 + Math.random() * 300);
  const route = routes.find((r) => r.method === method && r.pattern.test(rawPath));
  if (!route) throw new Error(`demo: no route for ${method} ${rawPath}`);
  const match = rawPath.match(route.pattern) as RegExpMatchArray;
  return clone(route.handler(match, q, body)) as T;
}

/**
 * `POST /documents/generate` returns PDF bytes in the real app. The demo records the document
 * (figures from the current book) and serves the static PDF for the template from `public/demo/`,
 * rendered from the real templates by `scripts/build-demo-pdfs.py`.
 */
export async function demoGenerateDocument(body: {
  template: string;
  period_start: string;
  period_end: string;
}): Promise<Response> {
  let req: DocumentRequest;
  try {
    req = documentRequest(body);
  } catch (e) {
    return new Response(e instanceof Error ? e.message : String(e), { status: 400, headers: { "Content-Type": "text/plain" } });
  }
  const [pdf] = await Promise.all([fetch(`/demo/${req.template}.pdf`, { cache: "force-cache" }), sleep(1500)]);
  if (!pdf.ok) {
    return new Response(`Demo: the ${req.template} PDF is missing from this build.`, {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }
  const bytes = await pdf.arrayBuffer();
  mutate((s) => generateDemoDocument(s, req, nowIso()));
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${req.template}_${req.period_start}_${req.period_end}.pdf"`,
    },
  });
}
