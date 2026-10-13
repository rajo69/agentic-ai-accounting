# Self-review, October 2026

In October 2026 I ran six parallel review passes over the repository: security and tenancy, backend correctness, AI
engineering, frontend, documentation honesty, and toolchain. All six used one evidence standard: file and line, quoted
code, severity, and whether the plan already knew. The passes ran as parallel Claude Code agents; every high finding
was then re-read in source and the numerical ones reproduced before being recorded, and I decided which findings to
accept and what to fix first. The pass produced 106 findings, 14 high and none critical, about 70% of them not previously known. A
66-row claim ledger graded every public statement TRUE, PARTLY, FALSE or UNVERIFIABLE; the README rewrite of
2026-10-10 resolved every FALSE and PARTLY row.

## Top findings and where they stand (updated 2026-10-11)

| Finding | Status |
|---|---|
| VAT summary arithmetic wrong by construction (rate applied to gross; unknown tax types default to 20%) | Open; the VAT figures are labelled indicative in the document |
| `SPEND-TRANSFER`, `-OVERPAYMENT`, `-PREPAYMENT` stored positive (only exact `SPEND` is negated) | Fixed with tests on both sync paths (2026-10-11); rows already stored correct themselves on a full re-sync, except statement lines, which need a one-off update |
| One `AsyncSession` shared by five concurrent graph tasks in both batch runners | Open; the fix is per-task sessions from `async_sessionmaker` |
| Categoriser persists the model's category name string; validation passes on code or name | Fixed with tests (2026-10-11): a match on code or name now stores the chart's own code and name. A prediction that matches nothing goes to review with the model's text; the next step is chart-constrained structured outputs |
| Fuzzy membership returns zero at the clamped extremes, so saturated inputs default to "medium" | Fixed with tests (2026-10-11): shoulder sets are full at their edge, so the most extreme inputs score high and the most ordinary low |
| EBM explanations never executed for three or more categories; placeholder bars were shown | UI gated on the real model type; the EBM is being retired |
| Identity: any Xero login to a tenant gets the owner session; invited members cannot sign in | Open; the fix is Sign in with Xero with memberships |
| Public numbers unverifiable and mutually inconsistent; privacy notice denied a data flow that happens | Fixed in the README, PORTFOLIO.md, the evals README and the privacy page (2026-10-10) |
| PDF templates render untrusted text without autoescaping, and WeasyPrint may fetch any URL | Fixed with tests (2026-10-11): autoescaping on, and a URL fetcher that serves only `data:` URIs and the templates folder |
| The consent screen requests three write scopes the app never uses | Fixed (2026-10-11): read-only scopes, guarded by a test |

## Reading the findings as a whole

The plumbing held up: tenancy scoping (all 29 authenticated operations take the organisation from the session), the audit trail, money types, the adapter boundary, migrations and CI. The
defects sat in the product's own differentiators, the parts least exercised by tests, which is where a reviewer should
look first. The unit tests mock the database session, so the tenant-isolation, batch-concurrency and VAT-arithmetic
findings needed this review to surface; a database-backed test layer is the next test phase.

The full finding list is private working material. The story of the review is in the [engineering record](ENGINEERING_RECORD.md#a-six-lens-review-of-my-own-repository).
