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
end.

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
**Outcome.** Clean state, testable nodes.

### Free-text parsing silently returned wrong categories
**Problem.** The first classifier split the model's text; any preamble ("Sure, here is...") produced a wrong category
without an error. **Decision.** `instructor[anthropic]`: tool use forces a `CategoryPrediction` Pydantic model and
invalid output retries. **Outcome.** The model became the contract; since October a validated match stores the chart's own
code and name.

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
([6e6851c](https://github.com/rajo69/agentic-ai-accounting/commit/6e6851c)), and seed local data for pipeline
testing. **Outcome.** Real organisations sync, and on live data the reconciler matches bank transactions to invoice
and payment records.

### CI needed pgvector and a C library
**Problem.** GitHub's default Postgres image lacks pgvector; WeasyPrint needs Cairo and Pango; tests patched a helper
(`_get_org`) that did not exist and expected 404 where the auth dependency raises 401 first. **Decision.**
`pgvector/pgvector:pg16` as the service container, an `apt-get` step, `alembic upgrade head` before pytest, and
`app.dependency_overrides[get_current_org]` instead of `unittest.mock.patch`. **Outcome.** CI green from
2026-03-24; 401 for every auth failure became the documented test pattern.

### A CORS tightening broke production in a loop
**Problem.** Restricting `allow_origins` to a setting that defaulted to `localhost` made every `fetch` from Vercel
throw a `TypeError` with no status; the dashboard treated it as "Xero not connected", while OAuth (a redirect, not
subject to CORS) kept working, so the dashboard asked to connect again and again. **Decision.** Wildcard origin with
`allow_credentials=False`, which is correct for bearer-token auth. **Outcome.** Fixed the same day; the diagnostic
(browser-level `TypeError` versus HTTP 401) is the part worth remembering.

## April 2026: production features

### Five production features in one release
[4703461](https://github.com/rajo69/agentic-ai-accounting/commit/4703461) (2026-04-12): Fernet token encryption
with an `enc::` prefix and legacy fallback, Redis cache with graceful degradation, HMAC-verified Xero webhooks with
a 60-second debounce, a `users` table with owner and member roles, and two more document templates. Followed by
incremental sync ([8234fa5](https://github.com/rajo69/agentic-ai-accounting/commit/8234fa5)), background jobs with a
stale-job sweep on start ([5f6c537](https://github.com/rajo69/agentic-ai-accounting/commit/5f6c537)), team
management with Resend invitations ([d6b5e10](https://github.com/rajo69/agentic-ai-accounting/commit/d6b5e10)) and
a frontend error boundary ([3ab7adb](https://github.com/rajo69/agentic-ai-accounting/commit/3ab7adb)).

### Tiered model routing
[bc1e41c](https://github.com/rajo69/agentic-ai-accounting/commit/bc1e41c) (2026-04-13). **Problem.** Haiku alone
looked weak on hard cases; Sonnet on everything costs about three times as much per token. **Decision.** Haiku first;
when its confidence is below the auto-accept threshold (0.85) the same prompt goes to Sonnet and Sonnet's answer
replaces Haiku's; if Sonnet fails, Haiku's answer stands; the audit row records both. **Outcome.** Shipped. Its
measurement is the first live comparison in the evaluation plan: Haiku-only against Sonnet-only against tiered. The
2026-10-31 migration A/B (below) made that comparison on bookbench's dev split, and the held-out test run (last entry)
repeated it: tiered within a point of Sonnet only at about half its cost.

### A silent scope regression
[62177dd](https://github.com/rajo69/agentic-ai-accounting/commit/62177dd) (2026-04-13). **Problem.** The
Payments-sync commit had reintroduced the deprecated broad scope to reach `/Payments`, undoing the March fix; OAuth
failed again for every new connection. **Decision.** Verify Xero's scope-to-resource table (fetched with a browser
when the plain fetch timed out): `accounting.invoices.read` does not cover payments; `accounting.payments.read` does.
**Outcome.** One-line fix, and a habit: check the provider's live documentation before trusting a scope name in git
history.

### A documentation fix verified like a code fix
[4e77f98](https://github.com/rajo69/agentic-ai-accounting/commit/4e77f98) (2026-04-17, PR #1). **Problem.** The
README said reconciliation used an LLM for explanations; it does not. **Decision.** Fix the six sites that said so.
**Outcome.** The October review found four more sites and a cost ratio computed from a stale price table (the
list-price ratio is 3x), and both were corrected. Since then a documentation fix gets the same verification as a code
fix, through the claim ledger below.

## October 2026: review, launch, incident

### A six-lens review of my own repository
**Problem.** A green CI run does not show whether the published behaviour matches the code.
**Decision.** Six parallel review passes, run as Claude Code agents (security and tenancy, backend correctness, AI engineering, frontend,
documentation honesty, toolchain) under one evidence standard: file and line, quoted code, severity, known or new.
Every high finding re-read in source; the numerical ones reproduced. **Outcome.** 106 findings, 14 high, 0 critical,
about 70% not previously known. The ones that mattered most: the EBM explainer had never produced output for
multiclass data (`float()` on a per-class array raised and was swallowed; reproduced with a three-class fit); the
fuzzy membership helper returns zero at the clamped extremes, so the riskiest input fires no rule; one `AsyncSession`
is shared by five concurrent tasks; the VAT summary applies the rate to gross amounts; three spend subtypes are stored
positive. A 66-row claim ledger graded every public statement TRUE, PARTLY, FALSE or UNVERIFIABLE; this README
rewrite resolves every FALSE and PARTLY row. The five findings that were small to fix were fixed test-first (below).

### Launch: design system, landing page, demo mode, console restyle
[53abf31](https://github.com/rajo69/agentic-ai-accounting/commit/53abf31) (2026-10-10, PR #2). **Problem.** Nobody
would test a Xero login to see the product. **Decision.** A token-based design system; a landing page whose product frame is a scripted, clock-driven
replay of the real components; a browser-only demo mode behind the frontend's single `apiFetch` choke point, seeded
from the eval fixtures (fifty transactions, 32 statement lines), with the reconciler's scoring ported line for line
and checked against RapidFuzz to four decimal places, simulated jobs, PDFs rendered once from the real templates, and
a banner on every screen; real-app logic untouched (markup and classes only, verified by diff review). **Outcome.**
Anyone can click through the whole review loop without an account; the Xero login still works; in demo mode no
request reaches the API or Xero (verified in headless Chrome against production).

### A dependency release took the API down for an afternoon
[194f5c0](https://github.com/rajo69/agentic-ai-accounting/commit/194f5c0) (2026-10-10, PR #3). **Problem.** Merging
the frontend PR triggered a backend rebuild; `sqlalchemy[asyncio]>=2.0.0` resolved to the newly released 2.1, which
defaults `postgresql://` URLs to psycopg 3, not installed; `alembic upgrade head` failed on start and the API
returned 502. **Decision.** Pin below 2.1 (the app was built on 2.0.48), redeploy, verify health and the OAuth
redirect. **Outcome.** Back within the afternoon.

### Every demo action must do visible work
[b8b88a4](https://github.com/rajo69/agentic-ai-accounting/commit/b8b88a4) (2026-10-10, PR #4). **Problem.** Clicking
Categorise during the first import ran over an empty book and reported zero; the pre-populated state had nothing left
for Categorise or Reconcile to do. **Decision.** Jobs queue behind an in-flight sync and size themselves when it
completes; the populated state leaves a mixed batch for both actions; document figures use the planned categories so
rows always match the static PDFs. **Outcome.** A principle for the demo: from every entry point, every action shows
something happening, even where the real backend would correctly report zero.

### The launch video is code
[2b7458e](https://github.com/rajo69/agentic-ai-accounting/commit/2b7458e) (2026-10-11, PR #6). **Problem.** A
two-minute launch video for the README and the landing page, with no budget, no screen recordings that go stale with
the next UI change, and nothing on screen that the repository cannot verify. **Decision.** A Remotion composition in
[`video/`](../video/): the script is locked first and synthesised beat by beat (Fish Audio, free tier); whisper
measures where every word falls; every visual event is keyed to a word time, so picture, narration and captions stay
in sync without hand-tuning. Product footage is the landing page's own scene components driven by frame; the music
bed is generated in numpy on the beat grid; each voice beat is levelled under a lookahead limiter and the mix is
trimmed to -16 LUFS inside the composition, measured with ffmpeg's EBU R128 pass. **Outcome.** A reproducible
1080p60 film that re-renders from the script. The owner's cloned voice was tried first and replaced the same day by a
library voice for quality; because nothing was hand-cut, the swap cost one regeneration and one render.

### Five review findings fixed test-first
(2026-10-11.) **Problem.** The self-review found five defects that were small to fix: `SPEND-TRANSFER`, `SPEND-OVERPAYMENT` and `SPEND-PREPAYMENT` bank transactions stored as money in (only
the exact type `SPEND` was negated); the fuzzy shoulder sets returning zero at their own edge, so the riskiest
possible input fired no rule and defaulted to "medium"; validation persisting the model's paraphrased account name;
PDF templates rendering Xero and model text with autoescaping off and WeasyPrint free to fetch any URL; and three
write scopes requested on the consent screen and never used. **Decision.** For each, a characterisation test that
failed first, then the smallest fix: negate the whole SPEND family in one helper shared by both sync paths; treat
`a == b` and `b == c` as shoulders with membership 1 at the edge; return the chart's own code and name from a pure
validation function; turn autoescaping on and give WeasyPrint a fetcher that serves only `data:` URIs and the
templates folder; request read-only scopes. The fetcher was first a plain function, which passed every local test;
rendering in a Linux container against WeasyPrint 70 (what an unpinned rebuild now installs) showed that release reads
an attribute off the fetcher and crashes the whole PDF the moment one resource is refused, so it became a
`URLFetcher` subclass, with the plain function kept for older releases (both checked end to end, on 70 and 66). **Outcome.** 24 new
tests, no API change.

### Moving to Claude 5.5 behind a gate
(2026-10-27 to 10-31.) **Problem.** Moving from Haiku 4.5 and Sonnet 4.6 to the 5.5 pair looked like a change of
model id. Read against the code, the migration guide said otherwise: Sonnet 5.5 rejects the forced tool call that
Instructor sent with a 400. The categoriser caught any escalation error and kept Haiku's answer, so tiered routing
would have quietly become Haiku-only, and the three document narratives would have failed outright. **Decision.** Four pull requests, with
production changing model only in the last. First, pin the LLM stack to what production had already drifted to.
Second, one gateway (`backend/app/services/llm_client.py`) with an `LLM_PROFILE` setting: the `claude-4` profile
reproduces the requests Instructor sent, checked against a captured fixture, and `claude-5-5` uses structured outputs.
Escalation errors and refusals are now recorded on the audit row instead of dropped. Third, an A/B on bookbench's
UK dev split: the app's own requests, six arms, three reps, Message Batches. The gate and analyses were committed before any
result was computed, and pushed before the run finished. Fourth, the flip. **Outcome.** All three tiered 5.5 candidates passed the gate, at
$6.86 of API calls. On the 190 headline dev items (the 10 attack items are scored apart), the 5.5 tiered system scored 91.1% against 83.2% for 4.x (paired
bootstrap interval +3.7 to +12.3 points), with auto-accept precision 98.7% against 89.7% and $4.01 against $5.32 per
1,000 transactions. These are relative figures on rule-generated, unreviewed labels, not accuracy claims. The
cost: Haiku 5.5 reports lower confidence, so fewer rows auto-accept (41.9% against 64.7%) and more go to a person.
The [report](../backend/evals/reports/2026-10-31-migration-5-5/summary.md) keeps the pre-registration above the
results. Rollback is one setting, `LLM_PROFILE=claude-4`.

### The first accuracy figure could not be reproduced
(2026-03-24 to 2026-10-31.) **Problem.** The README published 88% (44 of 50) from the first eval run in March 2026,
and the landing page once said 94% from a source nobody could trace. The October review found that neither could be
reproduced. The harness sent its own prompt, with no precedents, no validation, no routing and half the
`max_tokens` production then used, so it measured a different system from the one users ran. No outputs or provenance were kept. 9 of the
50 gold category names did not match the chart, and two loan transactions were labelled as tax because the chart had
no loan account. The cost meter recorded one of two paid calls. The run had also missed its own easy-tier gate (93.5%
against 95%), which the README marked as passed. **Decision.** Remove every accuracy figure until one could be
reproduced, and rebuild the eval with Claude Code under my direction. bookbench, a synthetic benchmark built to the
categoriser's input contract, was published as a draft. A harness scores the app's own requests offline: the
production prompt builder and gateway, pinned by a parity test against the real graph. Every run follows the same
order: count_tokens estimate and budget cap, rules committed before the first call, Message Batches, provenance and
raw responses kept. The dev split was spent on the 5.5 migration (previous entry), and the test split was held back.
**Outcome.** On the held-out UK test split, the shipped Haiku 5.5 and Sonnet 5.5 system agrees with bookbench's draft
labels on 93.7% of 285 transactions (bootstrap interval 90.9% to 96.3%), auto-accepts 45.3% at 98.4% precision, and
costs $4.00 per 1,000 transactions; the run cost $3.59 of a $5 cap. A lower threshold met its pre-registered condition
and was declined, because precision fell to 94.7%. The figure is agreement with rule-generated, unreviewed labels on
synthetic data, and the [report](../backend/evals/reports/2026-10-31-bookbench-test-5-5/summary.md) says so above
the results. The old 88% is told as history and not republished.
