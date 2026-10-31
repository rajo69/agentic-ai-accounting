# AI Accountant: one-page summary

**What it is.** A deployed, open-source review console for UK small businesses and the bookkeepers who serve them. Xero's AI codes the books; this app sits after it and before the sign-off, proposing a category for every transaction with written reasoning, a confidence tier and a risk flag, matching bank transactions to invoices and payments, drafting the quarter's management letter, and recording every AI proposal and every human decision in an audit trail. Full story: [README](README.md#who-it-is-for-and-why-it-exists).

**Who built it.** Rajarshi Nandi, March to October 2026. Backend, AI pipeline, frontend, demo mode, deployment, evaluation, documentation and a published self-review. GitHub: [rajo69/agentic-ai-accounting](https://github.com/rajo69/agentic-ai-accounting).

**See it in two minutes.** [Launch the demo](https://agentic-ai-accounting.vercel.app/demo) (runs in the browser, no account) or [watch the 2-minute video](https://youtu.be/icLQG596Ctg).

## What it demonstrates

| Area | Evidence in the repository |
|---|---|
| Backend, integration and delivery | A FastAPI service with 34 routes, async SQLAlchemy, Alembic migrations, a custom Xero OAuth2 adapter (token refresh, encryption, rate-limit backoff, incremental sync, HMAC webhooks), a Next.js 14 console, 117 tests in CI with a pgvector service container, and a production incident handled and written up. [Architecture](README.md#architecture) · [Engineering record](README.md#engineering-record) |
| LLM pipeline | LangGraph workflows calling Claude through one gateway (structured output validated by Pydantic, a profile flag for the model set, moved from Claude 4.x to 5.5 behind a pre-registered A/B); Haiku-first routing with Sonnet escalation and a full audit row; pgvector precedent retrieval so corrections become few-shot examples; an eval harness with hard gates, caching and a budget guard, and a written statement of what the eval measures. [Design decisions](README.md#design-decisions-and-trade-offs) · [Evaluation](README.md#evaluation) |
| Evaluation and risk scoring | Fixture design by difficulty tier, confidence calibration tables, acceptance gates, a provenance rule for every published number, a glass-box fuzzy risk engine with eight readable rules, and research questions on per-organisation calibration, explanation utility and active review selection. [Evaluation](README.md#evaluation) · [Explainability](README.md#explainability-and-risk-scoring) |

## Facts you can check

| Fact | Where |
|---|---|
| 34 API routes, matching the live OpenAPI document | `backend/app/api/v1/`, `/openapi.json` on the deployed API |
| 117 tests in 12 files, run on every push with migrations against Postgres | `backend/tests/`, `.github/workflows/ci.yml` |
| 50 labelled eval fixtures generated with Claude, none taken from Xero (31 easy, 15 medium, 4 hard), 20 chart codes, gates enforced by the runner | `backend/evals/` |
| One audit row per AI decision and per human action, with model, confidence and reasoning | `backend/app/models/database.py`, `agents/categoriser.py` |
| Money is `NUMERIC(12,2)` and `Decimal` in the data layer | models and migrations |
| Six-lens self-review: 106 findings, 14 high, 0 critical, top findings published with status and fixes | [Self-review](docs/SELF_REVIEW.md) |
| No accuracy or cost figure without a committed provenance file | [Evaluation](README.md#evaluation) |

## What runs live

The live pipeline runs against a connected Xero organisation with real Claude calls: sync, categorise, reconcile, generate the letter, record every decision.

## Stack in one line

Python 3.12 · FastAPI · SQLAlchemy 2.0 async · PostgreSQL 16 + pgvector · Redis · Alembic · LangGraph · Anthropic SDK · Claude Haiku 5.5 and Sonnet 5.5 · sentence-transformers · WeasyPrint · Next.js 14 · TypeScript · Tailwind · Vercel · Railway · GitHub Actions · Sentry.
