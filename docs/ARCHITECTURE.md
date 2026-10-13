# Architecture (current, October 2026)

This is the short, current description of how AI Accountant is built. It replaces the March 2026 design document.
Every statement here was checked against the code at the commit that introduced this file.

![System diagram](media/architecture.svg)

## Shape

| Layer | What runs there |
|---|---|
| Browser | Next.js 14 (App Router, TypeScript, Tailwind 3.4, Base UI primitives) on Vercel. The landing page, the review console (dashboard, transactions, reconciliation, documents, team, settings) and a browser-only demo mode (`frontend/src/demo/`) that answers every API call from a seeded demo company without touching the network. |
| API | FastAPI on Railway, 34 routes: 31 under `/api/v1`, the two OAuth endpoints and `/health`. Pydantic v2 schemas on every boundary. JWT (HS256, 24 h) carrying `org_id` and `user_id`; every query is scoped by the organisation taken from the session, never from model output. |
| Workflows | Two LangGraph state machines in `backend/app/agents/`: the categoriser (fetch context, classify, validate, decide, explain) and the reconciler (find candidates, score, decide, explain, save). Linear graphs with no conditional edges and no model-chosen tools: workflows, not autonomous agents. |
| Models | Claude Haiku 4.5 (pinned snapshot) first; Claude Sonnet 4.6 when Haiku's confidence is below 0.85; Sonnet for document narratives. All calls go through Instructor, which forces tool-use output into Pydantic models and retries on validation failure. Embeddings are local (`sentence-transformers/all-MiniLM-L6-v2`, 384 dimensions). |
| Data | PostgreSQL 16 with pgvector, eight tables, six Alembic migrations. `NUMERIC(12,2)` and Python `Decimal` for money. `audit_logs` holds one row per AI proposal and per human action with the model, confidence, reasoning and risk payload. Redis for the dashboard cache and webhook debounce; the app degrades to no cache when Redis is absent. |
| Integrations | Xero through one adapter (`integrations/xero_adapter.py`, raw `httpx`): OAuth2, transparent token refresh, Fernet-encrypted tokens, 429 backoff, `If-Modified-Since` incremental sync, HMAC-verified webhooks. Sentry for errors and Resend for invitation emails, both optional. |
| Documents | Figures computed in Python, narrative sections from Claude via Instructor, Jinja2 templates rendered to PDF by WeasyPrint. Three templates: management letter, profit and loss, VAT summary. |

## One categorisation, end to end

1. `POST /api/v1/categorise/async` creates a `jobs` row and runs the batch in the process with `asyncio.Semaphore(5)`.
2. For each uncategorised transaction the graph loads the chart of accounts and the five nearest previously categorised
   transactions of the same organisation (cosine distance on pgvector).
3. The classify node sends the transaction, the chart and the precedents to Haiku through Instructor and receives a
   `CategoryPrediction` (code, name, confidence, reasoning). Below 0.85 the same prompt goes to Sonnet and Sonnet's
   answer replaces Haiku's; if Sonnet fails, Haiku's answer stands.
4. Validate checks that the proposed code or name exists in the chart and that confidence is in range; a failure zeroes
   the confidence so the row goes to review.
5. Decide writes the status: `auto_categorised` above 0.85, `suggested` between 0.5 and 0.85, `needs_review` below.
6. Explain runs the fuzzy risk rules and attaches the payload to the audit row.
7. The reviewer approves, corrects or rejects in the console; each action writes its own audit row, and a correction
   re-embeds the transaction so it becomes a precedent for the next similar one.

## Reconciliation on live Xero data

The Xero Accounting API does not expose bank-feed statement lines. The reconciler therefore matches the organisation's
unreconciled bank transactions against invoice and payment records synced from the same organisation, scoring amount
(0.5), date (0.2) and description similarity (0.3), with `auto_matched` above 0.9, `suggested` from 0.6 and
`needs_review` below that or when two candidates are within 0.05.

## Boundaries that hold

- LLM calls only in `services/` and `agents/`; routes never call a model.
- Xero calls only through the adapter; nothing is ever written back to Xero.
- Every AI decision and every human decision writes an audit row.
- Structured output only; no free-text parsing of model responses.
- The organisation always comes from the session.
