# Production roadmap (planned, not built)

AI Accountant is a deployed portfolio project. This page is what I would build, in order, before letting a real
accountant put real client data through it. None of it exists in the code today; where a step has a partial
precursor, that is noted. It condenses a longer private plan written in September 2026 and revised after the
October 2026 review.

## Constraints the plan is built around

- **Xero developer terms.** API data may not be used to train, fine-tune, adapt or enhance AI models (clause 7(b)(i),
  in force for existing developers from 2 March 2026), and may not be passed to another third party without the
  user's consent (7(b)(ii)). Consequences: retire the EBM experiment, which trains on synced transactions; keep
  precedent retrieval behind a flag until Xero confirms in writing that in-context examples are not "enhancing" a
  model; build evaluation datasets from synthetic and public data only; record consent before any transaction reaches
  Anthropic.
- **Money.** Free tiers everywhere except the existing hosting bill; a hard cap on Anthropic spend for the whole plan,
  with per-phase caps, Message Batches by default and replayed responses in CI.
- **Safety of change.** Every behaviour change ships behind a flag that is off in production; AI changes go shadow,
  then canary, then default; migrations are expand, migrate, contract, each with a tested downgrade; existing API
  paths and schemas never change.

## Phases

| Phase | What it delivers | Why it comes here |
|---|---|---|
| 0. Safe baseline and truth | Baseline tag, production backup, characterisation tests for the bugs the review found (VAT arithmetic, spend-subtype signs, shared session, fuzzy shoulders), OpenAPI snapshot test, tenant-isolation test against a real database, CI hardening (ruff, audits, secret scanning, CodeQL, Dependabot), branch protection. | Nothing else is safe to change until the current behaviour is pinned down and the test suite touches Postgres. |
| 1. Measurement | One LLM gateway (`services/llm_client.py`) that every call goes through, with an `llm_calls` table (model, tokens, cost, latency, prompt version); a prompt registry; configurable thresholds; OpenTelemetry GenAI spans with content capture off; eval harness v2 that replays the production graph, not its own prompt; a committed baseline run with provenance; a CI replay gate. | The current harness measures a different prompt than production, and no number in the repo has provenance. Everything after this phase is judged by these measurements. |
| 2. Real-user readiness | Threat model; OAuth `state`, nonce and PKCE; HttpOnly session cookies through a same-origin proxy (dual-accept release first); Sign in with Xero (OIDC) with invitations that actually let invited members in; practices, clients and memberships; row-level security in Postgres; secret fail-fast and key rotation; Jinja autoescape and a WeasyPrint URL fetcher restricted to `data:`; Redis-backed rate limits; webhook replay protection; consent flow and a truthful privacy notice with the hosting region confirmed; retention and an append-only audit log enforced in the database. | Today any Xero login to a tenant gets the owner session, the JWT travels in a URL and lives in localStorage, and untrusted text reaches the PDF renderer. |
| 3. Reliability | Alembic as the sole schema authority (remove `create_all`); durable job queue with per-task sessions; embedding runtime parity test (torch versus ONNX); timeouts, retries, a Xero call budget and a circuit breaker; `/ready` plus uptime monitoring and SLOs; backups with a restore drill; runbooks; per-organisation AI budgets and a kill switch. | Batch runs share one database session across five concurrent tasks, and a dependency drift took the API down for an afternoon in October 2026. |
| 4. LLM core v2 | Model registry; native structured outputs instead of the Instructor tool-use path; precedent memory hygiene and an HNSW index; a routing experiment that actually measures Haiku-only, Sonnet-only and tiered; measured prompt caching; overnight Batch mode; calibration and a threshold policy; shadow, canary, default rollout. | The tiered routing is a reasoned design that has never been measured. |
| 5. The review layer | Conversations with two or three accountants first; HMRC knowledge base from Open Government Licence sources; hybrid retrieval (vector plus full text, reciprocal rank fusion, optional rerank); grounded answers with citations and refusal; a review-findings engine with evidence per finding; a planted-error eval; a review workspace; CSV and OFX statement import. | This is the product thesis: findings with cited guidance before quarter or VAT sign-off. It needs the measurement and safety work first. |
| 6. AI security | OWASP LLM Top 10 (2025) and agentic (2026) mapping; untrusted-input handling and a sanitiser for Xero text; output validation; tool tiers (read, propose, write); redaction with a leakage test; a red-team suite; lockfiles and an SBOM. | Transaction descriptions are attacker-controllable text that currently goes straight into the prompt. |
| 7. Agentic review | An ADR on agent versus workflow; a tool registry; a quarter-review agent (LangGraph with Claude tool use, human-in-the-loop, budgets); a hard-case categorisation mode adopted only if it wins its eval; agent evals; a run viewer. | "Agentic" is earned here, not before. The present graphs are fixed pipelines. |
| 8. Explainability | Evidence-based explanations (precedents, rules, figures) instead of model feature importances; retire the EBM; reliability reporting with calibrated confidence bands; an explanation-utility study with design partners; a feedback taxonomy and weekly error analysis. | The EBM path never produced output for multiclass data and trains on API data. |
| 9. MCP server | A remote MCP server (OAuth, the same tool registry, the same audit) so an accountant's own assistant can work the review; a tool-selection eval; connection docs. | Reuses the tool tiers from phase 6 and 7. |
| 10. Cloud evidence | Terraform for a free-tier GCP project (Artifact Registry, Cloud Run Jobs, Scheduler, Secret Manager, workload identity) running only public and synthetic workloads: knowledge-base ingest and scheduled eval replay. | Infrastructure-as-code evidence without putting client data in a second cloud. |
| 11. Guard classifier | A small PyTorch classifier for prompt-injection and manipulated descriptions, trained on public and synthetic data on a free GPU, exported to ONNX, benchmarked against regex and a Haiku judge, shipped behind a flag. | A compliant ML track: nothing trains on Xero data. |
| 12. Beta | Launch gate (all of the above green), Xero tier and certification decision, legal pack and ICO registration, design partners, product metrics, weekly quality review, incident drills, public docs. | The point at which a real practice could rely on it. |

## What would stay the same

The things the review confirmed are sound and that the roadmap builds on: tenant scoping on every authenticated
route, an audit row for every decision, `Decimal` money end to end, Xero traffic confined to one adapter that never
writes, HMAC-verified webhooks, encrypted tokens, a linear migration chain with real downgrades, and a frontend with
no XSS sinks.
