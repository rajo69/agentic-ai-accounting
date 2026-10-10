# AI Accountant: one-page summary for recruiters

**What it is.** A deployed, open-source review console for UK small businesses and the bookkeepers who serve them. Xero's AI codes the books; this app sits after it and before the sign-off, proposing a category for every transaction with written reasoning, a confidence tier and a risk flag, matching bank transactions to invoices and payments, drafting the quarter's management letter, and recording every AI proposal and every human decision in an audit trail. Full story: [README, Part 1](README.md#part-1-the-product).

**Who built it.** [Rajarshi Nandi](https://www.linkedin.com/in/rajarshi-nandi/), solo, March to October 2026. Backend, AI pipeline, frontend, demo mode, deployment, evaluation, documentation and a published self-review. GitHub: [rajo69/agentic-ai-accounting](https://github.com/rajo69/agentic-ai-accounting).

**See it in two minutes.** [Launch the demo](https://agentic-ai-accounting.vercel.app/demo) (synthetic company, runs in the browser, no account). The two-minute video is in production and will be linked from the README.

## What it demonstrates, by role

| Role | Evidence in the repository |
|---|---|
| Software engineering | A FastAPI service with 34 routes, async SQLAlchemy, Alembic migrations, a hand-written Xero OAuth2 adapter (token refresh, encryption, rate-limit backoff, incremental sync, HMAC webhooks), a Next.js 14 console, 93 tests in CI with a pgvector service container, and a production incident handled and written up. [Architecture](README.md#architecture) · [Engineering record](README.md#engineering-record) |
| AI engineering | LangGraph workflows calling Claude through Instructor (structured output, validation, retry); Haiku-first routing with Sonnet escalation and a full audit row; pgvector precedent retrieval so corrections become few-shot examples; an eval harness with hard gates, caching and a budget guard; a frank account of what the eval does not measure yet. [AI engineering decisions](README.md#ai-engineering-decisions) · [Evaluation](README.md#evaluation) |
| Data science | Fixture design by difficulty tier, confidence calibration tables, acceptance gates, a provenance rule for every published number, a glass-box fuzzy risk engine with eight readable rules, and open questions on per-organisation calibration, explanation utility and active review selection. [Evaluation](README.md#evaluation) · [Explainability](README.md#explainability-and-risk-scoring) |

## Facts you can check

| Fact | Where |
|---|---|
| 34 API routes, matching the live OpenAPI document | `backend/app/api/v1/`, `/openapi.json` on the deployed API |
| 93 tests in 12 files, run on every push with migrations against Postgres | `backend/tests/`, `.github/workflows/ci.yml` |
| 50 synthetic eval fixtures (31 easy, 15 medium, 4 hard), 20 chart codes, gates enforced by the runner | `backend/evals/` |
| One audit row per AI decision and per human action, with model, confidence and reasoning | `backend/app/models/database.py`, `agents/categoriser.py` |
| Money is `NUMERIC(12,2)` and `Decimal` end to end | models and migrations |
| Six-lens self-review: 106 findings, 14 high, 0 critical, top eight published with status | [README](README.md#what-a-six-lens-review-found-2026-10-10) |
| No accuracy or cost figure without a committed provenance file | [Evaluation](README.md#evaluation) |

## What is real, what is demo, what is planned

The live pipeline runs against a connected Xero organisation with real Claude calls. The demo is a synthetic company with pre-written reasoning and simulated jobs. The categorisation and reconciliation workflows are state machines, not autonomous agents; review findings with cited HMRC guidance, the agentic reviewer, identity and tenancy hardening, and a measured evaluation are planned and described in the [production roadmap](docs/PRODUCTION_ROADMAP.md).

## Stack in one line

Python 3.12 · FastAPI · SQLAlchemy 2.0 async · PostgreSQL 16 + pgvector · Redis · Alembic · LangGraph · Instructor · Claude Haiku 4.5 and Sonnet 4.6 · sentence-transformers · WeasyPrint · Next.js 14 · TypeScript · Tailwind · Vercel · Railway · GitHub Actions · Sentry.
