# Engineering record

The long form of the problems that needed judgement while building AI Accountant, in date order, with the commits
that resolved them. Each entry is the problem, the decision, and the outcome. The short version is in the
[README](../README.md#engineering-record). Commit links point at
[rajo69/agentic-ai-accounting](https://github.com/rajo69/agentic-ai-accounting).

## March 2026: scaffold and first pipeline

### Money as `Decimal`, from day one
**Problem.** Python floats cannot represent 0.1; a penny discrepancy in a reconciliation match is a trust failure in
accounting software. **Decision.** `Decimal` in every model and `NUMERIC(12,2)` in Postgres, written down as an
invariant before the first feature. **Outcome.** The review in October confirmed the data layer holds the rule end to
end; the one leak is presentation JSON for document figures, where values are cast to `float` for the template.

### Raw `httpx` instead of the Xero SDK
**Problem.** The official SDK wraps synchronous `requests` and hides headers, which makes `If-Modified-Since`
incremental sync, 429 backoff and token refresh harder to control and to test. **Decision.** A thin adapter over the
REST API with `httpx.AsyncClient`, one `_ensure_valid_token()` before every call, 60-second expiry buffer.
**Outcome.** Every Xero behaviour (two date formats, 304 handling, 429 wait and retry, dedupe of payments against
invoices) lives in one file, and the adapter is the only place the app talks to Xero.

### Anthropic has no embeddings endpoint
**Problem.** The design assumed one provider for the LLM and for embeddings (OpenAI's larger vectors). Switching the
LLM to Claude left no embedding API. **Decision.** Decouple: `sentence-transformers/all-MiniLM-L6-v2` in-process
(384 dimensions, zero API cost, `asyncio.to_thread` for the CPU work) and an Alembic migration resizing the pgvector
column. **Outcome.** LLM and embedding choices are independent; the migration is one of the six in the chain.

### LangGraph nodes need a database session without polluting state
**Problem.** Graph state must stay serialisable for future checkpointing; a session in the state dict breaks that.
**Decision.** `build_categoriser_graph(db)` returns a compiled graph whose nodes close over the session.
**Outcome.** Clean state, testable nodes. The October review found the flip side: the batch runner builds one closure
over one `AsyncSession` and runs five tasks concurrently under a semaphore, which SQLAlchemy does not support; the fix
(per-task sessions from `async_sessionmaker`) is roadmap phase 3.

### Free-text parsing silently returned wrong categories
**Problem.** The first classifier split the model's text; any preamble ("Sure, here is...") produced a wrong category
without an error. **Decision.** `instructor[anthropic]`: tool use forces a `CategoryPrediction` Pydantic model and
invalid output retries. **Outcome.** The model became the contract. The review later showed the contract is not yet
tight enough at the domain boundary (validation accepts code or name; the name string is persisted), which is why
native structured outputs with chart-constrained values are on the roadmap.

### Xero's OAuth scope scheme changed under the build
**Problem.** Apps created after 2 March 2026 must use granular scopes; the broad `accounting.transactions.read`
returned `unauthorized_client: Invalid scope`. The colon form was wrong too. **Decision.** Test scope names against
the token endpoint until the dot-notation resource scopes worked (`accounting.banktransactions.read`,
`accounting.invoices.read`, `accounting.contacts.read`, `accounting.settings.read`). **Outcome.** OAuth worked; a
`.pyc` cache kept serving the old scopes until `__pycache__` was cleared, a second lesson in the same afternoon.

### Xero's Demo Company bank lines are not in the API
**Problem.** The UK Demo Company shows statement lines to reconcile, but `GET /BankTransactions`, `/Invoices` and
`/Payments` return none of them: they live in Xero's bank-feed layer, which the Accounting API does not expose.
**Decision.** Add `/Payments` as a third sync source with deduplication against invoices
([915abf1](https://github.com/rajo69/agentic-ai-accounting/commit/915abf1)), and seed local data for pipeline
testing. **Outcome.** Real organisations sync. The honest consequence, written down in October: on live data the
reconciler matches bank transactions to invoice and payment records, not to statement lines; CSV/OFX import is the
roadmap fix.

### CI needed pgvector and a C library
**Problem.** GitHub's default Postgres image lacks pgvector; WeasyPrint needs Cairo and Pango; tests patched a helper
(`_get_org`) that did not exist and expected 404 where the auth dependency raises 401 first. **Decision.**
`pgvector/pgvector:pg16` as the service container, an `apt-get` step, `alembic upgrade head` before pytest, and
`app.dependency_overrides[get_current_org]` instead of `unittest.mock.patch`. **Outcome.** CI green from
2026-03-24; 401 for every auth failure became the documented test pattern.

### A CORS tightening broke production in a loop
**Problem.** Restricting `allow_origins` to a setting that defaulted to `localhost` made every `fetch` from Vercel
throw a `TypeError` with no status; the dashboard treated it as "Xero not connected", while OAuth (a redirect, not
subject to CORS) kept working, so users connected again and again. **Decision.** Wildcard origin with
`allow_credentials=False`, which is correct for bearer-token auth. **Outcome.** Fixed the same day; the diagnostic
(browser-level `TypeError` versus HTTP 401) is the part worth remembering. The frontend still shows "not connected"
for any fetch failure; a finer error model is roadmap phase 3.

## April 2026: production features

### Five production features in one release
[240eb91](https://github.com/rajo69/agentic-ai-accounting/commit/240eb91) (2026-04-12): Fernet token encryption
with an `enc::` prefix and legacy fallback, Redis cache with graceful degradation, HMAC-verified Xero webhooks with
a 60-second debounce, a `users` table with owner and member roles, and two more document templates. Followed by
incremental sync ([f92a65c](https://github.com/rajo69/agentic-ai-accounting/commit/f92a65c)), background jobs with a
stale-job sweep on start ([b004bf2](https://github.com/rajo69/agentic-ai-accounting/commit/b004bf2)), team
management with Resend invitations ([65533be](https://github.com/rajo69/agentic-ai-accounting/commit/65533be)) and
a frontend error boundary ([a7dc626](https://github.com/rajo69/agentic-ai-accounting/commit/a7dc626)).

### Tiered model routing
[d113290](https://github.com/rajo69/agentic-ai-accounting/commit/d113290) (2026-04-13). **Problem.** Haiku alone
looked weak on hard cases; Sonnet on everything costs about three times as much per token. **Decision.** Haiku first;
when its confidence is below the auto-accept threshold (0.85) the same prompt goes to Sonnet and Sonnet's answer
replaces Haiku's; if Sonnet fails, Haiku's answer stands; the audit row records both. **Outcome.** Shipped and
reasoned, never measured: the comparison run is the first live eval on the roadmap, and the review noted that the
overridden Haiku answer is not itself audited.

### A silent scope regression
[b05239f](https://github.com/rajo69/agentic-ai-accounting/commit/b05239f) (2026-04-13). **Problem.** The
Payments-sync commit had reintroduced the deprecated broad scope to reach `/Payments`, undoing the March fix; OAuth
failed again for every new connection. **Decision.** Verify Xero's scope-to-resource table (fetched with a browser
when the plain fetch timed out): `accounting.invoices.read` does not cover payments; `accounting.payments.read` does.
**Outcome.** One-line fix, and a habit: check the provider's live documentation before trusting a scope name in git
history.

### A documentation audit that made one number worse
[bd236b8](https://github.com/rajo69/agentic-ai-accounting/commit/bd236b8) (2026-04-17, PR #1). **Problem.** The
README said reconciliation used an LLM for explanations; it does not. **Decision.** Fix the six sites that said so.
**Outcome.** Four more sites were missed, and the same PR replaced a cost ratio of "about 10×" with one of nearly four by
dividing a stale price table (the correct list-price ratio is 3×). The October review caught both; the lesson is
that a documentation fix needs the same verification as a code fix, which is what the claim ledger below is for.

## October 2026: review, launch, incident

### A six-lens review of my own repository
**Problem.** CI was green at HEAD and nobody had checked whether the published behaviour matched the code.
**Decision.** Six parallel review passes (security and tenancy, backend correctness, AI engineering, frontend,
documentation honesty, toolchain) under one evidence standard: file and line, quoted code, severity, known or new.
Every high finding re-read in source; the numerical ones reproduced. **Outcome.** 106 findings, 14 high, 0 critical,
about 70% not previously known. The ones that mattered most: the EBM explainer had never produced output for
multiclass data (`float()` on a per-class array raised and was swallowed; reproduced with a three-class fit); the
fuzzy membership helper returns zero at the clamped extremes, so the riskiest input fires no rule; one `AsyncSession`
is shared by five concurrent tasks; the VAT summary applies the rate to gross amounts; three spend subtypes are stored
positive. A 66-row claim ledger graded every public statement TRUE, PARTLY, FALSE or UNVERIFIABLE; this README
rewrite resolves every FALSE and PARTLY row.

### Launch: design system, landing page, demo mode, console restyle
[8e6b2c1](https://github.com/rajo69/agentic-ai-accounting/commit/8e6b2c1) (2026-10-10, PR #2). **Problem.** The
public surfaces sold "accounting, automated" with invented statistics, and nobody would test a Xero login to see the
product. **Decision.** A token-based design system; a landing page whose product frame is a scripted, clock-driven
replay of the real components; a browser-only demo mode behind the frontend's single `apiFetch` choke point, seeded
from the eval fixtures (fifty transactions, 32 statement lines), with the reconciler's scoring ported line for line
and checked against RapidFuzz to four decimal places, simulated jobs, PDFs rendered once from the real templates, and
a banner on every screen; real-app logic untouched (markup and classes only, verified by diff review). **Outcome.**
Anyone can click through the whole review loop without an account; the Xero login still works; zero requests leave
the browser in demo mode (verified in headless Chrome against production).

### A dependency release took the API down for an afternoon
[f517426](https://github.com/rajo69/agentic-ai-accounting/commit/f517426) (2026-10-10, PR #3). **Problem.** Merging
the frontend PR triggered a backend rebuild; `sqlalchemy[asyncio]>=2.0.0` resolved to the newly released 2.1, which
defaults `postgresql://` URLs to psycopg 3, not installed; `alembic upgrade head` failed on start and the API
returned 502. **Decision.** Pin below 2.1 (the app was built on 2.0.48), redeploy, verify health and the OAuth
redirect. **Outcome.** Back within the afternoon. The cause is structural: no Python lockfile, so every rebuild
re-resolves dependencies. Lockfiles and an SBOM are roadmap phase 6.

### Every demo action must do visible work
[b6a5428](https://github.com/rajo69/agentic-ai-accounting/commit/b6a5428) (2026-10-10, PR #4). **Problem.** Clicking
Categorise during the first import ran over an empty book and reported zero; the pre-populated state had nothing left
for Categorise or Reconcile to do. **Decision.** Jobs queue behind an in-flight sync and size themselves when it
completes; the populated state leaves a mixed batch for both actions; document figures use the planned categories so
rows always match the static PDFs. **Outcome.** A principle for the demo: from every entry point, every action shows
something happening, even where the real backend would correctly report zero.
