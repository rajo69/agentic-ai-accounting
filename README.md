# AI Accountant

**The review layer for Xero books that AI already coded.** Every transaction gets a proposed category with written reasoning, a confidence tier and a risk flag. You decide. Every decision is recorded.

[![CI](https://github.com/rajo69/agentic-ai-accounting/actions/workflows/ci.yml/badge.svg)](https://github.com/rajo69/agentic-ai-accounting/actions/workflows/ci.yml)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-informational)](LICENSE)
[![Demo](https://img.shields.io/badge/demo-no%20account%20needed-success)](https://agentic-ai-accounting.vercel.app/demo)

**[Launch the demo →](https://agentic-ai-accounting.vercel.app/demo)** (a synthetic company, runs in your browser, no account)
&nbsp;·&nbsp; **[Watch the 2-minute video →](https://youtu.be/icLQG596Ctg)** (YouTube, 1080p, chapters in the description)
&nbsp;·&nbsp; [Live app](https://agentic-ai-accounting.vercel.app) (connect your own Xero)

https://github.com/user-attachments/assets/431b5bd4-40b8-466a-8d86-a41dfa1e11d9

<sup>The launch video (2:14, 720p copy; the 1080p version with chapters is [on YouTube](https://youtu.be/icLQG596Ctg)). It is code: a Remotion composition in [`video/`](video/).</sup>

**Contents.** Part 1, the product: [who it is for](#who-it-is-for) · [the problem](#the-problem) · [what it does](#what-it-does) · [how a review goes](#how-a-review-goes) · [why it is useful](#why-it-is-useful) · [try it](#try-it) · [status](#status-and-direction).
Part 2, the engineering: [60-second version](#for-hiring-managers-the-60-second-version) · [architecture](#architecture) · [AI engineering decisions](#ai-engineering-decisions) · [evaluation](#evaluation) · [explainability](#explainability-and-risk-scoring) · [security and privacy](#security-privacy-and-xero-terms) · [engineering record](#engineering-record) · [review findings](#what-a-six-lens-review-found-2026-10-10) · [roadmap](#production-roadmap) · [running locally](#running-locally) · [tests](#tests) · [structure](#project-structure) · [changelog](#changelog).

---

# Part 1: the product

## Who it is for

I built this for the people in the UK who do their own books on Xero: sole traders, freelancers, one-van and two-desk businesses, and the bookkeepers and small accountancy practices who look after dozens of them. The person I had in mind is a self-employed electrician at the kitchen table on a Sunday evening, two days before a quarterly update is due, scrolling through three months of bank lines that Xero's AI has already coded, trying to work out which of the hundred green ticks they should not trust. And the accountant with forty of those clients, who has to sign each quarter knowing that whatever the software got wrong is now their professional problem.

Since 6 April 2026, sole traders and landlords with qualifying income of £50,000 or more have been inside Making Tax Digital for Income Tax: a summary of income and expenses goes to HMRC every quarter, not once a year, and the threshold falls to £30,000 in April 2027 and £20,000 in April 2028. VAT-registered businesses have reported quarterly for years. Quarter-end review has gone from an annual chore to a four-times-a-year habit for a lot of people who never wanted one.

## The problem

Xero's own AI, JAX, now categorises and reconciles bank transactions automatically; Xero says it reconciles with 97% accuracy. That is good news and it changes the job. The books are no longer written by hand; they are written by a model, and the work left for the human is to find the three lines in a hundred that are wrong, and to be able to show later who decided what.

Nothing in the software helps with that part. Review is manual, undocumented, and costs the same effort whether the books are 90% right or 99% right, because you still have to look at every line to find the ones that matter. A green tick with no reasoning is not evidence. An audit trail that says "AI did it" is not an audit trail.

AI Accountant sits after Xero's AI and before the sign-off. It does not try to be a better autopilot. It tries to make the review short, evidenced and recorded.

## What it does

Everything below is in the code and runs against a connected Xero organisation; nothing here is a mock-up.

1. **Connects to Xero** with OAuth2 and syncs the chart of accounts, bank transactions, invoices and payments, incrementally after the first pull.
2. **Proposes a category for every uncategorised transaction**, using the firm's own confirmed decisions as precedents, with a confidence score, written reasoning and a tier: auto-accept, suggested, or needs review.
3. **Explains each decision**: the reasoning, which model made the call (a fast model first, escalated to a stronger one when it is unsure), and a readable risk flag from eight plain-language rules such as unusual amount, unseen vendor and odd timing.

![A transaction opened in the review console: the proposed category, confidence, reasoning, the risk rules that fired and the audit trail](docs/media/explanation-panel.png)

4. **Matches unreconciled bank transactions to invoice and payment records** on amount, date and description, with scored candidates, and sends ambiguous matches to review. Statement-line import from CSV or OFX is planned; the Xero API does not expose bank-feed lines.
5. **Drafts a management letter** from the actual figures, plus a profit and loss and a VAT summary with period figures labelled indicative, rendered as PDFs.

![Reconciliation: a statement line with its scored candidates and a confirm action](docs/media/reconciliation.png)

6. **Records every AI proposal and every human approve, correct or reject** in an audit trail with the model, the confidence and the reasoning.
7. **Supports a small team per practice**, and GDPR export and erasure of everything held about an organisation.

## How a review goes

1. Connect Xero and sync the quarter.
2. Run categorisation. The dashboard shows what needs attention and what was auto-accepted.
3. Open a transaction. Read the reasoning and the risk flags. Approve, correct or reject; a correction becomes a precedent for the next similar transaction.
4. Reconcile. Confirm the suggested matches, resolve the ambiguous ones.
5. Draft the management letter from the figures as they now stand.
6. Sign off. The audit trail answers "who decided what, and why".

## Why it is useful

- **Attention goes to the uncertain cases**, not to all of them. The tiers say where to look.
- **Every proposal arrives with its reasoning**, so the review question becomes "do I agree?" instead of "what happened here?".
- **Corrections improve future proposals** without any model being trained on the client's data; the firm's own decisions are retrieved as examples.
- **The audit trail exists before anyone asks for it.** Model, confidence, reasoning and the human decision, one row each.

No accuracy or time-saved figures appear in this repository. They will, when a reproducible evaluation is committed with its provenance (see [evaluation](#evaluation)).

## Try it

![Thirty seconds of the demo: import, categorise, open a transaction, read the reasoning and risk rules, approve](docs/media/demo.gif)

**The demo** at [agentic-ai-accounting.vercel.app/demo](https://agentic-ai-accounting.vercel.app/demo) opens the console on a synthetic company, "Harlow & Finch Ltd", with fifty transactions and a quarter's statement lines. Everything runs in your browser: the reasoning, risk flags and match scores are replayed from fixtures and pre-written drafts, jobs are simulated, the PDFs were rendered once from the real templates, and nothing is sent to a server or written to Xero. A banner says so on every screen. Add `?skip_onboarding=1` to start with the quarter already imported.

**Connect your own Xero** from the [live app](https://agentic-ai-accounting.vercel.app). The consent screen asks for read access to bank transactions, invoices, contacts, payments and settings (it also currently requests write permissions the app never uses; removing them is on the roadmap). Transaction details, which can include payee names, are sent to Anthropic for categorisation. Tokens are stored encrypted. You can export or erase everything, and disconnect the app from your Xero organisation's connected-apps settings. The [privacy policy](https://agentic-ai-accounting.vercel.app/privacy) lists every processor.

**The video** is a two-minute product and engineering walkthrough, playable at the top of this page or [on YouTube](https://youtu.be/icLQG596Ctg) with chapters. It is code, not a screen recording: a Remotion composition in [`video/`](video/), timed to the measured narration word by word, with the product footage drawn from the landing page's own scene components and a music bed generated in Python; [`video/README.md`](video/README.md) says how it was made.

[![AI Accountant: the review layer for AI-coded Xero books (2-minute demo)](docs/media/video-thumbnail.png)](https://youtu.be/icLQG596Ctg)

## Status and direction

A solo portfolio project by [Rajarshi Nandi](https://www.linkedin.com/in/rajarshi-nandi/), deployed on Vercel and Railway, open source under the MIT licence. It was built between March and October 2026, first as a product, then audited and documented as the work sample it now is. It is not a registered accountancy service and is not taking real clients.

Planned and not built: review findings with cited HMRC guidance, drafted client queries, CSV/OFX statement import, and the production-hardening work listed in the [roadmap](docs/PRODUCTION_ROADMAP.md). The present categorisation and reconciliation workflows are LangGraph state machines, not autonomous agents; the agentic review is roadmap.

---

# Part 2: the engineering

## For hiring managers: the 60-second version

I built the whole thing end to end: the Xero OAuth and sync adapter, the LangGraph categorisation and reconciliation workflows calling Claude through Instructor, the pgvector precedent retrieval, the audit trail, the eval harness, the FastAPI API with its tests and CI, the Next.js console, the browser-only demo mode, and the deployment. Then I ran a six-lens review of my own code and published what it found instead of hiding it.

The three hardest problems: (1) **making the model's output trustworthy at the boundary**: structured output via Pydantic with validation against the chart of accounts, confidence tiers that route uncertain cases to a human, and a fuzzy risk layer whose rules an accountant can read; (2) **working against a platform that keeps moving**: Xero changed its OAuth scope scheme mid-build, its API hides bank-feed lines, and a dependency release later took production down for an afternoon; (3) **telling the truth about measurement**: the harness measured a different prompt than production, the published numbers could not be reproduced, so I removed them and wrote down what a real evaluation needs.

What I would do next, in order: pin the current behaviour with characterisation tests against a real database, put every model call through one gateway with cost and telemetry, make the eval replay the production graph and commit a baseline with provenance, then build the review-findings engine on top. The [roadmap](docs/PRODUCTION_ROADMAP.md) has the full sequence.

| If you are hiring for | Start with |
|---|---|
| Software engineering | [Architecture](#architecture), the Xero adapter and auth story in [security](#security-privacy-and-xero-terms), the [engineering record](#engineering-record), [tests](#tests) and CI |
| AI engineering | [AI engineering decisions](#ai-engineering-decisions), [evaluation](#evaluation), the guardrail and cost items in the [review findings](#what-a-six-lens-review-found-2026-10-10) |
| Data science | [Evaluation](#evaluation) (fixture design, tiers, calibration, gates, provenance), [explainability and risk scoring](#explainability-and-risk-scoring), the open questions at the end of that section |

## Architecture

![System diagram: Next.js on Vercel, FastAPI on Railway, LangGraph workflows calling Claude via Instructor, Postgres with pgvector and the audit log, Xero through OAuth2](docs/media/architecture.svg)

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind 3.4, Base UI primitives, framer-motion; Vercel | One codebase for the landing page, the console and the demo; all pages are client components talking to one `apiFetch` choke point |
| API | FastAPI, Pydantic v2, SQLAlchemy 2.0 async, Alembic; Railway (Docker) | Async end to end; OpenAPI for free; 34 routes (31 under `/api/v1`, two OAuth, one health) |
| Workflows | LangGraph state machines | Each node is a plain async function over a typed state; testable in isolation; the trace maps one to one onto the audit row |
| Models | Claude Haiku 4.5 (pinned snapshot) first, Claude Sonnet 4.6 on low confidence and for narratives, through Instructor | Structured output enforced by tool use and Pydantic; cheap model on the common path |
| Retrieval | pgvector in the same Postgres; `all-MiniLM-L6-v2` embeddings computed in-process (384 dimensions) | No second database and no embedding API; corrections become precedents by re-embedding |
| Data | PostgreSQL 16, eight tables, six migrations; `NUMERIC(12,2)` and `Decimal` for money; Redis for cache and webhook debounce | Penny errors are trust failures; Redis is optional and the app degrades without it |
| Documents | Figures in Python, narrative via Instructor, Jinja2 to WeasyPrint | The model never touches the numbers |
| Operations | Sentry (optional), per-organisation rate limits (slowapi), in-process background jobs tracked in Postgres, GitHub Actions (pgvector service container, WeasyPrint system deps, 93 tests, type check, lint) | Enough to run a beta; see the roadmap for what real users would need |

**One request, from login to audit row.** The browser hits `/auth/xero/connect`; the backend redirects to Xero; the callback exchanges the code for tokens, encrypts them with Fernet, creates or updates the organisation and its owner user, mints a 24-hour HS256 JWT with `org_id` and `user_id`, and queues the first sync job and redirects to the frontend callback, which stores the token and hands the job to the dashboard to poll. A categorisation run is `POST /api/v1/categorise/async`: a `jobs` row, a batch under `asyncio.Semaphore(5)`, and for each transaction the graph in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): fetch the chart and five precedents, classify through Instructor, validate against the chart, decide the tier, explain with the fuzzy rules, write the audit row. The console polls the job, then the reviewer's approve, correct or reject writes its own audit row and a correction re-embeds the transaction.

## AI engineering decisions

| Decision | Alternatives considered | Why this one | Evidence | What I learned |
|---|---|---|---|---|
| Structured output through Instructor (Anthropic tool use + Pydantic, retry on validation failure) | Free-text parsing (the first version); native structured outputs | The parser silently returned wrong categories whenever the model added preamble; Instructor made the Pydantic model the contract | `backend/app/agents/categoriser.py`, `CategoryPrediction` | Validation must also check the domain: the validate node accepts a code *or* a name, and the name string is what gets persisted. Native structured outputs plus chart-constrained validation is the roadmap fix |
| Haiku first, Sonnet when Haiku's confidence is below 0.85, Haiku's answer kept if Sonnet fails | Haiku only; Sonnet only | The escalation threshold equals the auto-accept threshold: below it the row goes to a human anyway, so the stronger model either lifts it into auto-accept or gives the reviewer better reasoning | Audit row records `escalated`, `primary_model`, `primary_confidence`, `escalation_threshold` | The design is reasoned, not measured. Haiku-only versus Sonnet-only versus tiered has never been run on the fixtures. Sonnet is about 3× Haiku per token at list price (1.00/5.00 versus 3.00/15.00 per million tokens, October 2026), so the comparison is cheap and is the first live eval on the roadmap |
| Precedent retrieval from pgvector (five nearest categorised transactions of the same organisation as few-shot examples) | Fine-tuning; a global classifier | Corrections take effect on the next similar transaction with no training, and nothing is trained on client data | `backend/app/services/embedding_service.py` | The query text and the stored text are built differently, there is no similarity cutoff, the index is a sequential scan, and `auto_categorised` rows count as precedents alongside confirmed ones. Memory hygiene is a roadmap item |
| Eval harness with hard gates (runner exits non-zero) and a budget guard | Ad-hoc spot checks | Gates make "did the prompt change help?" a yes or no | `backend/evals/` | The harness sends its own prompt with no retrieval and no routing, so it measures a prompt, not the shipped agent. Numbers from it were published anyway; they have been removed until a run with provenance is committed |
| Explainability from readable rules (eight fuzzy rules) rather than feature attributions | Shapley attributions over a surrogate; an EBM on the organisation's data (built as an experiment) | An accountant can read and challenge "amount deviation is high AND vendor is rare"; nobody reviews a Shapley value | `backend/app/xai/fuzzy_engine.py` | The EBM experiment never produced output for three or more categories (a `float()` on a per-class array raised and was swallowed), and it trains on Xero data, which the developer terms forbid. It is being retired; the console only shows feature bars when the glass-box model actually produced them |
| Audit row per AI decision and per human decision, with model, confidence, reasoning and risk payload | Logging | The product's claim is "who decided what, and why"; it has to be a table, not a log line | `audit_logs` schema | "Immutable" was overstated: the explain node attaches its payload in a second write and erasure deletes rows. Append-only is enforced by convention today, at the database level on the roadmap |
| Cost tracking in the harness (token counts, list prices, `--budget` abort) | None | AI cost per transaction is the unit economics of the product | `backend/evals/cost_tracker.py` | A documentation fix once replaced a wrong ratio with a wronger one (nearly four times) by dividing a stale price table. Prices now carry their check date |
| Untrusted text handling: none yet | Sanitiser, guard classifier, output validation | Not built | Transaction descriptions from Xero go straight into the prompt, and the model's self-reported confidence is the auto-accept gate | A manipulated description can steer a decision; the roadmap's security phase (OWASP LLM mapping, sanitiser, tool tiers, red-team suite) exists because of this |

## Evaluation

The harness in `backend/evals/` runs fifty hand-written synthetic UK SME transactions (no Xero API data) against twenty chart-of-accounts codes, split 31 easy, 15 medium, 4 hard, and reports accuracy by tier, per-category F1 and precision/recall, a confidence calibration table (accuracy by confidence bucket) and cost. It enforces gates and exits non-zero when one is missed: overall at least 80%, easy tier at least 95%, auto-accept bucket at least 90%. Responses are cached on disk keyed by model and prompt so reruns are free; a `--budget` flag aborts before a live run that would exceed it.

What it does not do yet, said plainly: it evaluates its own prompt rather than replaying the production graph (no precedent retrieval, no routing); the hard tier has four items, which is a smoke test, not a measurement; and the gates run in the runner, not in CI. No accuracy figure is published here. The rule I adopted in October 2026 is that every number needs a committed provenance file (commit, fixture version, prompt version, model id, date) next to it, and none exists yet. The first measured run, and the Haiku-only versus Sonnet-only versus tiered comparison, are the opening steps of the [roadmap](docs/PRODUCTION_ROADMAP.md).

## Explainability and risk scoring

Three things sit behind the explanation panel, and it matters which is which.

- **The model's reasoning** is the `reasoning` field of the structured output: a sentence or two of the model's own justification. It is useful to a reviewer and it is not a guarantee of anything.
- **The risk flag is glass-box.** A small Mamdani-style fuzzy inference engine, written from scratch so every line is auditable, takes three normalised inputs (amount deviation from the category's history, vendor frequency, weekday/weekend timing), applies eight rules written in plain language, and produces a risk score, a label (low, medium, high) and the list of rules that fired. The defuzzification is a simplified centroid over term representatives, not a full integral. The review found that the triangular membership helper returns zero at the clamped extremes, so a saturated input (the largest outlier from a never-seen vendor) fires no rule and defaults to "medium"; the fix is on the roadmap and the finding is left visible here because it is exactly the kind of boundary bug a risk engine must not have.
- **Feature importances are disabled in practice.** An Explainable Boosting Machine was meant to train once fifty labelled rows existed. It never worked for multiclass data, and it trains on Xero data, which the developer terms forbid. The console shows feature bars only when that model actually produced them, which today is never.

Open questions this build raised and did not answer: whether confidence should be calibrated per organisation (Platt, isotonic or conformal, with little labelled data per firm); whether explanations change reviewers' decisions at all, measured by review time and correction rate; and whether choosing review candidates actively (sparse regions of the embedding space, decision boundaries) reduces corrections compared with the current arrival order.

## Security, privacy and Xero terms

**What holds.** Every authenticated operation is scoped to the organisation from the session (29 of 29 checked in the review). Xero tokens are Fernet-encrypted at rest. Webhooks are verified with HMAC-SHA256 and `compare_digest`. The JWT algorithm is pinned both ways. The app never writes to Xero. No secret has ever been committed. The frontend has no XSS sinks or open redirects. Rate limits are keyed per organisation with `Retry-After`. GDPR export excludes tokens and embeddings; erasure deletes in FK-safe order and invalidates the session.

**What does not, yet.** The session JWT travels in the redirect URL and lives in `localStorage`; the OAuth `state` is a constant and there is no PKCE; any Xero login to a tenant receives the owner's session and invited members cannot sign in; untrusted transaction text is rendered without autoescaping into HTML that WeasyPrint processes with all URL protocols allowed; the consent screen requests three write scopes the app never uses; the invite endpoint allows email enumeration. Each has a phase in the [roadmap](docs/PRODUCTION_ROADMAP.md).

**Third parties and data.** Anthropic receives transaction date, amount, description (which can include payee and customer names), reference, the chart of accounts and a few precedents for categorisation, and aggregated figures for narratives. Railway hosts the API and database (region to be confirmed). Vercel hosts the frontend. Sentry receives error reports tagged with the organisation id and name when enabled. Resend receives invitation emails. The [privacy policy](https://agentic-ai-accounting.vercel.app/privacy) says the same.

**Xero developer terms.** API data may not be used to train, fine-tune, adapt or enhance AI models (clause 7(b)(i)), and may not be passed to a third party without the user's consent (7(b)(ii)). Nothing here is trained on Xero data except the EBM experiment, which is being retired; precedent retrieval is in-context and is kept behind a flag on the roadmap until Xero confirms its reading; evaluation data is synthetic. A consent flow before the first model call is a roadmap item.

## Engineering record

Ten problems that needed judgement, three lines each. The long form with commit links is in [`docs/ENGINEERING_RECORD.md`](docs/ENGINEERING_RECORD.md).

1. **Xero changed its OAuth scope scheme while I was building.** Apps created after 2 March 2026 must use granular scopes; the broad ones returned `unauthorized_client`. Found the working names by testing against the token endpoint; a later commit silently reintroduced the broad scope to reach `/Payments`, which I caught by cross-checking git history against Xero's scope-to-resource table (`accounting.payments.read` is the one that covers payments).
2. **A CORS "improvement" took the production dashboard down in a loop.** Restricting origins to a default that did not match Vercel made every `fetch` throw a `TypeError` with no HTTP status; the dashboard read that as "Xero not connected" while OAuth (a redirect, immune to CORS) kept working. Diagnosed by distinguishing a browser-level CORS failure from a 401, fixed with a wildcard origin and `allow_credentials=False`, correct for bearer tokens.
3. **Anthropic has no embeddings endpoint.** The design assumed one provider for both. Split the concerns: local MiniLM embeddings (384 dimensions, in-process, offloaded with `asyncio.to_thread`) and an Alembic migration shrinking the vector column from the OpenAI size.
4. **Parsing model text silently produced wrong categories.** Any preamble broke the string splitting without raising. Replaced with Instructor so a Pydantic model is the contract and invalid output retries instead of persisting.
5. **LangGraph nodes needed a database session without putting it in the state.** State must stay serialisable for checkpointing. `build_categoriser_graph(db)` closes over the session; the nodes are nested functions.
6. **Xero's Demo Company bank lines are invisible to the API.** They live in a bank-feed layer the Accounting API cannot read. Added the `/Payments` source with deduplication against invoices, and later wrote down the consequence honestly: on live data the reconciler matches bank transactions to invoice and payment records, not to statement lines.
7. **CI needed pgvector and a C library.** The default Postgres image lacks the extension and WeasyPrint needs Cairo and Pango. `pgvector/pgvector:pg16` as the service container, an `apt-get` step, migrations before tests; and the tests themselves moved from patching a helper that did not exist to `app.dependency_overrides`, with 401 (not 404) as the correct expectation for every auth failure.
8. **A dependency release took production down for an afternoon.** SQLAlchemy 2.1 shipped, the unpinned range resolved to it, and `postgresql://` URLs now default to psycopg 3, which the image does not install. Pinned below 2.1; the real lesson is the missing lockfile, now a roadmap item.
9. **A six-lens review of my own code found bugs a green test suite could not.** The EBM path had never executed for multiclass data (reproduced numerically), the fuzzy shoulders return zero at the clamps, five concurrent graph tasks share one `AsyncSession`, and the VAT summary multiplies gross amounts by the rate instead of the VAT fraction. Published, not patched quietly, because the tests mock the session and the database and could not have caught any of it.
10. **The demo had to be honest and complete at the same time.** A fake server behind the frontend's single `apiFetch` choke point answers all twenty endpoints from a seed generated from the eval fixtures; the reconciler's scoring was ported line for line and checked against RapidFuzz to four decimal places; every action does visible work from every entry point, and a banner says it is synthetic on every screen.

## What a six-lens review found (2026-10-10)

In October 2026 I ran six parallel review passes over the repository (security and tenancy, backend correctness, AI engineering, frontend, documentation honesty, toolchain) under one evidence standard: file and line, quoted code, severity, and whether the plan already knew. 106 findings, 14 high, none critical. The top eight and where they stand:

| Finding | Status |
|---|---|
| VAT summary arithmetic wrong by construction (rate applied to gross; unknown tax types default to 20%) | Open; figures labelled indicative; fix in roadmap phase 0 and 5 |
| `SPEND-TRANSFER`, `-OVERPAYMENT`, `-PREPAYMENT` stored positive (only exact `SPEND` is negated) | Open; roadmap phase 0 characterisation test and hotfix |
| One `AsyncSession` shared by five concurrent graph tasks in both batch runners | Open; roadmap phase 3 |
| Categoriser persists the model's category name string; validation passes on code or name | Open; roadmap phase 4 (chart-constrained structured outputs) |
| Fuzzy membership returns zero at the clamped extremes, so saturated inputs default to "medium" | Open; roadmap phase 0 test and phase 8 |
| EBM explanations never executed for three or more categories; placeholder bars were shown | UI gated on the real model type; EBM retirement in roadmap phase 8 |
| Identity: any Xero login to a tenant gets the owner session; invited members cannot sign in | Open; roadmap phase 2 |
| Public numbers unverifiable and mutually inconsistent; privacy notice denied a data flow that happens | Fixed in this README, PORTFOLIO.md, the evals README and the privacy page (2026-10-10) |

The full list is private working material; the headline items are summarised in the roadmap. Reading the findings as a whole: the plumbing (tenancy, audit, money types, adapter boundary, migrations, CI) held up; the defects sat in the product's own differentiators, which is where I would have least wanted them and where a reviewer should look first.

## Production roadmap

What I would do before real client data, in order: pin current behaviour with tests against a real database and harden CI; one LLM gateway with cost and telemetry, a prompt registry, an eval that replays production, and a committed baseline with provenance; identity and tenancy (Sign in with Xero, memberships, row-level security, HttpOnly sessions, consent); reliability (durable jobs, per-task sessions, resilience, backups); LLM core v2 (native structured outputs, measured routing and caching, calibration); then the review layer itself (HMRC knowledge retrieval with citations, a findings engine with a planted-error eval, CSV/OFX import), guardrails, the agentic reviewer, evidence-based explanations, an MCP server. Each phase, its reasoning and the constraints it works under are in [`docs/PRODUCTION_ROADMAP.md`](docs/PRODUCTION_ROADMAP.md). Planned, not built.

## Running locally

Prerequisites: Docker Desktop, Python 3.12 (CI uses 3.12; the project declares 3.11 or later), Node 20.

```bash
git clone https://github.com/rajo69/agentic-ai-accounting
cd agentic-ai-accounting
docker compose up -d                      # Postgres 16 with pgvector, Redis 7

cd backend
cp .env.example .env                      # fill in XERO_CLIENT_ID, XERO_CLIENT_SECRET, ANTHROPIC_API_KEY
pip install -e ".[dev,ai,docs]"           # sentence-transformers pulls PyTorch (large); MiniLM weights download on first embed
alembic upgrade head
uvicorn app.main:app --reload --port 8000

cd ../frontend
npm install
npm run dev                               # http://localhost:3000; set NEXT_PUBLIC_API_URL=http://localhost:8000
```

The Xero app needs a redirect URI of `http://localhost:8000/auth/xero/callback`. WeasyPrint needs its system libraries (Cairo, Pango) for PDF generation; the demo mode needs none of this and runs with the frontend alone. The variables in `backend/.env.example` are the complete set; Sentry, Resend and the webhook key are optional and the app runs without them.

## Tests

```bash
cd backend && pytest -q                         # 93 tests in 12 files; Xero and Anthropic are mocked, runs offline
cd backend && python -m evals.eval_runner --mode mock   # harness smoke run, no API calls
cd frontend && npx tsc --noEmit && npm run lint && npm run build
```

CI runs the backend suite against a pgvector Postgres service with migrations applied, then the frontend type check and lint. Known limitation, from the review: the unit tests mock the database session, so they never exercise Postgres; the tenant-isolation, batch-concurrency and VAT-arithmetic findings were all invisible to them. A database-backed test layer is roadmap phase 0.

## Project structure

```
backend/
  app/
    api/v1/          auth, sync, dashboard, categorise, reconcile, documents, explanations, gdpr, webhooks, jobs
    agents/          categoriser.py, reconciler.py (LangGraph)
    services/        embedding_service.py, document_service.py
    integrations/    xero_adapter.py
    xai/             fuzzy_engine.py, explainer.py (EBM experiment)
    core/            config, database, session (JWT), encryption, cache, jobs, rate_limit, observability, email
    models/          SQLAlchemy models, Pydantic schemas
    templates/       management_letter.html, profit_loss.html, vat_summary.html
  alembic/           six migrations
  tests/             twelve files, 93 tests
  evals/             harness, fixtures (50 transactions, 20 accounts), cost tracker, cache
frontend/src/
  app/               landing, dashboard, transactions, reconciliation, documents, team, settings, demo, privacy, auth/callback
  components/        app shell, sidebar, explanation panel, landing/*, app/*, ui/*
  demo/              fake server, seed, store, jobs, reconciler port
  lib/               api.ts (apiFetch and types), motion presets
docs/                ARCHITECTURE.md, PRODUCTION_ROADMAP.md, ENGINEERING_RECORD.md, media/, history/
```

## Changelog

- **2026-10-10** README rewritten product-first; LICENSE added; privacy policy corrected; price constants and tier counts fixed; unverifiable accuracy and cost figures removed; architecture document split into current and historical. Demo follow-up (#4): jobs queue behind the first import and every pipeline action has work. Backend pin (#3): SQLAlchemy below 2.1 after the 2.1 release broke start-up. Launch (#2): design system, landing page rebuilt, browser-only demo mode, console restyle.
- **2026-08-03** Response headers adjusted so the landing page can be embedded by the portfolio site.
- **2026-04-17** Documentation audit (#1): reconciliation described as LLM-free throughout; line counts corrected.
- **2026-04-13** Tiered model routing (Haiku first, Sonnet on low confidence; audit row records both). Scope regression fixed: `accounting.payments.read` replaces the deprecated broad scope that a Payments-sync commit had reintroduced.
- **2026-04-12** v0.2.x series: Fernet token encryption, Redis cache, Xero webhooks, multi-user with owner and member roles, profit-and-loss and VAT templates, Payments sync, Sentry, incremental sync with `If-Modified-Since`, background jobs with polling, per-organisation rate limits, first-run onboarding, team page with Resend invitations, frontend error boundary.
- **2026-03-22 to 2026-03-24** Initial build: FastAPI and SQLAlchemy scaffold, Xero OAuth and sync, categorisation and reconciliation graphs, document generation, fuzzy risk engine, Next.js console, CI, deployment.

## Licence

MIT. See [LICENSE](LICENSE). Copyright (c) 2026 Rajarshi Nandi.
