# Roadmap

What I would build next on AI Accountant, in order. It condenses a longer plan written in September 2026 and revised
after the October 2026 [self-review](SELF_REVIEW.md).

## Constraints the plan is built around

- **Xero developer terms.** API data may not be used to train, fine-tune, adapt or enhance AI models (clause 7(b)(i),
  in force for existing developers from 2 March 2026), and may not be passed to another third party without the
  user's consent (7(b)(ii)). Consequences: retire the EBM experiment, which trains on synced transactions; put
  precedent retrieval behind a flag until Xero confirms in writing that in-context examples are not "enhancing" a
  model; build evaluation datasets from generated and public data only, none taken from Xero; record consent before
  any transaction reaches Anthropic.
- **Money.** Free tiers everywhere except the existing hosting bill; a hard cap on Anthropic spend for the whole plan,
  with per-phase caps, Message Batches by default and replayed responses in CI.
- **Safety of change.** Every behaviour change ships behind a flag that is off in production; AI changes go shadow,
  then canary, then default; migrations are expand, migrate, contract, each with a tested downgrade; existing API
  paths and schemas never change.

## Phases

| Phase | What it delivers | Why it comes here |
|---|---|---|
| 0. Safe baseline | Baseline tag, production backup, characterisation tests for the open review findings (VAT arithmetic, the shared batch session), OpenAPI snapshot test, tenant-isolation test against a real database, CI hardening (ruff, audits, secret scanning, CodeQL, Dependabot), branch protection. | Every later change is judged against pinned behaviour and a test suite that queries Postgres. |
| 1. Measurement | One LLM gateway (`services/llm_client.py`) that every call goes through, with an `llm_calls` table (model, tokens, cost, latency, prompt version); a prompt registry; configurable thresholds; OpenTelemetry GenAI spans with content capture off; eval harness v2 that replays the production graph on [bookbench](https://github.com/rajo69/bookbench), a synthetic benchmark published as a draft in October 2026; a committed baseline run with provenance; a CI replay gate. | Everything after this phase is judged by these measurements. |
| 2. Practice and staff accounts | Threat model; OAuth `state`, nonce and PKCE; HttpOnly session cookies through a same-origin proxy (dual-accept release first); Sign in with Xero (OIDC) with invitations that let invited members in; practices, clients and memberships; row-level security in Postgres; secret fail-fast and key rotation; Redis-backed rate limits; webhook replay protection; a consent flow and a privacy notice that names the hosting region; retention and an append-only audit log enforced in the database. | Identity, sessions and tenancy move into the database, so each practice and each member sees only their own clients. |
| 3. Reliability | Alembic as the sole schema authority; a durable job queue with per-task sessions; an embedding runtime parity test (torch against ONNX); timeouts, retries, a Xero call budget and a circuit breaker; `/ready` plus uptime monitoring and SLOs; backups with a restore drill; runbooks; per-organisation AI budgets and a kill switch. | Batch runs, dependency changes and restores become routine operations, each with a runbook. |
| 4. LLM core v2 | Model registry; native structured outputs on the `claude-4` rollback profile too (the default `claude-5-5` profile already uses them); precedent memory hygiene and an HNSW index; a routing experiment that measures Haiku-only, Sonnet-only and tiered on bookbench once its labels are reviewed and frozen (on the draft labels they were compared on dev and on the held-out test split in October 2026); measured prompt caching; overnight Batch mode; calibration and a threshold policy; shadow, canary, default rollout. | The tiered routing gets its measured comparison, and the thresholds get a calibrated policy. |
| 5. The review layer | Conversations with two or three accountants first; an HMRC knowledge base from Open Government Licence sources; hybrid retrieval (vector plus full text, reciprocal rank fusion, optional rerank); grounded answers with citations and refusal; a review-findings engine with evidence per finding; a planted-error eval; a review workspace; CSV and OFX statement import. | This is the product thesis: findings with cited guidance before quarter or VAT sign-off. It builds on the measurement and safety work. |
| 6. AI security | OWASP LLM Top 10 (2025) and agentic (2026) mapping; untrusted-input handling and a sanitiser for Xero text; output validation; tool tiers (read, propose, write); redaction with a leakage test; a red-team suite; lockfiles and an SBOM. | Transaction descriptions are attacker-controllable text, so every model input and output gets a guard. |
| 7. Agentic review | An ADR on agent versus workflow; a tool registry; a quarter-review agent (LangGraph with Claude tool use, human-in-the-loop, budgets); a hard-case categorisation mode adopted only if it wins its eval; agent evals; a run viewer. | "Agentic" is earned here, with its own evals, on top of the fixed workflows that run today. |
| 8. Explainability | Evidence-based explanations (precedents, rules, figures) in place of model feature importances; retire the EBM; reliability reporting with calibrated confidence bands; an explanation-utility study with design partners; a feedback taxonomy and weekly error analysis. | Explanations a reviewer can check against the books. |
| 9. MCP server | A remote MCP server (OAuth, the same tool registry, the same audit) so an accountant's own assistant can work the review; a tool-selection eval; connection docs. | Reuses the tool tiers from phases 6 and 7. |
| 10. Cloud evidence | Terraform for a free-tier GCP project (Artifact Registry, Cloud Run Jobs, Scheduler, Secret Manager, workload identity) running only public and generated workloads: knowledge-base ingest and scheduled eval replay. | Infrastructure as code with no client data in a second cloud. |
| 11. Guard classifier | A small PyTorch classifier for prompt injection and manipulated descriptions, trained on public and generated data on a free GPU, exported to ONNX, benchmarked against regex and a Haiku judge, shipped behind a flag. | A compliant ML track: nothing trains on Xero data. |
| 12. Beta | Launch gate (all of the above green), Xero tier and certification decision, legal pack and ICO registration, design partners, product metrics, weekly quality review, incident drills, public docs. | Every earlier phase is green before a practice relies on it. |

## What stays the same

The things the October 2026 review confirmed and that the roadmap builds on: tenant scoping on every authenticated
route, an audit row for every decision, `Decimal` money end to end, Xero traffic confined to one adapter that never
writes, HMAC-verified webhooks, encrypted tokens, a linear migration chain with real downgrades, and a frontend with
no XSS sinks.
